const express = require("express");
const { body, query, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");
const { computeStats } = require("../lib/stats");

const router = express.Router();
router.use(requireAuth);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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

  const records = await prisma.attendanceRecord.findMany({ where: { subjectId: subject.id } });
  const stats = computeStats(records, subject.threshold);
  res.json({ subject, stats });
});

router.get("/stats/overview", async (req, res) => {
  const semesterId = req.query.semesterId;
  if (!semesterId) return res.status(400).json({ error: "semesterId is required" });

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const subjects = await prisma.subject.findMany({ where: { semesterId, archived: false } });

  const perSubject = await Promise.all(
    subjects.map(async (subject) => {
      const records = await prisma.attendanceRecord.findMany({ where: { subjectId: subject.id } });
      const stats = computeStats(records, subject.threshold);
      const status =
        stats.percentage >= subject.threshold ? "green" : stats.percentage >= subject.threshold - 10 ? "amber" : "red";
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
    const key = r.date.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }

  const days = Array.from(byDay.entries()).map(([date, dayRecords]) => {
    const present = dayRecords.filter((r) => r.status === "present").length;
    const absent = dayRecords.filter((r) => r.status === "absent").length;
    const allCancelled = dayRecords.every((r) => r.status === "cancelled");
    let color;
    if (allCancelled) color = "grey";
    else if (absent === 0) color = "green";
    else color = "red";
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

module.exports = router;