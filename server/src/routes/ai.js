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

const BASE_PROMPT = `You read a college academic calendar and/or a weekly class timetable (images or PDFs) and extract structured data. Respond with ONLY a single JSON object — no markdown fences, no preamble, no commentary. Follow this exact shape:

{
  "semester": { "name": string|null, "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null },
  "holidays": [ { "date": "YYYY-MM-DD", "label": string, "confidence": "confirmed"|"likely" } ],
  "slots": [ { "subject": string, "type": "lecture"|"tutorial"|"practical", "day": 0-6, "startTime": "HH:MM", "endTime": "HH:MM", "room": string|null } ]
}

SEMESTER END DATE — this must be the last day of regular teaching, never an exam date:
- College calendars label this differently everywhere ("Commencement of Classes", "Teaching Schedule", "Instruction Period", "Last Working Day", etc.) — find whichever section states when regular classes/instruction stop, and use ITS end date.
- Never use a "Conduct of Examination", "End Term Exam", "Practical Exam", or similar exam-period date as the semester end date, even if it's later — exams are not teaching days.
- If the calendar shows separate rows for different admitted-year batches (e.g. "admitted upto 2025" vs "admitted in 2026") with different date ranges, see the BATCH CONTEXT note below for which row to use.

HOLIDAYS — return every plausible non-teaching date, but mark your confidence honestly:
- "confirmed": the calendar explicitly says there are no classes that day — words like "holiday", "break", "vacation", "no classes", a gazetted holiday list, or a date range explicitly excluded from the teaching period.
- "likely": a date where classes are commonly suspended but the calendar doesn't say so outright — fests, sports meets, conferences, alumni meets, convocations, AND exam/mid-term periods (these usually replace regular classes even when not stated as a "holiday"). Still give your best guess at a specific, useful label (e.g. "Mid-Term Examination", "Techno-Cultural Fest") — never omit a date just because you're unsure, mark it "likely" instead.
- Expand a stated multi-day range (break, fest, exam period, etc.) into one entry per calendar date in that range.

TIMETABLE — the grid uses numbered period columns (1, 2, 3...) with a header row mapping each number to a clock time range (e.g. column "3" header "11-12 am" means 11:00-12:00). For every class cell:
- Find which numbered column(s) it spans and read the actual start/end clock time from that column's header — never leave startTime/endTime empty if the timetable has a header row with times.
- A class spanning multiple consecutive columns (e.g. columns 3-4, or a merged cell visually covering two column-widths) is ONE slot: startTime = start of the first column it spans, endTime = end of the last column it spans. Do not create a separate slot per column for the same continuous class.
- Convert all times to 24-hour "HH:MM" (e.g. "2pm" -> "14:00", "9 am" -> "09:00").
- "day" is 0 = Monday .. 6 = Sunday.
- "type": lectures/theory -> "lecture", tutorials -> "tutorial", labs/practicals -> "practical". A subject that appears as both a lecture and a lab gets two separate slot entries. Default to "lecture" if truly unclear.
- Use the short subject code exactly as it appears in the timetable's legend/key if there is one (e.g. "DAA", "SW") rather than the long expanded name — keep it consistent across all slots for that subject.
- Skip cells you can't confidently read (blank, illegible, or a shared/free period like "Lunch") — don't invent a class for them.
- If a cell lists multiple group-specific options (e.g. "IOT Lab A3/B3", "DAA LAB A3/ B3 Networking LAB") see the BATCH CONTEXT note below for which one to keep.

GENERAL:
- If the timetable image isn't provided, return an empty "slots" array. If the calendar isn't provided, return empty "holidays" and null semester dates.
- Only include information you can actually read from the provided files — never invent subjects, times, or dates that aren't visibly present.
- Output strictly valid JSON matching the shape above and nothing else.`;

function buildSystemPrompt(group, batchYear) {
  let context = "\n\nBATCH CONTEXT: ";
  if (!group && !batchYear) {
    context +=
      "The student didn't specify a group or admission year. If the calendar has multiple date rows for different admitted-year batches, prefer the row for students admitted in EARLIER years (continuing/senior students) over a fresh-admits row, UNLESS the timetable's own heading (e.g. \"1st Semester\") implies a first-year student. If the timetable splits any class by group (e.g. \"A3/B3\"), pick ONE group consistently (whichever is listed first) rather than including both — a single student is only ever in one group.";
  } else {
    if (batchYear) context += `The student was admitted in ${batchYear} — if the calendar has multiple rows for different admitted-year batches, use the one matching this year (or the closest one if not an exact match). `;
    if (group) context += `The student's lab/group is "${group}" — wherever the timetable splits a class by group (e.g. "A3/B3"), only include the "${group}" one, and skip the other group's version entirely.`;
  }
  return BASE_PROMPT + context;
}

function fileToPart(file) {
  return {
    inline_data: {
      mime_type: file.mimetype,
      data: file.buffer.toString("base64"),
    },
  };
}

// POST /api/ai/extract-schedule
// multipart/form-data fields: "calendar" (optional file), "timetable" (optional file),
// "group" (optional text, e.g. "A3"), "batchYear" (optional text, e.g. "2025")
// At least one of the two files must be present.
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

    const group = (req.body.group || "").trim().slice(0, 40);
    const batchYear = (req.body.batchYear || "").trim().slice(0, 10);

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
          system_instruction: { parts: [{ text: buildSystemPrompt(group, batchYear) }] },
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

    const holidays = Array.isArray(parsed.holidays)
      ? parsed.holidays.map((h) => ({ ...h, confidence: h.confidence === "confirmed" ? "confirmed" : "likely" }))
      : [];

    res.json({
      semester: parsed.semester || { name: null, startDate: null, endDate: null },
      holidays,
      slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    });
  }
);

module.exports = router;