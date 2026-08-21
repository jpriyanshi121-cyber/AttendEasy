import { useState, useEffect, useRef, type ReactNode } from "react";
import { Sparkles, UploadCloud, FileText, Loader2, Trash2, Plus, X, Check, AlertTriangle, Clock, MapPin } from "lucide-react";
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
const PALETTE = ["#6E4F91", "#8B6FBB", "#5A3D78", "#9B7FCC", "#7A5AA0"];
const GOLD = "#C9A24B";
// Mirrors the private TYPE_DOT/TYPE_TAG constants in App.tsx (not exported
// from there) so the review screen's class pills look like the same
// vocabulary as the manual Edit Timetable screen.
const TYPE_DOT: Record<string, string> = { lecture: "#6E4F91", tutorial: GOLD, practical: "#2F7A5C" };
const TYPE_TAG: Record<string, string> = { lecture: "LEC", tutorial: "TUT", practical: "PRAC" };

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
          border: file ? "1.5px solid #DECCF1" : "1.5px dashed #D8CDEA",
          borderRadius: 16, padding: file ? "14px 16px" : "20px 16px", cursor: "pointer",
          background: file ? "linear-gradient(155deg,#F4EEFB,#EDE3F7)" : "#FBFAFD",
          boxShadow: file ? "0 6px 16px rgba(110,79,145,0.1)" : "none",
          display: "flex", alignItems: "center", gap: 13,
        }}
      >
        <input
          ref={inputRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
        <div style={{
          width: file ? 38 : 42, height: file ? 38 : 42, borderRadius: file ? 11 : 12, flexShrink: 0,
          background: file ? "linear-gradient(155deg,#8E6BB8,#6E4F91)" : "#EFE7F9",
          boxShadow: file ? "0 6px 14px rgba(110,79,145,0.32)" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {file ? <FileText size={17} color="#fff" /> : <UploadCloud size={19} color={T.accent} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.sans, fontWeight: 700, fontSize: file ? 13.5 : 14, color: T.inkH, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file ? file.name : hint}
          </div>
          {!file && <div style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkM, marginTop: 2 }}>PDF or photo</div>}
        </div>
        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); onPick(null); if (inputRef.current) inputRef.current.value = ""; }}
            style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: T.accent,
            }}
          ><X size={14} strokeWidth={2.4} /></button>
        )}
      </div>
    </div>
  );
}

function sectionCardStyle() {
  return {
    background: T.card, borderRadius: 20, padding: 18, marginBottom: 16,
    boxShadow: "0 8px 22px rgba(27,21,48,0.07), 0 2px 6px rgba(27,21,48,0.03)",
    border: "1px solid #EFEAF6",
  } as const;
}
function sectionTitleStyle() {
  return {
    fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const,
    color: T.accent, fontWeight: 700,
  };
}

function DateBtn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const label = value ? new Date(value + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Pick date";
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <div style={{
        padding: "12px 14px", borderRadius: 13, border: "1.5px solid #EFEAF6",
        background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
        boxShadow: "0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
      }}>
        <span style={{ fontFamily: F.sans, fontSize: 13, color: value ? T.inkH : T.inkL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <CalendarIconSvg />
      </div>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
    </div>
  );
}
function CalendarIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8194" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function fieldInputStyle() {
  return {
    flex: 1, minWidth: 0, padding: "13px 14px", borderRadius: 13,
    border: "1.5px solid #EFEAF6", background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
    fontFamily: F.sans, fontSize: 13, color: T.inkH, outline: "none",
    boxShadow: "0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
  } as const;
}

