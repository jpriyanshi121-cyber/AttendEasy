const express = require("express");
const { body, query, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");
const { computeStats, thresholdForType, countRemainingClasses } = require("../lib/stats");
const PDFDocument = require("pdfkit");

// Converts a hue (0-360), saturation (%), lightness (%) into a pastel hex
// color, so the calendar can compute a smooth green→red gradient per day
// instead of picking from a fixed set of colors.
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; // normalize, handles negative hues safely
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Smooth continuous gradient through 3 anchors: green (all present) →
// yellow (exactly balanced, 50/50) → red (all absent). A pure straight
// line across the whole range can't hit true yellow at the midpoint
// without this, since green and red aren't equidistant in hue-degrees.
function ratioToHue(ratio) {
  const GREEN = 150, YELLOW = 48, RED = -5;
  if (ratio >= 0.5) {
    const t = (ratio - 0.5) / 0.5; // 0 at balanced, 1 at all-present
    return YELLOW + (GREEN - YELLOW) * t;
  }
  const t = ratio / 0.5; // 0 at all-absent, 1 at balanced
  return RED + (YELLOW - RED) * t;
}

const router = express.Router();
router.use(requireAuth);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Builds a "YYYY-MM-DD" key using the server's LOCAL calendar date —
// matching how startOfDay() stores records — instead of toISOString(),
// which converts to UTC first and can land on the wrong day (e.g. IST
// midnight becomes the previous day in UTC).
function localDateKey(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

const VALID_STATUSES = ["present", "absent", "cancelled", "rescheduled"];
const VALID_TAGS = ["holiday", "prof_absent", "exam", "other"];

router.post(
  "/mark",
  [
    body("slotId").isString().notEmpty(),
    body("date").isISO8601(),
    body("status").isIn(VALID_STATUSES),
    body("tag").optional().isIn(VALID_TAGS),
    body("note").optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const slot = await prisma.slot.findUnique({ where: { id: req.body.slotId } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const semester = await getOwnedSemester(slot.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Slot not found" });

    const date = startOfDay(req.body.date);

    const record = await prisma.attendanceRecord.upsert({
      where: { slotId_date: { slotId: slot.id, date } },
      update: { status: req.body.status, tag: req.body.tag || null, note: req.body.note || null },
      create: {
        semesterId: slot.semesterId,
        subjectId: slot.subjectId,
        slotId: slot.id,
        date,
        status: req.body.status,
        tag: req.body.tag || null,
        note: req.body.note || null,
      },
    });

    res.status(201).json({ record });
  }
);

router.get("/", [query("subjectId").isString().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const subject = await prisma.subject.findUnique({ where: { id: req.query.subjectId } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  const semester = await getOwnedSemester(subject.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Subject not found" });

  const records = await prisma.attendanceRecord.findMany({
    where: { subjectId: subject.id },
    include: { slot: true },
    orderBy: { date: "desc" },
  });
  res.json({ records });
});

router.get("/stats/subject/:subjectId", async (req, res) => {
  const subject = await prisma.subject.findUnique({ where: { id: req.params.subjectId } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  const semester = await getOwnedSemester(subject.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Subject not found" });

  const records = await prisma.attendanceRecord.findMany({
    where: { subjectId: subject.id },
    include: { slot: true },
  });

  const existingTypes = await prisma.slot.findMany({
    where: { subjectId: subject.id },
    distinct: ["type"],
    select: { type: true },
  });
  const typesPresent = existingTypes.map((t) => t.type);

  const breakdown = {};
  for (const type of ["lecture", "tutorial", "practical"]) {
    if (!typesPresent.includes(type)) continue;
    const typeRecords = records.filter((r) => (r.slot?.type || "lecture") === type);
    const stats = computeStats(typeRecords, thresholdForType(subject, type));

    const remaining = await countRemainingClasses(prisma, {
      subjectId: subject.id, semesterId: semester.id, type, endDate: semester.endDate,
    });
    stats.remainingClasses = remaining;

    if (remaining !== null) {
      stats.canMissMore = Math.min(stats.canMissMore, remaining);
      if (!stats.impossible && stats.needToAttend > remaining) {
        // Even attending every remaining class this semester, the
        // threshold can't be reached — show what IS achievable instead
        // of a misleadingly large "attend X more" number.
        const bestHeld = stats.held + remaining;
        const bestPresent = stats.attended + remaining;
        stats.maxAchievablePercentage = bestHeld === 0 ? 0 : Math.round((bestPresent / bestHeld) * 10000) / 100;
        stats.impossible = true;
      }
    }

    breakdown[type] = stats;
  }

  const overall = computeStats(records, 75);
  res.json({ subject, overall, breakdown });
});

router.get("/stats/overview", async (req, res) => {
  const semesterId = req.query.semesterId;
  if (!semesterId) return res.status(400).json({ error: "semesterId is required" });

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const subjects = await prisma.subject.findMany({
    where: { semesterId, archived: false },
  });

  // One card per class-component (Theory/Tutorial/Lab) instead of one
  // combined card per subject — a subject with both Theory and Lab slots
  // gets two entries here, each with its own stats/status; a subject with
  // only one component still gets just one entry.
  const cardLists = await Promise.all(
    subjects.map(async (subject) => {
      const records = await prisma.attendanceRecord.findMany({
        where: { subjectId: subject.id },
        include: { slot: true },
      });

      const byType = { lecture: [], tutorial: [], practical: [] };
      for (const r of records) {
        const t = r.slot?.type || "lecture";
        if (byType[t]) byType[t].push(r);
      }

      const existingTypes = await prisma.slot.findMany({
        where: { subjectId: subject.id },
        distinct: ["type"],
        select: { type: true },
      });
      const typesWithSlots = existingTypes.map((t) => t.type);
      // Before any slots exist yet, fall back to whichever components the
      // subject was configured with at creation, so it still shows a card.
      const configuredTypes = ["lecture", "tutorial", "practical"].filter((t) =>
        t === "lecture" ? subject.hasLecture : t === "tutorial" ? subject.hasTutorial : subject.hasPractical
      );
      const components = (typesWithSlots.length ? typesWithSlots : configuredTypes).filter((t) =>
        ["lecture", "tutorial", "practical"].includes(t)
      );
      if (components.length === 0) components.push("lecture");

      return components.map((type) => {
        const threshold = thresholdForType(subject, type);
        const stats = computeStats(byType[type], threshold);
        let status = "green";
        if (byType[type].length > 0) {
          if (stats.percentage < threshold - 10) status = "red";
          else if (stats.percentage < threshold) status = "amber";
        }
        return { subject, type, stats, status };
      });
    })
  );
  const perSubject = cardLists.flat();

  const allRecords = await prisma.attendanceRecord.findMany({ where: { semesterId }, include: { slot: true } });
  const overall = computeStats(allRecords, 75);

  res.json({ overall, subjects: perSubject });
});

router.get("/calendar", async (req, res) => {
  const semesterId = req.query.semesterId;
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);

  if (!semesterId || !year || !month) {
    return res.status(400).json({ error: "semesterId, year, and month are required" });
  }

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const records = await prisma.attendanceRecord.findMany({ where: { semesterId, date: { gte: start, lt: end } } });

  const byDay = new Map();
  for (const r of records) {
    const key = localDateKey(r.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }

  const days = Array.from(byDay.entries()).map(([date, dayRecords]) => {
    const present = dayRecords.filter((r) => r.status === "present").length;
    const absent = dayRecords.filter((r) => r.status === "absent").length;
    const held = present + absent; // cancelled classes never affect the ratio

    let color;
    if (held === 0) {
      // Every class that day was cancelled.
      color = { bg: "#EFEDF2", fg: "#8A8194" };
    } else {
      const ratio = present / held; // 1 = all present, 0 = all absent
      const hue = ratioToHue(ratio);
      color = { bg: hslToHex(hue, 40, 92), fg: hslToHex(hue, 42, 38) };
    }

    return { date, color, classCount: dayRecords.length, present, absent };
  });

  res.json({ days });
});

// All attendance records for one specific date (used when a calendar
// day is tapped, to show that day's classes in detail).
router.get("/day", async (req, res) => {
  const semesterId = req.query.semesterId;
  const dateParam = req.query.date;
  if (!semesterId || !dateParam) {
    return res.status(400).json({ error: "semesterId and date are required" });
  }

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const date = startOfDay(dateParam);
  const records = await prisma.attendanceRecord.findMany({
    where: { semesterId, date },
    include: { slot: { include: { subject: true } } },
  });
  res.json({ records });
});

// Generate a PDF attendance report for the active semester.
router.get("/report/pdf", async (req, res) => {
  const semesterId = req.query.semesterId;
  if (!semesterId) return res.status(400).json({ error: "semesterId is required" });

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, email: true, college: true, course: true } });

  const subjects = await prisma.subject.findMany({ where: { semesterId, archived: false }, orderBy: { createdAt: "asc" } });
  const perSubject = await Promise.all(
    subjects.map(async (subject) => {
      const records = await prisma.attendanceRecord.findMany({
        where: { subjectId: subject.id },
        include: { slot: true },
        orderBy: { date: "asc" },
      });
      const byType = { lecture: [], tutorial: [], practical: [] };
      for (const r of records) {
        const t = r.slot?.type || "lecture";
        if (byType[t]) byType[t].push(r);
      }
      const components = ["lecture", "tutorial", "practical"]
        .filter((t) => (t === "lecture" ? subject.hasLecture : t === "tutorial" ? subject.hasTutorial : subject.hasPractical))
        .map((type) => ({ type, stats: computeStats(byType[type], thresholdForType(subject, type)) }));
      return { subject, components, recordCount: records.length };
    })
  );
  const allRecords = await prisma.attendanceRecord.findMany({ where: { semesterId }, include: { slot: true } });
  const overall = computeStats(allRecords, 75);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="attendance-report-${semester.name.replace(/\s+/g, "-")}.pdf"`);

  const doc = new PDFDocument({ margin: 44, size: "A4", bufferPages: true });
  doc.pipe(res);

  const PURPLE = "#6E4F91";
  const INK = "#1B1530";
  const MUTE = "#8A8194";
  const LINE = "#E7E0F0";
  const SAFE = "#2F7A5C";
  const WARN = "#B8823A";
  const DANGER = "#B03A45";
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const typeLabels = { lecture: "Theory", tutorial: "Tutorial", practical: "Lab" };
  const tierColor = (pct) => (pct >= 75 ? SAFE : pct >= 50 ? WARN : DANGER);
  const fmtPct = (n) => (Number.isInteger(n) ? `${n}%` : `${n.toFixed(2).replace(/\.?0+$/, "")}%`);

  function footer() {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(MUTE).font("Helvetica").text(
        `Generated on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}  ·  Page ${i + 1} of ${range.count}`,
        doc.page.margins.left, doc.page.height - 34,
        { width: pageWidth, align: "center" }
      );
    }
  }

  // ── Header ──
  doc.fontSize(22).fillColor(PURPLE).font("Helvetica-Bold").text("AttendEasy", doc.page.margins.left, doc.y, { lineBreak: false });
  doc.fontSize(10).fillColor(MUTE).font("Helvetica").text("Attendance Report", doc.page.margins.left, doc.y + 26, { lineBreak: false });
  doc.y += 26 + 14;

  const collegeCourseLine = [user?.college, user?.course].filter(Boolean).join("  ·  ");
  if (collegeCourseLine) {
    doc.fontSize(9.5).fillColor(MUTE).font("Helvetica").text(collegeCourseLine, doc.page.margins.left, doc.y, { lineBreak: false });
    doc.y += 13;
  }
  doc.fontSize(9.5).fillColor(MUTE).font("Helvetica").text(semester.name, doc.page.margins.left, doc.y, { lineBreak: false });
  doc.y += 20;
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).lineWidth(0.75).stroke();
  doc.y += 14;

  doc.fontSize(9).fillColor(INK).font("Helvetica-Bold").text(user?.name || "", doc.page.margins.left, doc.y, { lineBreak: false, continued: !!user?.email });
  if (user?.email) {
    doc.font("Helvetica").fillColor(MUTE).text(`   ·   ${user.email}`, { lineBreak: false });
  }
  doc.y += 20;
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).lineWidth(1).stroke();
  doc.y += 22;

  // ── Overall summary card ──
  const cardY = doc.y;
  const cardH = 74;
  doc.roundedRect(doc.page.margins.left, cardY, pageWidth, cardH, 8).fillAndStroke("#F7F2FC", LINE);
  const pct = overall.percentage;
  const pctColor = tierColor(pct);
  doc.fontSize(26).fillColor(pctColor).font("Helvetica-Bold").text(fmtPct(pct), doc.page.margins.left + 20, cardY + 22, { lineBreak: false });
  doc.fontSize(8.5).fillColor(MUTE).font("Helvetica").text("OVERALL", doc.page.margins.left + 20, cardY + 54, { lineBreak: false });

  const statBoxes = [
    { label: "Held", v: overall.held },
    { label: "Attended", v: overall.attended },
    { label: "Missed", v: overall.missed },
    { label: "Cancelled", v: overall.cancelled },
  ];
  const statAreaX = doc.page.margins.left + 190;
  const statAreaW = pageWidth - 190 - 20;
  const boxW = statAreaW / statBoxes.length;
  statBoxes.forEach((s, i) => {
    const bx = statAreaX + i * boxW;
    doc.fontSize(18).fillColor(INK).font("Helvetica-Bold").text(String(s.v), bx, cardY + 18, { width: boxW, align: "center", lineBreak: false });
    doc.fontSize(8).fillColor(MUTE).font("Helvetica").text(s.label.toUpperCase(), bx, cardY + 42, { width: boxW, align: "center", lineBreak: false });
  });
  doc.y = cardY + cardH + 24;

  // ── Per-subject table ──
  doc.fontSize(13).fillColor(INK).font("Helvetica-Bold").text("Subject-wise Breakdown", doc.page.margins.left, doc.y, { lineBreak: false });
  doc.y += 22;

  const colX = {
    subject: doc.page.margins.left,
    component: doc.page.margins.left + 145,
    pct: doc.page.margins.left + 235,
    attended: doc.page.margins.left + 305,
    missed: doc.page.margins.left + 375,
    cancelled: doc.page.margins.left + 445,
  };
  const ROW_H = 19;

  function tableHeader() {
    const y = doc.y;
    doc.fontSize(8.5).fillColor(MUTE).font("Helvetica-Bold");
    doc.text("SUBJECT", colX.subject, y, { lineBreak: false });
    doc.text("COMPONENT", colX.component, y, { lineBreak: false });
    doc.text("ATTENDANCE", colX.pct, y, { lineBreak: false });
    doc.text("PRESENT", colX.attended, y, { lineBreak: false });
    doc.text("ABSENT", colX.missed, y, { lineBreak: false });
    doc.text("CANCELLED", colX.cancelled, y, { lineBreak: false });
    doc.y = y + 14;
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).lineWidth(1).stroke();
    doc.y += 10;
  }

  tableHeader();

  // Every (subject, component) pairing that's below its own threshold —
  // collected once here, rendered once in the section below the table.
  const belowThreshold = [];

  perSubject.forEach(({ subject, components }) => {
    const groupH = components.length * ROW_H;
    if (doc.y + groupH > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      tableHeader();
    }
    const groupY = doc.y;
    const nameFontSize = 9.5;
    doc.fontSize(nameFontSize).fillColor(INK).font("Helvetica-Bold").text(
      subject.name, colX.subject, groupY + (groupH - nameFontSize) / 2 - 1,
      { width: colX.component - colX.subject - 8, lineBreak: false }
    );

    components.forEach(({ type, stats }, idx) => {
      const rowY = groupY + idx * ROW_H;
      const rowColor = tierColor(stats.percentage);

      doc.fontSize(9).fillColor(MUTE).font("Helvetica").text(typeLabels[type], colX.component, rowY, { lineBreak: false });
      doc.fontSize(9.5).fillColor(rowColor).font("Helvetica-Bold").text(fmtPct(stats.percentage), colX.pct, rowY, { lineBreak: false });
      doc.fontSize(9).fillColor(INK).font("Helvetica");
      doc.text(String(stats.attended), colX.attended, rowY, { lineBreak: false });
      doc.text(String(stats.missed), colX.missed, rowY, { lineBreak: false });
      doc.text(String(stats.cancelled), colX.cancelled, rowY, { lineBreak: false });

      if (stats.percentage < stats.threshold) {
        belowThreshold.push({ label: `${subject.name} · ${typeLabels[type]}`, pct: fmtPct(stats.percentage) });
      }
    });

    doc.y = groupY + groupH;
  });

  if (perSubject.length === 0) {
    doc.fontSize(10).fillColor(MUTE).font("Helvetica").text("No subjects added yet.", doc.page.margins.left, doc.y, { lineBreak: false });
    doc.y += 16;
  }

  // ── Color-tier legend ──
  doc.y += 12;
  if (doc.y > doc.page.height - doc.page.margins.bottom - 40) { doc.addPage(); doc.y = doc.page.margins.top; }
  {
    const legendY = doc.y;
    const legend = [
      { c: SAFE,   l: "≥ 75%" },
      { c: WARN,   l: "50–74%" },
      { c: DANGER, l: "< 50%" },
    ];
    let lx = doc.page.margins.left;
    legend.forEach(item => {
      doc.circle(lx + 4, legendY + 5, 4).fill(item.c);
      doc.fontSize(8.5).fillColor(MUTE).font("Helvetica").text(item.l, lx + 13, legendY, { lineBreak: false });
      lx += 13 + doc.widthOfString(item.l) + 18;
    });
    doc.y = legendY + 22;
  }

  // ── Subjects below threshold ──
  if (belowThreshold.length > 0) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 80) { doc.addPage(); doc.y = doc.page.margins.top; }
    doc.fontSize(11).fillColor(INK).font("Helvetica-Bold").text("Subjects Below 75% Threshold", doc.page.margins.left, doc.y, { lineBreak: false });
    doc.y += 20;

    const colGap = 16;
    const colW = (pageWidth - colGap) / 2;
    const rowH = 16;
    let baseY = doc.y;
    let pageStartIndex = 0;
    belowThreshold.forEach((item, i) => {
      const col = (i - pageStartIndex) % 2;
      const row = Math.floor((i - pageStartIndex) / 2);
      if (col === 0 && baseY + row * rowH + rowH > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        baseY = doc.page.margins.top;
        pageStartIndex = i;
      }
      const thisRow = Math.floor((i - pageStartIndex) / 2);
      const thisCol = (i - pageStartIndex) % 2;
      const x = doc.page.margins.left + thisCol * (colW + colGap);
      const y = baseY + thisRow * rowH;
      doc.fontSize(9).font("Helvetica");
      const labelW = doc.widthOfString(item.label);
      doc.fillColor(INK).text(item.label, x, y, { lineBreak: false });
      doc.fillColor(DANGER).font("Helvetica-Bold").text(`  ${item.pct}`, x + labelW, y, { lineBreak: false });
    });
    const rowsOnLastPage = Math.ceil((belowThreshold.length - pageStartIndex) / 2);
    doc.y = baseY + rowsOnLastPage * rowH + 4;
  }

  footer();
  doc.end();
});

router.delete("/:id", async (req, res) => {
  const record = await prisma.attendanceRecord.findUnique({ where: { id: req.params.id } });
  if (!record) return res.status(404).json({ error: "Record not found" });
  const semester = await getOwnedSemester(record.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Record not found" });

  await prisma.attendanceRecord.delete({ where: { id: record.id } });
  res.json({ success: true });
});

module.exports = router;