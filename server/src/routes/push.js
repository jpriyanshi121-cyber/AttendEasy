const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/vapid-public-key", (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.get("/preferences", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { remindersEnabled: true, lowAttendanceAlertsEnabled: true },
  });
  res.json(user);
});

router.patch(
  "/preferences",
  [
    body("remindersEnabled").optional().isBoolean(),
    body("lowAttendanceAlertsEnabled").optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        remindersEnabled: req.body.remindersEnabled,
        lowAttendanceAlertsEnabled: req.body.lowAttendanceAlertsEnabled,
      },
      select: { remindersEnabled: true, lowAttendanceAlertsEnabled: true },
    });
    res.json(user);
  }
);

router.post(
  "/subscribe",
  [
    body("endpoint").isString().notEmpty(),
    body("keys.p256dh").isString().notEmpty(),
    body("keys.auth").isString().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { endpoint, keys } = req.body;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    res.status(201).json({ success: true });
  }
);

router.delete("/subscribe", [body("endpoint").isString().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: req.body.endpoint, userId: req.userId } });
  res.json({ success: true });
});

module.exports = router;