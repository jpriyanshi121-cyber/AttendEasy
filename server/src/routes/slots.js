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
  // UTC-explicit on purpose — setHours() uses the server process's local
  // timezone, which we can't fully guarantee is UTC. The rest of the app
  // stores/compares bare "YYYY-MM-DD" dates as UTC midnight, so this must
  // match that exactly or extraDate lookups (e.g. the reminder scheduler)
  // silently miss.
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// "Today" (when no explicit ?date= is given) has to be computed in IST,
// not the server's own clock — Render (and most hosts) run the process
// in UTC, so during roughly midnight to 5:30 AM IST every day, the UTC
// calendar date is still "yesterday". Falling through to startOfDay(new
// Date()) here used to make the Home screen's "Today's Classes" show
// yesterday's timetable for that entire window each night. See the
// identical fix in scheduler.js's toIST() / stats.js's todayISTDateStr().
function todayISTDateStr() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// A timetable slot can't share a day + overlapping time with another
// recurring slot — whether that slot belongs to the same subject or a
// different one. Returns the first conflicting slot (with its subject
// attached) or null.
async function findConflictingSlot(semesterId, day, startTime, endTime, excludeSlotId) {
  const candidates = await prisma.slot.findMany({
    where: {
      semesterId,
      day,
      isExtra: false,
      ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}),
    },
    include: { subject: true },
  });
  const start = timeToMin(startTime);
  const end = timeToMin(endTime);
  return candidates.find((s) => timeToMin(s.startTime) < end && start < timeToMin(s.endTime)) || null;
}

function conflictMessage(conflict) {
  return `This time slot conflicts with ${conflict.subject.name} (${conflict.startTime}\u2013${conflict.endTime}). Please choose another time.`;
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

  const dateParam = req.query.date ? new Date(req.query.date) : new Date(todayISTDateStr());
  const today = startOfDay(dateParam);
  const ourDay = toOurDay(today.getUTCDay());

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

    if (timeToMin(req.body.endTime) <= timeToMin(req.body.startTime)) {
      return res.status(400).json({ error: "End time must be after start time." });
    }

    const semester = await getOwnedSemester(req.body.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const subject = await prisma.subject.findFirst({ where: { id: req.body.subjectId, semesterId: semester.id } });
    if (!subject) return res.status(404).json({ error: "Subject not found in this semester" });

    const conflict = await findConflictingSlot(semester.id, req.body.day, req.body.startTime, req.body.endTime);
    if (conflict) return res.status(409).json({ error: conflictMessage(conflict) });

    const slotType = req.body.type || "lecture";
    const slot = await prisma.slot.create({
      data: {
        semesterId: semester.id,
        subjectId: subject.id,
        type: slotType,
        day: req.body.day,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        room: req.body.room || null,
        prof: req.body.prof || null,
      },
      include: { subject: true },
    });

    const flagField = slotType === "practical" ? "hasPractical" : slotType === "tutorial" ? "hasTutorial" : "hasLecture";
    if (!subject[flagField]) {
      await prisma.subject.update({ where: { id: subject.id }, data: { [flagField]: true } });
      slot.subject[flagField] = true;
    }

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
    const day = toOurDay(extraDate.getUTCDay());

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
    body("type").optional().isIn(["lecture", "tutorial", "practical"]),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    const semester = await getOwnedSemester(slot.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Slot not found" });

    const day = req.body.day ?? slot.day;
    const startTime = req.body.startTime ?? slot.startTime;
    const endTime = req.body.endTime ?? slot.endTime;

    if (timeToMin(endTime) <= timeToMin(startTime)) {
      return res.status(400).json({ error: "End time must be after start time." });
    }

    if (!slot.isExtra) {
      const conflict = await findConflictingSlot(semester.id, day, startTime, endTime, slot.id);
      if (conflict) return res.status(409).json({ error: conflictMessage(conflict) });
    }

    const updated = await prisma.slot.update({
      where: { id: slot.id },
      data: {
        type: req.body.type ?? slot.type,
        day,
        startTime,
        endTime,
        room: req.body.room ?? slot.room,
        prof: req.body.prof ?? slot.prof,
      },
      include: { subject: true },
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