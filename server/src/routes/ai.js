const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Files never touch disk — read straight into memory, base64-encoded, and
// sent to the model. 15MB covers a multi-page PDF or a large photo.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only PDF, JPEG, PNG, WEBP, or HEIC files are supported."));
    }
    cb(null, true);
  },
});

// upload.fields() used directly as route middleware fails "silently" from
// the caller's point of view — a rejected fileFilter, an oversized file,
// or too many files all throw before our async handler below ever runs,
// which without this wrapper falls straight through to index.js's generic
// catch-all ("Something went wrong on the server") instead of a message
// that actually explains what was wrong with the upload.
function uploadFields(req, res, next) {
  upload.fields([{ name: "calendar", maxCount: 1 }, { name: "timetable", maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Couldn't process the uploaded file(s)." });
    next();
  });
}

const MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;

const BASE_PROMPT = `You read a college academic calendar and/or a weekly class timetable (images or PDFs) and extract structured data. Respond with ONLY a single JSON object — no markdown fences, no preamble, no commentary. Follow this exact shape:

{
  "calendarFileRelevant": boolean|null,
  "timetableFileRelevant": boolean|null,
  "semester": { "name": string|null, "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null },
  "holidays": [ { "date": "YYYY-MM-DD", "label": string, "confidence": "confirmed"|"likely" } ],
  "slots": [ { "subject": string, "type": "lecture"|"tutorial"|"practical", "day": 0-6, "startTime": "HH:MM", "endTime": "HH:MM", "room": string|null, "prof": string|null } ]
}

FILE RELEVANCE CHECK — do this FIRST, before anything else:
- "calendarFileRelevant": if a file was labeled "This file is the academic calendar" below, look at it and set this to true only if it's plausibly some kind of academic calendar, semester schedule, or list of holidays/breaks/important dates for a college — even a rough, handwritten, or partial one counts as true. Set it to false if the file is clearly something else entirely (a selfie, a meme, an unrelated document, a receipt, a screenshot of an app, a blank/unreadable page, random text unrelated to a college calendar, etc). If no such file was provided at all, set this to null.
- "timetableFileRelevant": the same check, but for a file labeled "This file is the weekly timetable" — true only if it's plausibly a weekly class schedule/timetable grid (subjects mapped to days/times), false if it's clearly unrelated, null if no such file was provided.
- If either relevance field is false, you can leave semester/holidays/slots as their empty defaults for that file's contribution — don't try to force-extract data from an irrelevant file.

SEMESTER END DATE — this must be the last day of regular teaching, never an exam date:
- College calendars label this differently everywhere ("Commencement of Classes", "Teaching Schedule", "Instruction Period", "Last Working Day", etc.) — find whichever section states when regular classes/instruction stop, and use ITS end date.
- Never use a "Conduct of Examination", "End Term Exam", "Practical Exam", or similar exam-period date as the semester end date, even if it's later — exams are not teaching days.
- If the calendar shows separate rows for different admitted-year batches (e.g. "admitted upto 2025" vs "admitted in 2026") with different date ranges, see the BATCH CONTEXT note below for which row to use.

HOLIDAYS — be EXHAUSTIVE. Go through the calendar section by section (every table, every bullet, every row) and extract every single date or date-range mentioned anywhere as a break, holiday, fest, exam period, or "important activity" — do not stop after the first few, and do not skip rows that seem minor or that only have a vague date (e.g. "November - 2026" — still add one entry for that, using your best guess of a specific date within the stated month/range, marked "likely"). Missing an entry is worse than over-including one. Mark your confidence honestly:
- "confirmed": the calendar explicitly says there are no classes that day — words like "holiday", "break", "vacation", "no classes", a gazetted holiday list, or a date range explicitly excluded from the teaching period.
- "likely": a date where classes are commonly suspended but the calendar doesn't say so outright — fests, sports meets, conferences, alumni meets, convocations, AND exam/mid-term periods (these usually replace regular classes even when not stated as a "holiday"). Still give your best guess at a specific, useful label (e.g. "Mid-Term Examination", "Techno-Cultural Fest") — never omit a date just because you're unsure, mark it "likely" instead.
- Expand a stated multi-day range (break, fest, exam period, etc.) into one entry per calendar date in that range — a 12-day break is 12 entries, not one.
- Before finishing, re-scan the calendar once more specifically for any date or date-range you haven't yet turned into an entry.
- ADDITIONALLY, beyond what's written in the files: using your own general knowledge, also add every national/public holiday and commonly-observed festival for the country the college is in — not just the handful of biggest ones. For an Indian college this means: Republic Day, Independence Day, Gandhi Jayanti, Diwali (and Govardhan Puja/Bhai Dooj if separately observed), Holi, Dussehra/Vijayadashami, Raksha Bandhan, Janmashtami, Ram Navami, Mahashivratri, Ganesh Chaturthi, Guru Nanak Jayanti, Eid-ul-Fitr, Eid-ul-Adha, Muharram, Good Friday, Christmas, and any other major Hindu/Muslim/Sikh/Christian festival that falls within the semester's date range — matched to the correct dates for the actual calendar year in that range. Adjust the list sensibly for other countries if the calendar clearly isn't Indian. Skip this step entirely if you can't determine the semester's date range. Always mark these "likely" (never "confirmed"), since colleges handle these inconsistently (full holiday, optional, or a compensatory working day) — the calendar's own explicit statements always take priority over this general knowledge if they conflict.

TIMETABLE — the grid uses numbered period columns (1, 2, 3...) with a header row mapping each number to a clock time range (e.g. column "3" header "11-12 am" means 11:00-12:00). For every class cell:
- Find which numbered column(s) it spans and read the actual start/end clock time from that column's header — never leave startTime/endTime empty if the timetable has a header row with times.
- A class spanning multiple consecutive columns (e.g. columns 3-4, or a merged cell visually covering two column-widths) is ONE slot: startTime = start of the first column it spans, endTime = end of the last column it spans. Do not create a separate slot per column for the same continuous class.
- Convert all times to 24-hour "HH:MM" (e.g. "2pm" -> "14:00", "9 am" -> "09:00").
- "day" is 0 = Monday .. 6 = Sunday.
- "type": lectures/theory -> "lecture", tutorials -> "tutorial", labs/practicals -> "practical". A subject that appears as both a lecture and a lab gets two separate slot entries. Default to "lecture" if truly unclear.
- Use the short subject code exactly as it appears in the timetable's legend/key if there is one (e.g. "DAA", "SW") rather than the long expanded name — keep it consistent across all slots for that subject.
- "room": the room/lab number for that cell if shown (e.g. "E-312", "A3"), else null.
- "prof": the instructor's name for that subject if there's a legend/key mapping subject codes to faculty names (e.g. "Ms. Pushpanjali", "Prof. Reddy") — match it to each slot via the subject code, else null. If a slot lists two instructors (e.g. "Ms. Megha/Ms. Deepika" for a group split), see BATCH CONTEXT for which to use, or include both separated by "/" if no group was specified.
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

// Maps how far the model has actually gotten into generating the JSON to
// the loading screen's 4 checklist steps, by watching for each key/field
// showing up in the accumulated stream text so far. This tracks real
// progress through the model's own output — not a guessed timer — so a
// small file finishes the checklist in a couple seconds and a big one
// takes as long as it actually takes.
const STAGE_MARKERS = [
  '"holidays"',   // semester object just closed -> stage 1 done
  '"slots"',      // holidays array just closed -> stage 2 done
  '"startTime"',  // first timetable slot's time fields appearing -> stage 3 done
  '"room"',       // first slot's room/prof fields appearing -> stage 4 done
];
function detectStage(text, currentStage) {
  let stage = currentStage;
  while (stage < STAGE_MARKERS.length && text.includes(STAGE_MARKERS[stage])) stage++;
  return stage;
}

// POST /api/ai/extract-schedule
// multipart/form-data fields: "calendar" (optional file), "timetable" (optional file),
// "group" (optional text, e.g. "A3"), "batchYear" (optional text, e.g. "2025")
// At least one of the two files must be present.
router.post(
  "/extract-schedule",
  uploadFields,
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

    // Streamed as newline-delimited JSON so the client's loading checklist
    // can track the model's *actual* progress through the response instead
    // of a guessed timer. Once this starts, every further outcome (success
    // or failure) has to go out as a line on this same stream — the HTTP
    // status/headers are already committed by then.
    res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
    const send = (obj) => res.write(JSON.stringify(obj) + "\n");

    let apiRes;
    try {
      apiRes = await fetch(GEMINI_STREAM_URL, {
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
    } catch (e) {
      console.error("AI extraction request failed:", e);
      send({ type: "error", error: "AI extraction failed. Please try again." });
      return res.end();
    }

    if (!apiRes.ok || !apiRes.body) {
      const errText = await apiRes.text().catch(() => "");
      console.error("Gemini API error:", apiRes.status, errText);
      send({ type: "error", error: "AI extraction failed. Please try again." });
      return res.end();
    }

    // Gemini's SSE stream sends "data: {...}\n\n" events, each carrying the
    // next slice of the response text. We accumulate the text slices (that
    // running total IS the JSON object being built, one piece at a time)
    // and re-check it against STAGE_MARKERS after every event.
    // NOTE: chunks from fetch()'s body stream are plain Uint8Array, never
    // an actual Node Buffer — decoding must go through TextDecoder (or
    // Buffer.from(chunk), which also works on a Uint8Array); appending a
    // raw Uint8Array to a string stringifies it as "1,2,3,..." byte
    // values instead of decoding it, which silently breaks every "data:"
    // line lookup below.
    const decoder = new TextDecoder();
    let fullText = "";
    let stage = 0;
    let sseBuffer = "";
    try {
      for await (const chunk of apiRes.body) {
        sseBuffer += decoder.decode(chunk, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || ""; // last piece may be incomplete — keep it for next chunk

        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const piece = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
            fullText += piece;
          } catch {
            // A malformed/partial SSE payload — skip it, the next chunk
            // usually completes it and we already have everything up to
            // this point in fullText.
          }
        }

        const newStage = detectStage(fullText, stage);
        if (newStage > stage) {
          stage = newStage;
          send({ type: "stage", stage });
        }
      }
    } catch (e) {
      console.error("AI stream read failed:", e);
      send({ type: "error", error: "AI extraction failed. Please try again." });
      return res.end();
    }

    // Belt-and-suspenders: if streaming somehow still comes back empty
    // (a Gemini response-format quirk, a transient hiccup, etc.), fall
    // back to a single non-streaming call instead of failing the import
    // outright. The checklist just jumps straight to "done" in that case
    // — no per-stage events to send, but the person still gets their data.
    if (!fullText) {
      console.error("Streaming produced no text — falling back to non-streaming call.");
      try {
        const fallbackRes = await fetch(GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: buildSystemPrompt(group, batchYear) }] },
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        if (fallbackRes.ok) {
          const fallbackJson = await fallbackRes.json();
          fullText = fallbackJson?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        } else {
          console.error("Fallback Gemini call also failed:", fallbackRes.status, await fallbackRes.text().catch(() => ""));
        }
      } catch (e) {
        console.error("Fallback Gemini call threw:", e);
      }
    }

    if (!fullText) {
      console.error("Gemini returned no text");
      send({ type: "error", error: "AI returned an unexpected response." });
      return res.end();
    }

    let parsed;
    try {
      const cleaned = fullText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI JSON:", fullText);
      send({ type: "error", error: "Couldn't read the AI's response. Try clearer photos/scans." });
      return res.end();
    }

    // Catch "wrong kind of file" before falling through to a silently
    // empty review screen — a random photo/document should tell the
    // person clearly what went wrong, not just look like a calendar with
    // nothing found in it.
    const calendarWrong = calendarFile && parsed.calendarFileRelevant === false;
    const timetableWrong = timetableFile && parsed.timetableFileRelevant === false;
    if (calendarWrong || timetableWrong) {
      let error;
      if (calendarWrong && timetableWrong) {
        error = "Neither file looks like an academic calendar or a timetable — double-check you picked the right files and try again.";
      } else if (calendarWrong) {
        error = "That file doesn't look like an academic calendar — double-check you picked the right file and try again.";
      } else {
        error = "That file doesn't look like a weekly timetable — double-check you picked the right file and try again.";
      }
      send({ type: "error", error });
      return res.end();
    }

    const holidays = Array.isArray(parsed.holidays)
      ? parsed.holidays.map((h) => ({ ...h, confidence: h.confidence === "confirmed" ? "confirmed" : "likely" }))
      : [];
    const semester = parsed.semester || { name: null, startDate: null, endDate: null };
    const slots = Array.isArray(parsed.slots) ? parsed.slots : [];

    // Right kind of file, but nothing usable came out of it (blurry
    // photo, a calendar in an unusual format, a blank template, etc.) —
    // still worth a clear heads-up rather than an empty review screen
    // that looks like the import silently "worked".
    const foundNothing = !semester.startDate && !semester.endDate && holidays.length === 0 && slots.length === 0;
    if (foundNothing) {
      send({ type: "error", error: "Couldn't find any calendar or timetable details in that file. Try a clearer photo/scan, or the original PDF if you have one." });
      return res.end();
    }

    // Every step's marker showing up somewhere in the JSON doesn't
    // guarantee we ever emitted all 4 stage events (e.g. a very short
    // response could have all 4 markers land inside one chunk) — send
    // whatever's left so the checklist always finishes fully checked off
    // by the time the result arrives, instead of stopping partway.
    if (stage < STAGE_MARKERS.length) send({ type: "stage", stage: STAGE_MARKERS.length });

    send({ type: "result", semester, holidays, slots });
    res.end();
  }
);

module.exports = router;