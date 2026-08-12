import { useState, useRef, type ReactNode } from "react";
import { Sparkles, UploadCloud, FileText, Loader2, Trash2, Plus, X, Check, AlertTriangle } from "lucide-react";
import { T, F, S } from "./App";
import { api } from "../lib/api";

// Matches the JSON shape returned by POST /api/ai/extract-schedule
type ExtractedHoliday = { date: string; label: string; confidence: "confirmed" | "likely" };
type ExtractedSlot = {
  subject: string;
  type: "lecture" | "tutorial" | "practical";
  day: number; // 0=Mon..6=Sun
  startTime: string;
  endTime: string;
  room: string | null;
  prof: string | null;
};
type ExtractResult = {
  semester: { name: string | null; startDate: string | null; endDate: string | null };
  holidays: ExtractedHoliday[];
  slots: ExtractedSlot[];
};

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Turns a flat list of individual dates into ranges when the same label
// appears on consecutive calendar days — so a 12-day winter break shows as
// one row instead of 12. Each returned group carries the original indices
// into result.holidays so edits/removals still map back correctly.
type HolidayGroup = { indices: number[]; label: string; startDate: string; endDate: string; confidence: "confirmed" | "likely" };
function groupHolidays(holidays: ExtractedHoliday[], confidence: "confirmed" | "likely"): HolidayGroup[] {
  const withIdx = holidays.map((h, i) => ({ ...h, i })).filter((h) => h.date && h.confidence === confidence);
  withIdx.sort((a, b) => a.date.localeCompare(b.date));
  const groups: HolidayGroup[] = [];
  for (const h of withIdx) {
    const last = groups[groups.length - 1];
    if (last && last.label === h.label) {
      const prevDate = new Date(last.endDate);
      const thisDate = new Date(h.date);
      const dayGap = Math.round((thisDate.getTime() - prevDate.getTime()) / 86400000);
      if (dayGap === 1) {
        last.endDate = h.date;
        last.indices.push(h.i);
        continue;
      }
    }
    groups.push({ indices: [h.i], label: h.label, startDate: h.date, endDate: h.date, confidence });
  }
  return groups;
}

function fmtShort(iso: string) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

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

function fieldInputStyle() {
  return { flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 13, color: T.inkH, minWidth: 0 } as const;
}

// Matches the manual "Add/Edit Slot" form in App.tsx exactly (same label
// style, same input chrome) so the review screen doesn't feel like a
// different, unfamiliar UI from the one the user already knows.
const slotLabelStyle = {
  display: "block", fontFamily: F.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const,
  color: T.inkM, marginBottom: 6, paddingLeft: 2, fontWeight: 500,
};
function slotInputStyle(danger?: boolean) {
  return {
    width: "100%", padding: "10px 11px", borderRadius: 12, border: `1.5px solid ${danger ? "#F0C9CC" : "#EFEAF6"}`,
    background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)", fontFamily: F.sans, fontSize: 12.5, color: T.inkH,
    outline: "none", boxSizing: "border-box" as const,
  };
}
function slotSelectStyle() {
  return {
    width: "100%", padding: "10px 11px", borderRadius: 12, border: "1.5px solid #EFEAF6",
    background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)", fontFamily: F.sans, fontSize: 12.5, color: T.inkH,
    outline: "none", boxSizing: "border-box" as const, cursor: "pointer",
  };
}
function SlotField({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={slotLabelStyle}>{label}{optional && <span style={{ textTransform: "none", opacity: 0.7 }}> (optional)</span>}</label>
      {children}
    </div>
  );
}

