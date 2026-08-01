const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");

const router = express.Router();
router.use(requireAuth);

function toOurDay(jsDay) {
  return (jsDay + 6) % 7; // our numbering: 0=Monday..6=Sunday
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get("/", async (req, res) => {
  const semesterId = req.query.semesterId;
  if (!semesterId) return res.status(400).json({ error: "semesterId is required" });

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const slots = await prisma.slot.findMany({
    where: { semesterId },
    include: { subject: true },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
  res.json({ slots });
});

router.get("/today", async (req, res) => {
  const semesterId = req.query.semesterId;
  if (!semesterId) return res.status(400).json({ error: "semesterId is required" });

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const dateParam = req.query.date ? new Date(req.query.date) : new Date();
  const today = startOfDay(dateParam);
  const ourDay = toOurDay(today.getDay());

  const [recurring, extras, records] = await Promise.all([
    prisma.slot.findMany({ where: { semesterId, day: ourDay, isExtra: false }, include: { subject: true } }),
    prisma.slot.findMany({ where: { semesterId, isExtra: true, extraDate: today }, include: { subject: true } }),
    prisma.attendanceRecord.findMany({ where: { semesterId, date: today } }),
  ]);

  const replacedIds = new Set(extras.map((e) => e.replacesSlotId).filter(Boolean));
  const visibleRecurring = recurring.filter((s) => !replacedIds.has(s.id));
  const allSlots = [...visibleRecurring, ...extras].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const recordBySlot = new Map(records.map((r) => [r.slotId, r]));
  const classes = allSlots.map((slot) => ({ slot, record: recordBySlot.get(slot.id) || null }));

  res.json({ date: today, classes });
});

// Get one slot's full detail (used by the attendance sheet to know
// which subject/semester it belongs to before rescheduling).
router.get("/:id", async (req, res) => {
  const slot = await prisma.slot.findUnique({
    where: { id: req.params.id },
    include: { subject: true },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  const semester = await getOwnedSemester(slot.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Slot not found" });

  res.json({ slot });
});

router.post(
  "/",
  [
    body("semesterId").isString().notEmpty(),
    body("subjectId").isString().notEmpty(),
    body("day").isInt({ min: 0, max: 6 }),
    body("startTime").matches(/^\d{2}:\d{2}$/),
    body("endTime").matches(/^\d{2}:\d{2}$/),
    body("room").optional().isString(),
    body("type").optional().isIn(["lecture", "tutorial", "practical"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const semester = await getOwnedSemester(req.body.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const subject = await prisma.subject.findFirst({ where: { id: req.body.subjectId, semesterId: semester.id } });
    if (!subject) return res.status(404).json({ error: "Subject not found in this semester" });

    const slot = await prisma.slot.create({
      data: {
        semesterId: semester.id,
        subjectId: subject.id,
        type: req.body.type || "lecture",
        day: req.body.day,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        room: req.body.room || null,
        prof: req.body.prof || null,
      },
    });
    res.status(201).json({ slot });
  }
);

router.post(
  "/extra",
  [
    body("semesterId").isString().notEmpty(),
    body("subjectId").isString().notEmpty(),
    body("date").isISO8601(),
    body("startTime").matches(/^\d{2}:\d{2}$/),
    body("endTime").matches(/^\d{2}:\d{2}$/),
    body("mode").isIn(["add", "replace"]),
    body("replacesSlotId").optional().isString(),
    body("room").optional().isString(),
    body("type").optional().isIn(["lecture", "tutorial", "practical"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    if (req.body.mode === "replace" && !req.body.replacesSlotId) {
      return res.status(400).json({ error: "replacesSlotId is required when mode is 'replace'" });
    }

    const semester = await getOwnedSemester(req.body.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const subject = await prisma.subject.findFirst({ where: { id: req.body.subjectId, semesterId: semester.id } });
    if (!subject) return res.status(404).json({ error: "Subject not found in this semester" });

    const extraDate = startOfDay(req.body.date);
    const day = toOurDay(extraDate.getDay());

    const slot = await prisma.slot.create({
      data: {
        semesterId: semester.id,
        subjectId: subject.id,
        type: req.body.type || "lecture",
        day,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        room: req.body.room || null,
        prof: req.body.prof || null,
        isExtra: true,
        extraDate,
        replacesSlotId: req.body.mode === "replace" ? req.body.replacesSlotId : null,
      },
    });
    res.status(201).json({ slot });
  }
);

router.patch(
  "/:id",
  [
    body("day").optional().isInt({ min: 0, max: 6 }),
    body("startTime").optional().matches(/^\d{2}:\d{2}$/),
    body("endTime").optional().matches(/^\d{2}:\d{2}$/),
    body("room").optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const semester = await getOwnedSemester(slot.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Slot not found" });

    const updated = await prisma.slot.update({
      where: { id: slot.id },
      data: {
        day: req.body.day ?? slot.day,
        startTime: req.body.startTime ?? slot.startTime,
        endTime: req.body.endTime ?? slot.endTime,
        room: req.body.room ?? slot.room,
        prof: req.body.prof ?? slot.prof,
      },
    });
    res.json({ slot: updated });
  }
);

router.delete("/:id", async (req, res) => {
  const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  const semester = await getOwnedSemester(slot.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Slot not found" });

  await prisma.slot.delete({ where: { id: slot.id } });
  res.json({ success: true });
});

module.exports = router;