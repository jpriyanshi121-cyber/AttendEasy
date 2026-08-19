require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const semesterRoutes = require("./routes/semesters");
const subjectRoutes = require("./routes/subjects");
const slotRoutes = require("./routes/slots");
const recordRoutes = require("./routes/records");
const pushRoutes = require("./routes/push");
const holidayRoutes = require("./routes/holidays");
const aiRoutes = require("./routes/ai");
const { startScheduler } = require("./lib/scheduler");

const app = express();

// Every real deploy target for this app (Render, Railway, Vercel, Heroku,
// nginx, etc.) sits behind a reverse proxy. Without this, Express sees the
// proxy's IP for every request instead of the real client IP — which
// breaks express-rate-limit below (it would either rate-limit all users
// together as "one IP", or be bypassable, depending on setup).
app.set("trust proxy", 1);
// Don't advertise the framework in responses.
app.disable("x-powered-by");
app.use(helmet());

// Restrict cross-origin requests to the app's own frontend(s) instead of
// any website. FRONTEND_URL can be a comma-separated list (e.g. staging +
// production). If it's not set at all, fall back to allowing any origin so
// an unconfigured deploy doesn't silently break — but every real deploy
// should set this.
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));
app.use(express.json());

// Basic protection against brute-forcing login/register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "warm", time: new Date().toISOString() });
  } catch (e) {
    res.json({ status: "ok", db: "cold-or-unreachable", time: new Date().toISOString() });
  }
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/semesters", semesterRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/ai", aiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler — keeps stack traces out of responses.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const prisma = require("./db");

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`AttendEasy API running on http://localhost:${PORT}`);
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection warm and ready.");
    startScheduler();
    console.log("Notification scheduler started.");
  } catch (e) {
    console.error("Warning: could not warm up database connection on startup.", e.message);
  }
});