export default function SmartImportScreen({
  semesterId, onDone, onClose,
}: { semesterId: string; onClose: () => void; onDone: () => void }) {
  const [calendarFile, setCalendarFile] = useState<File | null>(null);
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [group, setGroup] = useState("");
  const [batchYear, setBatchYear] = useState("");
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
      if (group.trim()) form.append("group", group.trim());
      if (batchYear.trim()) form.append("batchYear", batchYear.trim());
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

  function removeHolidayGroup(indices: number[]) {
    if (!result) return;
    const toRemove = new Set(indices);
    setResult({ ...result, holidays: result.holidays.filter((_, idx) => !toRemove.has(idx)) });
  }
  function relabelHolidayGroup(indices: number[], label: string) {
    if (!result) return;
    const holidays = result.holidays.slice();
    for (const idx of indices) holidays[idx] = { ...holidays[idx], label };
    setResult({ ...result, holidays });
  }
  function promoteHolidayGroup(indices: number[]) {
    // "Include" a Likely holiday — moves it into the Confirmed section,
    // so it starts counting toward the attendance projection.
    if (!result) return;
    const holidays = result.holidays.slice();
    for (const idx of indices) holidays[idx] = { ...holidays[idx], confidence: "confirmed" };
    setResult({ ...result, holidays });
  }
  function addHoliday() {
    if (!result) return;
    setResult({ ...result, holidays: [...result.holidays, { date: "", label: "", confidence: "confirmed" }] });
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

      // 2. Holidays (skip rows the user cleared the date on). Confirmed
      // ones count toward the attendance projection; Likely ones are saved
      // too (so the Calendar screen can show the reason) but flagged
      // confirmed:false so stats.js doesn't subtract them automatically.
      const validHolidays = result.holidays
        .filter((h) => h.date)
        .map((h) => ({ date: h.date, label: h.label, confirmed: h.confidence === "confirmed" }));
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
              prof: s.prof || undefined,
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

  const confirmedGroups = result ? groupHolidays(result.holidays, "confirmed") : [];
  const likelyGroups = result ? groupHolidays(result.holidays, "likely") : [];
  const slotsByDay = result
    ? DAYS_SHORT.map((label, day) => ({
        day, label,
        items: result.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.day === day),
      })).filter((g) => g.items.length > 0)
    : [];
  const missingTimeCount = result ? result.slots.filter((s) => !s.startTime || !s.endTime).length : 0;

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

            <div style={{ marginTop: 18 }}>
              <label style={{ display: "block", fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, marginBottom: 8, fontWeight: 600 }}>
                If your timetable/calendar has multiple groups or batches (optional)
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="text" placeholder="Your group (e.g. A3)" value={group} onChange={(e) => setGroup(e.target.value)} style={fieldInputStyle()} />
                <input type="text" placeholder="Admission year (e.g. 2025)" value={batchYear} onChange={(e) => setBatchYear(e.target.value)} style={fieldInputStyle()} />
              </div>
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
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600, marginBottom: 10 }}>
                Semester (last day of regular classes — not exams)
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={result.semester.startDate || ""} onChange={(e) => setResult({ ...result, semester: { ...result.semester, startDate: e.target.value } })}
                  style={fieldInputStyle()} />
                <input type="date" value={result.semester.endDate || ""} onChange={(e) => setResult({ ...result, semester: { ...result.semester, endDate: e.target.value } })}
                  style={fieldInputStyle()} />
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600 }}>
                  Confirmed holidays ({confirmedGroups.reduce((n, g) => n + g.indices.length, 0)})
                </div>
                <button onClick={addHoliday} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.accent, display: "flex", alignItems: "center", gap: 4, fontFamily: F.sans, fontSize: 12, fontWeight: 700 }}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <p style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkL, margin: "0 0 12px" }}>
                Calendar explicitly says no classes — these count toward your attendance projection.
              </p>
              {confirmedGroups.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL }}>None found.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {confirmedGroups.map((g, gi) => (
                  <div key={gi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 92, flexShrink: 0, fontFamily: F.mono, fontSize: 11.5, color: T.inkM, fontWeight: 600 }}>
                      {g.startDate === g.endDate ? fmtShort(g.startDate) : `${fmtShort(g.startDate)}–${fmtShort(g.endDate)}`}
                    </div>
                    <input type="text" placeholder="Label" value={g.label} onChange={(e) => relabelHolidayGroup(g.indices, e.target.value)}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12.5, color: T.inkH, minWidth: 0 }} />
                    <button onClick={() => removeHolidayGroup(g.indices)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkL, padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600, marginBottom: 4 }}>
                Likely no-class days ({likelyGroups.reduce((n, g) => n + g.indices.length, 0)})
              </div>
              <p style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkL, margin: "0 0 12px" }}>
                Fests, exam periods, etc. — not counted automatically, but will show on your Calendar with the reason. Tap "Include" to also count one toward your projection.
              </p>
              {likelyGroups.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL }}>None found.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {likelyGroups.map((g, gi) => (
                  <div key={gi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 92, flexShrink: 0, fontFamily: F.mono, fontSize: 11.5, color: T.inkM, fontWeight: 600 }}>
                      {g.startDate === g.endDate ? fmtShort(g.startDate) : `${fmtShort(g.startDate)}–${fmtShort(g.endDate)}`}
                    </div>
                    <input type="text" placeholder="Label" value={g.label} onChange={(e) => relabelHolidayGroup(g.indices, e.target.value)}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontSize: 12.5, color: T.inkH, minWidth: 0 }} />
                    <button onClick={() => promoteHolidayGroup(g.indices)}
                      style={{ border: "none", background: T.aFill, color: T.accent, borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                      Include
                    </button>
                    <button onClick={() => removeHolidayGroup(g.indices)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkL, padding: 4 }}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: S.sm }}>
              <div style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.inkM, fontWeight: 600, marginBottom: 10 }}>
                Classes ({result.slots.length})
              </div>
              {missingTimeCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontFamily: F.sans, fontSize: 11.5, color: T.danger }}>
                  <AlertTriangle size={13} /> {missingTimeCount} class{missingTimeCount > 1 ? "es are" : " is"} missing a time — those will be skipped unless you fill them in.
                </div>
              )}
              {result.slots.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL }}>No classes found in the timetable file.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {slotsByDay.map(({ day, label, items }) => (
                  <div key={day}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.06em", color: T.accent, fontWeight: 700, marginBottom: 8 }}>
                      {label} · {items.length}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {items.map(({ s, i }) => {
                        const missingTime = !s.startTime || !s.endTime;
                        return (
                          <div key={i} style={{ border: `1.5px solid ${missingTime ? "#F0C9CC" : "#EFEAF6"}`, borderRadius: 16, padding: 14 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                              <input type="text" value={s.subject} onChange={(e) => updateSlot(i, { subject: e.target.value })}
                                style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1.5px solid #EFEAF6", fontFamily: F.sans, fontWeight: 700, fontSize: 13, color: T.inkH, minWidth: 0 }} />
                              <button onClick={() => removeSlot(i)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.inkL, padding: 4, flexShrink: 0 }}><Trash2 size={15} /></button>
                            </div>

                            <div style={{ display: "flex", gap: 9, marginBottom: 11 }}>
                              <SlotField label="Type">
                                <select value={s.type} onChange={(e) => updateSlot(i, { type: e.target.value as any })} style={slotSelectStyle()}>
                                  <option value="lecture">Lecture</option>
                                  <option value="tutorial">Tutorial</option>
                                  <option value="practical">Practical</option>
                                </select>
                              </SlotField>
                              <SlotField label="Day">
                                <select value={s.day} onChange={(e) => updateSlot(i, { day: Number(e.target.value) })} style={slotSelectStyle()}>
                                  {DAYS_SHORT.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                                </select>
                              </SlotField>
                            </div>

                            <div style={{ display: "flex", gap: 9, marginBottom: 11 }}>
                              <SlotField label="Start Time">
                                <input type="time" value={s.startTime} onChange={(e) => updateSlot(i, { startTime: e.target.value })} style={slotInputStyle(!s.startTime)} />
                              </SlotField>
                              <SlotField label="End Time">
                                <input type="time" value={s.endTime} onChange={(e) => updateSlot(i, { endTime: e.target.value })} style={slotInputStyle(!s.endTime)} />
                              </SlotField>
                            </div>

                            {missingTime && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 11, fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.danger }}>
                                <AlertTriangle size={12} /> Set both times, or this class will be skipped.
                              </div>
                            )}

                            <div style={{ display: "flex", gap: 9 }}>
                              <SlotField label="Room" optional>
                                <input type="text" placeholder="e.g. C-204" value={s.room || ""} onChange={(e) => updateSlot(i, { room: e.target.value })} style={slotInputStyle()} />
                              </SlotField>
                              <SlotField label="Professor" optional>
                                <input type="text" placeholder="e.g. Prof. Iyer" value={s.prof || ""} onChange={(e) => updateSlot(i, { prof: e.target.value })} style={slotInputStyle()} />
                              </SlotField>
                            </div>
                          </div>
                        );
                      })}
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