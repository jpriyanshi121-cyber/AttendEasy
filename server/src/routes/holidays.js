const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getOwnedSemester } = require("../lib/ownership");

const router = express.Router();
router.use(requireAuth);

// List all declared holidays for a semester, earliest first.
router.get("/:semesterId", async (req, res) => {
  const semester = await getOwnedSemester(req.params.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const holidays = await prisma.holiday.findMany({
    where: { semesterId: semester.id },
    orderBy: { date: "asc" },
  });
  res.json({ holidays });
});

// Bulk-add holidays for a semester — used both for manually adding a
// single date (array of length 1) and for the AI academic-calendar
// import, which sends the whole extracted list at once. Duplicate
// dates for the same semester are silently skipped (skipDuplicates)
// so re-confirming an import never errors out.
router.post(
  "/:semesterId",
  [
    body("holidays").isArray({ min: 1 }).withMessage("At least one holiday is required"),
    body("holidays.*.date").isISO8601().withMessage("Each holiday needs a valid date"),
    body("holidays.*.label").optional({ nullable: true }).trim().isLength({ max: 120 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const semester = await getOwnedSemester(req.params.semesterId, req.userId);
    if (!semester) return res.status(404).json({ error: "Semester not found" });

    const data = req.body.holidays.map((h) => ({
      semesterId: semester.id,
      date: new Date(h.date),
      label: h.label || null,
    }));

    await prisma.holiday.createMany({ data, skipDuplicates: true });
    const holidays = await prisma.holiday.findMany({
      where: { semesterId: semester.id },
      orderBy: { date: "asc" },
    });
    res.status(201).json({ holidays });
  }
);

// Remove a single declared holiday.
router.delete("/:semesterId/:holidayId", async (req, res) => {
  const semester = await getOwnedSemester(req.params.semesterId, req.userId);
  if (!semester) return res.status(404).json({ error: "Semester not found" });

  const holiday = await prisma.holiday.findFirst({
    where: { id: req.params.holidayId, semesterId: semester.id },
  });
  if (!holiday) return res.status(404).json({ error: "Holiday not found" });

  await prisma.holiday.delete({ where: { id: holiday.id } });
  res.json({ ok: true });
});

module.exports = router;