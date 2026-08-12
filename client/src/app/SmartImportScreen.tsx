import { useState, useRef } from "react";
import { Sparkles, UploadCloud, FileText, Loader2, Trash2, Plus, X, Check } from "lucide-react";
import { T, F, S } from "./App";
import { api } from "../lib/api";

// Matches the JSON shape returned by POST /api/ai/extract-schedule
type ExtractedHoliday = { date: string; label: string };
type ExtractedSlot = {
  subject: string;
  type: "lecture" | "tutorial" | "practical";
  day: number; // 0=Mon..6=Sun
  startTime: string;
  endTime: string;
  room: string | null;
};
type ExtractResult = {
  semester: { name: string | null; startDate: string | null; endDate: string | null };
  holidays: ExtractedHoliday[];
  slots: ExtractedSlot[];
};

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function FileDrop({
  label, hint, file, onPick,
}: { label: string; hint: string; file: File | null; onPick: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label style={{ display: "block", fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, marginBottom: 8, fontWeight: 600 }}>
        {label}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${file ? T.accent : "#DAD2E8"}`,
          borderRadius: 16, padding: "20px 16px", cursor: "pointer",
          background: file ? T.aFill : "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
          display: "flex", alignItems: "center", gap: 12,
        }}
      >
        <input
          ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
        <div style={{ width: 40, height: 40, borderRadius: 12, background: file ? T.accent : "#EFEAF6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {file ? <FileText size={18} color="#fff" /> : <UploadCloud size={18} color={T.inkM} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: 13.5, color: T.inkH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file ? file.name : hint}
          </div>
          {!file && <div style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkM, marginTop: 2 }}>PDF or photo</div>}
        </div>
        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); onPick(null); if (inputRef.current) inputRef.current.value = ""; }}
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, color: T.inkM }}
          ><X size={16} /></button>
        )}
      </div>
    </div>
  );
}

export default function SmartImportScreen({
  semesterId, onDone, onClose,
}: { semesterId: string; onClose: () => void; onDone: () => void }) {
  const [calendarFile, setCalendarFile] = useState<File | null>(null);
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExtractResult | null>(null);

  async function extract() {
    if (!calendarFile && !timetableFile) {
      setError("Upload at least one file to continue.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const form = new FormData();
      if (calendarFile) form.append("calendar", calendarFile);
      if (timetableFile) form.append("timetable", timetableFile);
      const data = await api.postForm("/ai/extract-schedule", form);
      setResult({
        semester: data.semester,
        holidays: data.holidays,
        slots: data.slots,
      });
    } catch (e: any) {
      setError(e.message || "AI extraction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function updateHoliday(i: number, patch: Partial<ExtractedHoliday>) {
    if (!result) return;
    const holidays = result.holidays.slice();
    holidays[i] = { ...holidays[i], ...patch };
    setResult({ ...result, holidays });
  }
  function removeHoliday(i: number) {
    if (!result) return;
    setResult({ ...result, holidays: result.holidays.filter((_, idx) => idx !== i) });
  }
  function addHoliday() {
    if (!result) return;
    setResult({ ...result, holidays: [...result.holidays, { date: "", label: "" }] });
  }

  function updateSlot(i: number, patch: Partial<ExtractedSlot>) {
    if (!result) return;
    const slots = result.slots.slice();
    slots[i] = { ...slots[i], ...patch };
    setResult({ ...result, slots });
  }
  function removeSlot(i: number) {
    if (!result) return;
    setResult({ ...result, slots: result.slots.filter((_, idx) => idx !== i) });
  }

  async function confirmImport() {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      // 1. Semester dates.
      if (result.semester.startDate || result.semester.endDate) {
        await api.setSemesterDates(semesterId, result.semester.startDate, result.semester.endDate || null);
      }

      // 2. Holidays (skip rows the user cleared the date on).
      const validHolidays = result.holidays.filter((h) => h.date);
      if (validHolidays.length) {
        await api.post(`/holidays/${semesterId}`, { holidays: validHolidays });
      }

      // 3. Slots — reuse an existing subject by name (case-insensitive) or
      // create a new one with the right class types enabled, then add
      // each slot under it.
      const { subjects: existing } = await api.get(`/subjects?semesterId=${semesterId}`);
      const byName = new Map<string, any>(existing.map((s: any) => [s.name.trim().toLowerCase(), s]));

      // Group extracted slots by subject name so we only create/patch each
      // subject once even if it has multiple slots.
      const bySubject = new Map<string, ExtractedSlot[]>();
      for (const s of result.slots) {
        const key = s.subject.trim().toLowerCase();
        if (!bySubject.has(key)) bySubject.set(key, []);
        bySubject.get(key)!.push(s);
      }

      for (const [key, slots] of bySubject) {
        const types = new Set(slots.map((s) => s.type));
        let subject = byName.get(key);
        if (subject) {
          const hasLecture = subject.hasLecture || types.has("lecture");
          const hasTutorial = subject.hasTutorial || types.has("tutorial");
          const hasPractical = subject.hasPractical || types.has("practical");
          if (hasLecture !== subject.hasLecture || hasTutorial !== subject.hasTutorial || hasPractical !== subject.hasPractical) {
            const { subject: updated } = await api.patch(`/subjects/${subject.id}`, { hasLecture, hasTutorial, hasPractical });
            subject = updated;
          }
        } else {
          const { subject: created } = await api.post("/subjects", {
            semesterId,
            name: slots[0].subject.trim(),
            hasLecture: types.has("lecture"),
            hasTutorial: types.has("tutorial"),
            hasPractical: types.has("practical"),
          });
          subject = created;
          byName.set(key, subject);
        }

        for (const s of slots) {
          if (!s.startTime || !s.endTime) continue;
          try {
            await api.post("/slots", {
              semesterId,
              subjectId: subject.id,
              type: s.type,
              day: s.day,
              startTime: s.startTime,
              endTime: s.endTime,
              room: s.room || undefined,
            });
          } catch {
            // A conflicting/duplicate slot shouldn't block the rest of the import.
          }
        }
      }

      onDone();
    } catch (e: any) {
      setError(e.message || "Couldn't save the import. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 80, overflowY: "auto" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 20px 100px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg,#6E4F91,#9B7FCC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={17} color="#fff" />
            </div>
            <h2 style={{ fontFamily: F.serif, fontWeight: 700, fontSize: 20, color: T.inkH, margin: 0 }}>Smart Import</h2>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkM, padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        {!result && (
          <>
            <p style={{ fontFamily: F.sans, fontSize: 13.5, color: T.inkM, marginBottom: 22, lineHeight: 1.5 }}>
              Upload your academic calendar and/or weekly timetable — AI will read the semester dates, holidays, and classes, and you'll get to review everything before it's saved.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FileDrop label="Academic Calendar" hint="Semester dates + holidays" file={calendarFile} onPick={setCalendarFile} />
              <FileDrop label="Weekly Timetable" hint="Your class schedule" file={timetableFile} onPick={setTimetableFile} />
            </div>

            {error && <div style={{ marginTop: 14, fontFamily: F.sans, fontSize: 12.5, color: T.danger }}>{error}</div>}

            <button
              onClick={extract}
              disabled={loading || (!calendarFile && !timetableFile)}
              style={{
                marginTop: 24, width: "100%", padding: 15, borderRadius: 14, border: "none",
                background: loading ? "#C9BEDB" : "linear-gradient(155deg,#8A6BB0,#6E4F91)",
                color: "#fff", fontFamily: F.sans, fontWeight: 700, fontSize: 14.5,
                cursor: loading ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: S.acc,
              }}
            >
              {loading ? <Loader2 size={16} className="ae-spin" /> : <Sparkles size={16} />}
              {loading ? "Reading your files..." : "Extract with AI"}
            </button>
          </>
        )}

        {result && (
          <>
            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600, marginBottom: 10 }}>Semester</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={result.semester.startDate || ""} onChange={(e) => setResult({ ...result, semester: { ...result.semester, startDate: e.target.value } })}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 13, color: T.inkH }} />
                <input type="date" value={result.semester.endDate || ""} onChange={(e) => setResult({ ...result, semester: { ...result.semester, endDate: e.target.value } })}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 13, color: T.inkH }} />
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600 }}>
                  Holidays ({result.holidays.length})
                </div>
                <button onClick={addHoliday} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.accent, display: "flex", alignItems: "center", gap: 4, fontFamily: F.sans, fontSize: 12, fontWeight: 700 }}>
                  <Plus size={14} /> Add
                </button>
              </div>
              {result.holidays.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL }}>None found — add manually if needed.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.holidays.map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="date" value={h.date} onChange={(e) => updateHoliday(i, { date: e.target.value })}
                      style={{ width: 140, padding: "9px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12.5, color: T.inkH }} />
                    <input type="text" placeholder="Label" value={h.label} onChange={(e) => updateHoliday(i, { label: e.target.value })}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12.5, color: T.inkH, minWidth: 0 }} />
                    <button onClick={() => removeHoliday(i)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkL, padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600, marginBottom: 10 }}>
                Classes ({result.slots.length})
              </div>
              {result.slots.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL }}>No classes found in the timetable file.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.slots.map((s, i) => (
                  <div key={i} style={{ border: "1.5px solid #EFEAF6", borderRadius: 14, padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input type="text" value={s.subject} onChange={(e) => updateSlot(i, { subject: e.target.value })}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontWeight: 700, fontSize: 12.5, color: T.inkH, minWidth: 0 }} />
                      <button onClick={() => removeSlot(i)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkL, padding: 4 }}><Trash2 size={15} /></button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={s.type} onChange={(e) => updateSlot(i, { type: e.target.value as any })}
                        style={{ padding: "7px 8px", borderRadius: 9, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12, color: T.inkH }}>
                        <option value="lecture">Lecture</option>
                        <option value="tutorial">Tutorial</option>
                        <option value="practical">Practical</option>
                      </select>
                      <select value={s.day} onChange={(e) => updateSlot(i, { day: Number(e.target.value) })}
                        style={{ padding: "7px 8px", borderRadius: 9, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12, color: T.inkH }}>
                        {DAYS_SHORT.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                      </select>
                      <input type="time" value={s.startTime} onChange={(e) => updateSlot(i, { startTime: e.target.value })}
                        style={{ flex: 1, padding: "7px 8px", borderRadius: 9, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12, color: T.inkH, minWidth: 0 }} />
                      <input type="time" value={s.endTime} onChange={(e) => updateSlot(i, { endTime: e.target.value })}
                        style={{ flex: 1, padding: "7px 8px", borderRadius: 9, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12, color: T.inkH, minWidth: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={{ marginBottom: 14, fontFamily: F.sans, fontSize: 12.5, color: T.danger }}>{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setResult(null)} disabled={saving}
                style={{ flex: 1, padding: 14, borderRadius: 14, border: "1.5px solid #EFEAF6", background: "#fff", color: T.inkM, fontFamily: F.sans, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Back
              </button>
              <button onClick={confirmImport} disabled={saving}
                style={{ flex: 1.6, padding: 14, borderRadius: 14, border: "none", cursor: saving ? "default" : "pointer",
                  background: saving ? "#C9BEDB" : "linear-gradient(155deg,#8A6BB0,#6E4F91)", color: "#fff",
                  fontFamily: F.sans, fontWeight: 700, fontSize: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {saving ? <Loader2 size={16} className="ae-spin" /> : <Check size={16} />}
                {saving ? "Saving..." : "Confirm & Create"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}