// Matches the manual "Add/Edit Slot" form in App.tsx exactly (same label
// style, same input chrome) so the review screen doesn't feel like a
// different, unfamiliar UI from the one the user already knows.
// NOTE: kept as a function (not a top-level const object) — SmartImportScreen
// and App.tsx import from each other, and a plain const here would read
// F/T at module-evaluation time, which can hit them before they're
// initialized in that circular-import order and crash the whole app.
function slotLabelStyle() {
  return {
    display: "block", fontFamily: F.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const,
    color: T.inkM, marginBottom: 6, paddingLeft: 2, fontWeight: 500,
  };
}
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
      <label style={slotLabelStyle()}>{label}{optional && <span style={{ textTransform: "none", opacity: 0.7 }}> (optional)</span>}</label>
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
  const [loadingStep, setLoadingStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExtractResult | null>(null);
  // Tracks which single slot (by its flat index into result.slots) has its
  // full edit form open — pills stay compact until tapped, mirroring the
  // manual Edit Timetable screen instead of always showing every field.
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const LOADING_STEPS = [
    "Semester dates found",
    "Holidays identified",
    "Mapping your weekly timetable",
    "Matching rooms & professors",
  ];

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    const timers = [
      setTimeout(() => setLoadingStep(1), 3200),
      setTimeout(() => setLoadingStep(2), 6800),
      setTimeout(() => setLoadingStep(3), 11000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading]);

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
    setExpandedSlot((cur) => (cur === i ? null : cur));
  }
  function renameSubjectGroup(key: string, name: string) {
    if (!result) return;
    const slots = result.slots.map((s) => (s.subject.trim().toLowerCase() === key ? { ...s, subject: name } : s));
    setResult({ ...result, slots });
  }
  function removeSubjectGroup(key: string) {
    if (!result) return;
    setResult({ ...result, slots: result.slots.filter((s) => s.subject.trim().toLowerCase() !== key) });
    setExpandedSlot(null);
  }
  function addSlotToSubject(subjectName: string) {
    if (!result) return;
    const newSlot: ExtractedSlot = { subject: subjectName, type: "lecture", day: 0, startTime: "", endTime: "", room: null, prof: null };
    const newIndex = result.slots.length;
    setResult({ ...result, slots: [...result.slots, newSlot] });
    setExpandedSlot(newIndex);
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
      let newSubjectCount = existing.length;

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
            color: PALETTE[newSubjectCount % PALETTE.length],
            hasLecture: types.has("lecture"),
            hasTutorial: types.has("tutorial"),
            hasPractical: types.has("practical"),
          });
          subject = created;
          newSubjectCount++;
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
  type SubjectGroup = { key: string; name: string; items: { s: ExtractedSlot; i: number }[] };
  const slotsBySubject: SubjectGroup[] = (() => {
    if (!result) return [];
    const map = new Map<string, SubjectGroup>();
    result.slots.forEach((s, i) => {
      const key = s.subject.trim().toLowerCase() || `__untitled_${i}`;
      if (!map.has(key)) map.set(key, { key, name: s.subject, items: [] });
      map.get(key)!.items.push({ s, i });
    });
    return Array.from(map.values());
  })();
  const missingTimeCount = result ? result.slots.filter((s) => !s.startTime || !s.endTime).length : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 80, overflowY: "auto" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 20px 100px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
              boxShadow: "0 8px 18px rgba(94,63,138,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={19} color="#fff" />
            </div>
            <h2 style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 19, color: T.inkH, margin: 0 }}>Smart Import</h2>
          </div>
          {!loading && (
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: 10, flexShrink: 0, border: "none", cursor: "pointer",
              background: "#F1EDF7", display: "flex", alignItems: "center", justifyContent: "center", color: T.accent,
            }}>
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {loading && (
          <div style={{ position: "fixed", inset: 0, zIndex: 82, background: T.bg, display: "flex", flexDirection: "column" }}>
            <div style={{ maxWidth: 420, width: "100%", margin: "0 auto", padding: "24px 20px 0", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                background: "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
                boxShadow: "0 8px 18px rgba(94,63,138,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles size={19} color="#fff" />
              </div>
              <h2 style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 19, color: T.inkH, margin: 0 }}>Smart Import</h2>
            </div>

            {/* Fills whatever space is left between the header and the
                Cancel bar, so the illustration + checklist land in the true
                center of the screen instead of just being top-padded. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 20px" }}>
              <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 120, height: 140, marginBottom: 26, position: "relative" }}>
                  <div style={{
                    width: 100, height: 130, margin: "0 auto", borderRadius: 14, background: "#fff",
                    border: "1.5px solid #EFEAF6", boxShadow: "0 14px 30px rgba(27,21,48,0.1)",
                    position: "relative", overflow: "hidden", padding: "16px 14px",
                  }}>
                    <div style={{ height: 6, borderRadius: 3, background: "#F1EDF7", marginBottom: 9, width: "70%" }} />
                    <div style={{ height: 6, borderRadius: 3, background: "#F1EDF7", marginBottom: 9, width: "100%" }} />
                    <div style={{ height: 6, borderRadius: 3, background: "#F1EDF7", marginBottom: 9, width: "85%" }} />
                    <div style={{ height: 6, borderRadius: 3, background: "#F1EDF7", marginBottom: 9, width: "55%" }} />
                    <div className="ae-scanbeam" style={{
                      position: "absolute", left: 0, right: 0, height: 34,
                      background: "linear-gradient(180deg, transparent, rgba(110,79,145,0.22) 45%, rgba(201,162,75,0.35) 50%, rgba(110,79,145,0.22) 55%, transparent)",
                    }} />
                  </div>
                  <div className="ae-loadchip" style={{
                    position: "absolute", top: 6, left: -8, width: 26, height: 26, borderRadius: 9, background: "#fff",
                    boxShadow: "0 8px 16px rgba(27,21,48,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animationDelay: "0.2s",
                  }}>
                    <CalendarIconSvg />
                  </div>
                  <div className="ae-loadchip" style={{
                    position: "absolute", top: 52, right: -12, width: 26, height: 26, borderRadius: 9, background: "#fff",
                    boxShadow: "0 8px 16px rgba(27,21,48,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animationDelay: "1s",
                  }}>
                    <Clock size={13} color="#C9A24B" strokeWidth={2} />
                  </div>
                  <div className="ae-loadchip" style={{
                    position: "absolute", bottom: 2, left: -4, width: 26, height: 26, borderRadius: 9, background: "#fff",
                    boxShadow: "0 8px 16px rgba(27,21,48,0.14)", display: "flex", alignItems: "center", justifyContent: "center", animationDelay: "1.8s",
                  }}>
                    <MapPin size={13} color="#2F7A5C" strokeWidth={2} />
                  </div>
                </div>

                <h2 style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 21, color: T.inkH, textAlign: "center", margin: "0 0 8px" }}>
                  Reading your files
                </h2>
                <p style={{ fontFamily: F.serif, fontStyle: "italic", fontWeight: 500, fontSize: 13.5, color: T.inkM, textAlign: "center", margin: "0 0 34px" }}>
                  This usually takes about 15 seconds.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start", margin: "0 auto" }}>
                  {LOADING_STEPS.map((stepLabel, i) => {
                    const state = i < loadingStep ? "done" : i === loadingStep ? "active" : "pending";
                    return (
                      <div key={stepLabel} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: state === "done" ? "#DFF0E7" : state === "active" ? "#EFE7F9" : "#F3F1F6",
                          boxShadow: state === "active" ? "0 0 0 4px rgba(110,79,145,0.14)" : "none",
                        }}>
                          {state === "done" && <Check size={13} color="#2F7A5C" strokeWidth={3} />}
                          {state === "active" && <span className="ae-steppulse" style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, display: "block" }} />}
                        </div>
                        <span style={{
                          fontFamily: F.sans, fontSize: 13.5, fontWeight: 600,
                          color: state === "done" ? T.inkH : state === "active" ? T.accent : T.inkL,
                        }}>
                          {stepLabel}
                          {state === "active" && (
                            <span className="ae-ellipsis"><span>.</span><span>.</span><span>.</span></span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pinned to the bottom like every other page's primary action,
                instead of trailing off as a plain text link under the list. */}
            <div style={{ flexShrink: 0, padding: "14px 20px calc(18px + env(safe-area-inset-bottom))", background: T.bg }}>
              <div style={{ maxWidth: 420, margin: "0 auto" }}>
                <button onClick={onClose} style={{
                  width: "100%", padding: 14, borderRadius: 16, cursor: "pointer", border: "none",
                  background: "linear-gradient(155deg,#D8D4DE,#BFB9C8 55%,#A29AB1)", color: T.inkB,
                  fontFamily: F.sans, fontSize: 14.5, fontWeight: 700,
                  boxShadow: "0 8px 18px rgba(122,116,132,0.22), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!loading && !result && (
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
                marginTop: 24, width: "100%", padding: 16, borderRadius: 16, border: "none",
                background: loading ? "#C9BEDB" : "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
                color: "#fff", fontFamily: F.sans, fontWeight: 700, fontSize: 15,
                cursor: loading ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: "0 16px 32px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            >
              {loading ? <Loader2 size={16} className="ae-spin" /> : <Sparkles size={16} />}
              {loading ? "Reading your files..." : "Extract with AI"}
            </button>
          </>
        )}

        {result && (
          <>
            <div style={sectionCardStyle()}>
              <div style={sectionTitleStyle()}>
                Semester (Last Day of Regular Classes — Not Exams)
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <DateBtn value={result.semester.startDate || ""} onChange={(v) => setResult({ ...result, semester: { ...result.semester, startDate: v } })} />
                <DateBtn value={result.semester.endDate || ""} onChange={(v) => setResult({ ...result, semester: { ...result.semester, endDate: v } })} />
              </div>
            </div>

            <div style={sectionCardStyle()}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={sectionTitleStyle()}>
                  Confirmed Holidays ({confirmedGroups.reduce((n, g) => n + g.indices.length, 0)})
                </div>
                <button onClick={addHoliday} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.accent, display: "flex", alignItems: "center", gap: 4, fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                  <Plus size={12} strokeWidth={2.5} /> Add
                </button>
              </div>
              <p style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkM, margin: "7px 0 0", lineHeight: 1.5 }}>
                Calendar explicitly says no classes — these count toward your attendance projection.
              </p>
              {confirmedGroups.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL, marginTop: 12 }}>None found.</div>}
              {confirmedGroups.map((g, gi) => (
                <div key={gi} style={{ padding: "13px 0", borderTop: gi > 0 ? "1px solid #F1EDF7" : "none", marginTop: gi === 0 ? 4 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 9.5, color: T.inkM, fontWeight: 600, background: "#F5F2FA", padding: "4px 9px", borderRadius: 8, flexShrink: 0 }}>
                      {g.startDate === g.endDate ? fmtShort(g.startDate) : `${fmtShort(g.startDate)} – ${fmtShort(g.endDate)}`}
                    </span>
                    <button onClick={() => removeHolidayGroup(g.indices)} style={{
                      width: 26, height: 26, borderRadius: 9, flexShrink: 0, border: "none", cursor: "pointer",
                      background: "#FBE7EA", display: "flex", alignItems: "center", justifyContent: "center", color: T.danger,
                    }}><Trash2 size={13} /></button>
                  </div>
                  <input type="text" placeholder="Label" value={g.label} onChange={(e) => relabelHolidayGroup(g.indices, e.target.value)}
                    style={{
                      width: "100%", padding: "11px 14px", borderRadius: 12, border: "1.5px solid #EFEAF6",
                      background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
                      boxShadow: "0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
                      fontFamily: F.sans, fontSize: 13.5, color: T.inkH, outline: "none", boxSizing: "border-box",
                    }} />
                </div>
              ))}
            </div>

            <div style={sectionCardStyle()}>
              <div style={sectionTitleStyle()}>
                Likely No-Class Days ({likelyGroups.reduce((n, g) => n + g.indices.length, 0)})
              </div>
              <p style={{ fontFamily: F.sans, fontSize: 11.5, color: T.inkM, margin: "7px 0 0", lineHeight: 1.5 }}>
                Fests, exam periods, etc. — not counted automatically, but will show on your Calendar with the reason. Tap "Include" to also count it toward your projection.
              </p>
              {likelyGroups.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL, marginTop: 12 }}>None found.</div>}
              {likelyGroups.map((g, gi) => (
                <div key={gi} style={{ padding: "13px 0", borderTop: gi > 0 ? "1px solid #F1EDF7" : "none", marginTop: gi === 0 ? 4 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 9.5, color: T.inkM, fontWeight: 600, background: "#F5F2FA", padding: "4px 9px", borderRadius: 8, flexShrink: 0 }}>
                      {g.startDate === g.endDate ? fmtShort(g.startDate) : `${fmtShort(g.startDate)} – ${fmtShort(g.endDate)}`}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => promoteHolidayGroup(g.indices)}
                        style={{
                          border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: 20,
                          background: "linear-gradient(155deg,#8E6BB8,#6E4F91)", color: "#fff",
                          fontFamily: F.sans, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                          boxShadow: "0 4px 10px rgba(110,79,145,0.32)",
                        }}>
                        Include
                      </button>
                      <button onClick={() => removeHolidayGroup(g.indices)} style={{
                        width: 26, height: 26, borderRadius: 9, flexShrink: 0, border: "none", cursor: "pointer",
                        background: "#FBE7EA", display: "flex", alignItems: "center", justifyContent: "center", color: T.danger,
                      }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <input type="text" placeholder="Label" value={g.label} onChange={(e) => relabelHolidayGroup(g.indices, e.target.value)}
                    style={{
                      width: "100%", padding: "11px 14px", borderRadius: 12, border: "1.5px solid #EFEAF6",
                      background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
                      boxShadow: "0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
                      fontFamily: F.sans, fontSize: 13.5, color: T.inkH, outline: "none", boxSizing: "border-box",
                    }} />
                </div>
              ))}
            </div>

                        <div style={{ margin: "0 2px 12px" }}>
              <div style={sectionTitleStyle()}>
                Classes ({result.slots.length})
              </div>
              {missingTimeCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontFamily: F.sans, fontSize: 11.5, color: T.danger }}>
                  <AlertTriangle size={13} /> {missingTimeCount} class{missingTimeCount > 1 ? "es are" : " is"} missing a time — tap it below to fill in.
                </div>
              )}
              {result.slots.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: T.inkL, marginTop: 12 }}>No classes found in the timetable file.</div>}
            </div>

            {slotsBySubject.map((group, gi) => {
              const typeCounts: Record<string, number> = {};
              for (const { s } of group.items) typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
              const openItem = group.items.find(({ i }) => i === expandedSlot);

              return (
                <div key={group.key} style={sectionCardStyle()}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(155deg,${PALETTE[gi % PALETTE.length]},#4A3266)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontFamily: F.serif, fontWeight: 700, fontSize: 14,
                    }}>
                      {group.name.trim().charAt(0).toUpperCase() || "?"}
                    </div>
                    <input type="text" value={group.name} onChange={(e) => renameSubjectGroup(group.key, e.target.value)}
                      style={{
                        flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 11, border: "1.5px solid #EFEAF6",
                        background: "#fff", fontFamily: F.serif, fontWeight: 700, fontSize: 15, color: T.inkH, outline: "none", boxSizing: "border-box",
                      }} />
                    <button onClick={() => removeSubjectGroup(group.key)} style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0, border: "none", cursor: "pointer",
                      background: "#FBE7EA", display: "flex", alignItems: "center", justifyContent: "center", color: T.danger,
                    }}><Trash2 size={14} /></button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {Object.entries(typeCounts).map(([type, count]) => (
                      <span key={type} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20,
                        background: "#F5F2FA", fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: T.inkM,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: TYPE_DOT[type], flexShrink: 0 }} />
                        {count} {TYPE_TAG[type]}{count > 1 ? "s" : ""}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {group.items.map(({ s, i }) => {
                      const missingTime = !s.startTime || !s.endTime;
                      const isOpen = i === expandedSlot;
                      return (
                        <button key={i} onClick={() => setExpandedSlot(isOpen ? null : i)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12,
                            border: "none", cursor: "pointer", fontFamily: F.sans, fontSize: 12, fontWeight: 700,
                            background: isOpen ? "linear-gradient(155deg,#8E6BB8,#6E4F91)" : (missingTime ? "#FBE7EA" : "#F5F2FA"),
                            color: isOpen ? "#fff" : (missingTime ? T.danger : T.inkH),
                          }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: isOpen ? "#fff" : TYPE_DOT[s.type], flexShrink: 0 }} />
                          {DAYS_SHORT[s.day]} {missingTime ? "· Set time" : fmtTime(s.startTime)}
                          <span style={{ fontSize: 9, opacity: 0.75 }}>{TYPE_TAG[s.type]}</span>
                        </button>
                      );
                    })}
                    <button onClick={() => addSlotToSubject(group.name)} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 12,
                      border: "1.5px dashed #D8CDEA", cursor: "pointer", background: "transparent",
                      fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: T.accent,
                    }}>
                      <Plus size={12} /> Add slot
                    </button>
                  </div>

                  {openItem && (() => {
                    const { s, i } = openItem;
                    const missingTime = !s.startTime || !s.endTime;
                    return (
                      <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: "#FAF8FC", border: "1px solid #EFEAF6" }}>
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

                        <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
                          <SlotField label="Room" optional>
                            <input type="text" placeholder="e.g. C-204" value={s.room || ""} onChange={(e) => updateSlot(i, { room: e.target.value })} style={slotInputStyle()} />
                          </SlotField>
                          <SlotField label="Professor" optional>
                            <input type="text" placeholder="e.g. Prof. Iyer" value={s.prof || ""} onChange={(e) => updateSlot(i, { prof: e.target.value })} style={slotInputStyle()} />
                          </SlotField>
                        </div>

                        <button onClick={() => removeSlot(i)} style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          padding: 10, borderRadius: 11, border: "none", cursor: "pointer",
                          background: "#FBE7EA", color: T.danger, fontFamily: F.sans, fontWeight: 700, fontSize: 12,
                        }}>
                          <Trash2 size={13} /> Remove this class
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {error && <div style={{ marginBottom: 14, fontFamily: F.sans, fontSize: 12.5, color: T.danger }}>{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setResult(null)} disabled={saving}
                style={{ flex: 1, padding: 16, borderRadius: 16, border: "1.5px solid #EFEAF6", background: "#fff", color: T.inkM, fontFamily: F.sans, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                Back
              </button>
              <button onClick={confirmImport} disabled={saving}
                style={{ flex: 1.6, padding: 16, borderRadius: 16, border: "none", cursor: saving ? "default" : "pointer",
                  background: saving ? "#C9BEDB" : "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color: "#fff",
                  fontFamily: F.sans, fontWeight: 700, fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: saving ? "none" : "0 16px 32px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" }}>
                {saving ? <Loader2 size={16} className="ae-spin" /> : <Check size={16} strokeWidth={2.5} />}
                {saving ? "Saving..." : "Confirm & Create"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}