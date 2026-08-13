const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");

const router = express.Router();
router.use(requireAuth);

// List all semesters for the logged-in user (active first, then archived newest-first)
router.get("/", async (req, res) => {
  const semesters = await prisma.semester.findMany({
    where: { userId: req.userId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  res.json({ semesters });
});

// Get one semester's full detail (subjects + slots). Works for
// archived semesters too — the frontend renders those read-only.
router.get("/:id", async (req, res) => {
  const semester = await getOwnedSemester(req.params.id, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const [subjects, slots] = await Promise.all([
    prisma.subject.findMany({ where: { semesterId: semester.id, archived: false } }),
    prisma.slot.findMany({ where: { semesterId: semester.id } }),
  ]);

  res.json({ semester, subjects, slots });
});

// Start a new semester: archives the current active one and creates
// a fresh active semester with no subjects/slots (user re-onboards).
router.post(
  "/start-new",
  [body("name").optional().trim()],
  async (req, res) => {
    const current = await prisma.semester.findFirst({
      where: { userId: req.userId, isActive: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.semester.update({
          where: { id: current.id },
          data: { isActive: false, archivedAt: new Date(), endDate: new Date() },
        });
      }
      return tx.semester.create({
        data: {
          userId: req.userId,
          name: req.body.name || "New Semester",
          startDate: new Date(),
          isActive: true,
        },
      });
    });

    res.status(201).json({ semester: result });
  }
);

// Rename a semester and/or set its start/end date (current or archived).
router.patch(
  "/:id",
  [
    body("name").optional().trim().isLength({ min: 1 }).withMessage("Name cannot be empty"),
    body("startDate").optional().isISO8601(),
    body("endDate").optional({ nullable: true }).isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const semester = await getOwnedSemester(req.params.id, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.startDate !== undefined) data.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) data.endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    const updated = await prisma.semester.update({ where: { id: semester.id }, data });
    res.json({ semester: updated });
  }
);

// Delete an archived semester and everything under it (subjects, slots,
// attendance records, holidays — cascades via the schema's onDelete rules).
// The active semester can't be deleted this way: archive it first via
// /start-new, which also guarantees the user is never left with zero
// semesters or an orphaned "no active semester" state.
router.delete("/:id", async (req, res) => {
  const semester = await getOwnedSemester(req.params.id, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });
  if (semester.isActive) {
    return res.status(400).json({ error: "Can't delete the active semester. Archive it first from Manage Semesters." });
  }

  await prisma.semester.delete({ where: { id: semester.id } });
  res.json({ success: true });
});

module.exports = router;