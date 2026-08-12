const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Files never touch disk — read straight into memory, base64-encoded, and
// sent to the model. 15MB covers a multi-page PDF or a large photo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 2 },
});

const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You read a college academic calendar and/or a weekly class timetable (images or PDFs) and extract structured data. Respond with ONLY a single JSON object — no markdown fences, no preamble, no commentary. Follow this exact shape:

{
  "semester": { "name": string|null, "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null },
  "holidays": [ { "date": "YYYY-MM-DD", "label": string } ],
  "slots": [ { "subject": string, "type": "lecture"|"tutorial"|"practical", "day": 0-6, "startTime": "HH:MM", "endTime": "HH:MM", "room": string|null } ]
}

Rules:
- "day" is 0 = Monday .. 6 = Sunday.
- "type": lectures/theory -> "lecture", tutorials -> "tutorial", labs/practicals -> "practical". Default to "lecture" if unclear.
- Expand multi-day holiday ranges (e.g. "Diwali break: 12-16 Oct") into one entry per calendar date.
- If a calendar year isn't stated anywhere, infer the most likely year from context (e.g. semester dates); never leave a date without a year.
- If the timetable image isn't provided, return an empty "slots" array. If the calendar isn't provided, return empty "holidays" and null semester dates.
- Only include information you can actually read from the provided files — never invent subjects, times, or dates that aren't visibly present.
- Output strictly valid JSON matching the shape above and nothing else.`;

function fileToPart(file) {
  return {
    inline_data: {
      mime_type: file.mimetype,
      data: file.buffer.toString("base64"),
    },
  };
}

// POST /api/ai/extract-schedule
// multipart/form-data fields: "calendar" (optional file), "timetable" (optional file)
// At least one of the two must be present.
router.post(
  "/extract-schedule",
  upload.fields([{ name: "calendar", maxCount: 1 }, { name: "timetable", maxCount: 1 }]),
  async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI import isn't configured on the server (missing GEMINI_API_KEY)." });
    }

    const calendarFile = req.files?.calendar?.[0];
    const timetableFile = req.files?.timetable?.[0];
    if (!calendarFile && !timetableFile) {
      return res.status(400).json({ error: "Upload at least one file (academic calendar or timetable)." });
    }

    const parts = [];
    if (calendarFile) {
      parts.push({ text: "This file is the academic calendar:" });
      parts.push(fileToPart(calendarFile));
    }
    if (timetableFile) {
      parts.push({ text: "This file is the weekly timetable:" });
      parts.push(fileToPart(timetableFile));
    }

    let aiResponse;
    try {
      const apiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error("Gemini API error:", apiRes.status, errText);
        return res.status(502).json({ error: "AI extraction failed. Please try again." });
      }
      aiResponse = await apiRes.json();
    } catch (e) {
      console.error("AI extraction request failed:", e);
      return res.status(502).json({ error: "AI extraction failed. Please try again." });
    }

    const text = aiResponse?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) {
      console.error("Gemini returned no text:", JSON.stringify(aiResponse));
      return res.status(502).json({ error: "AI returned an unexpected response." });
    }

    let parsed;
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI JSON:", text);
      return res.status(502).json({ error: "Couldn't read the AI's response. Try clearer photos/scans." });
    }

    res.json({
      semester: parsed.semester || { name: null, startDate: null, endDate: null },
      holidays: Array.isArray(parsed.holidays) ? parsed.holidays : [],
      slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    });
  }
);

module.exports = router;