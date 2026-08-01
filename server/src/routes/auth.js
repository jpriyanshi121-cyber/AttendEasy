const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const prisma = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sendResetEmail } = require("../lib/mailer");

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("name").optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, name } = req.body;
    const finalName = name && name.trim() ? name.trim() : email.split("@")[0];

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: finalName },
    });

    // Every new user starts with one active semester so the app has
    // somewhere to attach subjects/slots to immediately.
    const semester = await prisma.semester.create({
      data: {
        userId: user.id,
        name: "Current Semester",
        startDate: new Date(),
        isActive: true,
      },
    });

    const token = signToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      semester,
    });
  }
);

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }
);

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

router.patch(
  "/change-password",
  requireAuth,
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ message: "Password updated" });
  }
);

router.patch(
  "/me",
  requireAuth,
  [body("name").trim().isLength({ min: 1 }).withMessage("Name cannot be empty")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name: req.body.name },
      select: { id: true, email: true, name: true },
    });
    res.json({ user });
  }
);


router.post(
  "/forgot-password",
  [body("email").isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond the same way whether or not the email exists,
    // so this can't be used to check which emails are registered.
    if (user) {
      const resetToken = jwt.sign({ userId: user.id, purpose: "reset" }, process.env.JWT_SECRET, { expiresIn: "15m" });
      const resetLink = `${process.env.FRONTEND_URL}/?reset=${resetToken}`;
      try {
        await sendResetEmail(user.email, resetLink);
      } catch (e) {
        console.error("Failed to send reset email:", e.message);
      }
    }

    res.json({ message: "If that email is registered, a reset link has been sent." });
  }
);

router.post(
  "/reset-password",
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    let payload;
    try {
      payload = jwt.verify(req.body.token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }
    if (payload.purpose !== "reset") {
      return res.status(400).json({ error: "This reset link is invalid." });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await prisma.user.update({ where: { id: payload.userId }, data: { passwordHash } });

    res.json({ message: "Password updated. You can now log in." });
  }
);

module.exports = router;