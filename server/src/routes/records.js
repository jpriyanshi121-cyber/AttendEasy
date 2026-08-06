const express = require("express");
const { body, query, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");
const { computeStats, thresholdForType } = require("../lib/stats");
const PDFDocument = require("pdfkit");

// Converts a hue (0-360), saturation (%), lightness (%) into a pastel hex
// color, so the calendar can compute a smooth green→red gradient per day
// instead of picking from a fixed set of colors.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
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
    breakdown[type] = computeStats(typeRecords, thresholdForType(subject, type));
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

  const perSubject = await Promise.all(
    subjects.map(async (subject) => {
      const records = await prisma.attendanceRecord.findMany({
        where: { subjectId: subject.id },
        include: { slot: true },
      });
      const stats = computeStats(records, 75);

      const byType = { lecture: [], tutorial: [], practical: [] };
      for (const r of records) {
        const t = r.slot?.type || "lecture";
        if (byType[t]) byType[t].push(r);
      }

      let status = "green";
      for (const type of ["lecture", "tutorial", "practical"]) {
        if (byType[type].length === 0) continue;
        const threshold = thresholdForType(subject, type);
        const typeStats = computeStats(byType[type], threshold);
        if (typeStats.percentage < threshold - 10) { status = "red"; break; }
        if (typeStats.percentage < threshold) status = "amber";
      }

      return { subject, stats, status };
    })
  );

  const allRecords = await prisma.attendanceRecord.findMany({ where: { semesterId } });
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
      // Hue endpoints matched to the app's actual green/red tones (150° and
      // ~355°) instead of pure spectral 120°/0°, so the gradient stays in
      // the same soft palette as the rest of the UI instead of looking neon.
      const hue = -5 + ratio * 155;
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

  const subjects = await prisma.subject.findMany({ where: { semesterId, archived: false } });
  const perSubject = await Promise.all(
    subjects.map(async (subject) => {
      const records = await prisma.attendanceRecord.findMany({ where: { subjectId: subject.id } });
      return { subject, stats: computeStats(records, subject.threshold) };
    })
  );
  const allRecords = await prisma.attendanceRecord.findMany({ where: { semesterId } });
  const overall = computeStats(allRecords, 75);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="attendance-report-${semester.name.replace(/\s+/g, "-")}.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text("AttendEasy — Attendance Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor("#666").text(semester.name, { align: "center" });
  doc.moveDown(1.5);

  doc.fillColor("#000").fontSize(14).text(`Overall Attendance: ${overall.percentage}%`);
  doc.fontSize(11).fillColor("#444").text(`Attended ${overall.attended} of ${overall.held} held classes`);
  doc.moveDown(1);

  doc.fillColor("#000").fontSize(14).text("Subject-wise Breakdown");
  doc.moveDown(0.5);

  perSubject.forEach(({ subject, stats }) => {
    doc.fontSize(12).fillColor("#000").text(`${subject.name} (min ${subject.threshold}%)`);
    doc.fontSize(10).fillColor("#444").text(
      `  ${stats.percentage}% — Attended ${stats.attended}, Missed ${stats.missed}, Cancelled ${stats.cancelled}, Total ${stats.total}`
    );
    doc.moveDown(0.6);
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#999").text(`Generated on ${new Date().toLocaleDateString("en-IN")}`, { align: "right" });

  doc.end();
});

module.exports = router;