require("dotenv").config();
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const semesterRoutes = require("./routes/semesters");
const subjectRoutes = require("./routes/subjects");
const slotRoutes = require("./routes/slots");
const recordRoutes = require("./routes/records");

const app = express();

app.use(cors());
app.use(express.json());

// Basic protection against brute-forcing login/register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/semesters", semesterRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/slots", slotRoutes);
app.use("/api/records", recordRoutes);

// TODO (next step): /api/reports (PDF export) once the frontend is wired up.

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
  } catch (e) {
    console.error("Warning: could not warm up database connection on startup.", e.message);
  }
});
