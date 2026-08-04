const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  let semesterId = req.query.semesterId;

  if (!semesterId) {
    const active = await prisma.semester.findFirst({
      where: { userId: req.userId, isActive: true },
    });
    if (!active) return res.status(404).json({ error: "No active semester found" });
    semesterId = active.id;
  }

  const semester = await getOwnedSemester(semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const subjects = await prisma.subject.findMany({
    where: { semesterId, archived: false },
    orderBy: { createdAt: "asc" },
  });
  res.json({ subjects });
});

router.post(
  "/",
  [
    body("semesterId").isString().notEmpty(),
    body("name").trim().isLength({ min: 1 }).withMessage("Subject name is required"),
    body("color").optional().isString(),
    body("hasLecture").optional().isBoolean(),
    body("hasTutorial").optional().isBoolean(),
    body("hasPractical").optional().isBoolean(),
    body("thresholdLecture").optional().isInt({ min: 0, max: 100 }),
    body("thresholdTutorial").optional().isInt({ min: 0, max: 100 }),
    body("thresholdPractical").optional().isInt({ min: 0, max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const hasLecture = req.body.hasLecture ?? true;
    const hasTutorial = req.body.hasTutorial ?? false;
    const hasPractical = req.body.hasPractical ?? false;
    if (!hasLecture && !hasTutorial && !hasPractical) {
      return res.status(400).json({ error: "Select at least one class type." });
    }

    const semester = await getOwnedSemester(req.body.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const subject = await prisma.subject.create({
      data: {
        semesterId: semester.id,
        name: req.body.name,
        code: req.body.code || null,
        color: req.body.color || "#6366f1",
        hasLecture,
        hasTutorial,
        hasPractical,
        thresholdLecture: req.body.thresholdLecture || 75,
        thresholdTutorial: req.body.thresholdTutorial || 75,
        thresholdPractical: req.body.thresholdPractical || 75,
      },
    });
    res.status(201).json({ subject });
  }
);

router.patch(
  "/:id",
  [
    body("name").optional().trim().isLength({ min: 1 }),
    body("color").optional().isString(),
    body("thresholdLecture").optional().isInt({ min: 0, max: 100 }),
    body("thresholdTutorial").optional().isInt({ min: 0, max: 100 }),
    body("thresholdPractical").optional().isInt({ min: 0, max: 100 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    const semester = await getOwnedSemester(subject.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Subject not found" });

    const updated = await prisma.subject.update({
      where: { id: subject.id },
      data: {
        name: req.body.name ?? subject.name,
        code: req.body.code ?? subject.code,
        color: req.body.color ?? subject.color,
        thresholdLecture: req.body.thresholdLecture ?? subject.thresholdLecture,
        thresholdTutorial: req.body.thresholdTutorial ?? subject.thresholdTutorial,
        thresholdPractical: req.body.thresholdPractical ?? subject.thresholdPractical,
      },
    });
    res.json({ subject: updated });
  }
);

router.delete("/:id", async (req, res) => {
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  const semester = await getOwnedSemester(subject.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Subject not found" });

  await prisma.subject.update({ where: { id: subject.id }, data: { archived: true } });
  res.json({ success: true });
});

module.exports = router;