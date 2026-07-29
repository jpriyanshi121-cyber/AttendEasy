import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, CalendarDays, LayoutGrid, Settings, Plus, ChevronLeft, ChevronRight, ChevronDown,
  X, Check, Ban, RotateCcw, Bell, Cpu, Calculator, PenLine, TrendingUp, Code2,
  Edit2, Download, Archive, BookOpen, GraduationCap, AlertCircle, FileText,
  Sparkles, Star,
} from "lucide-react";
import AuthScreen from "./AuthScreen";
import { api, getToken } from "../lib/api";

// ════════════════════════════════════════════════════════════════
// DESIGN SYSTEM
// ════════════════════════════════════════════════════════════════
export const T = {
  bg:          "#FCFBFE",
  card:        "#FFFFFF",
  accent:      "#6E4F91",
  aFill:       "#EFE7F9",
  aFillDeep:   "#E0D0F4",
  inkH:        "#1B1530",
  inkB:        "#2A2140",
  inkM:        "#8A8194",
  inkL:        "#BAB4C4",
  safe:        "#2F7A5C",
  safeFill:    "#DFF0E7",
  danger:      "#B03A45",
  dangerFill:  "#F8DEE1",
  warn:        "#B8823A",
  warnFill:    "#FEF3E0",
  cancelFill:  "#EFEDF2",
  border:      "rgba(110,79,145,0.1)",
} as const;

export const F = {
  serif: "'Fraunces', Georgia, serif",
  mono:  "'IBM Plex Mono', 'Courier New', monospace",
  sans:  "'Inter', system-ui, sans-serif",
} as const;

export const S = {
  xs:  "0 1px 4px rgba(27,21,48,0.06)",
  sm:  "0 2px 12px rgba(27,21,48,0.07), 0 1px 3px rgba(27,21,48,0.04)",
  md:  "0 4px 24px rgba(27,21,48,0.10), 0 2px 8px rgba(27,21,48,0.05)",
  lg:  "0 8px 40px rgba(27,21,48,0.12), 0 3px 12px rgba(27,21,48,0.06)",
  acc: "0 6px 24px rgba(110,79,145,0.32), 0 2px 8px rgba(110,79,145,0.16)",
} as const;

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════
type Status   = "present" | "absent" | "cancelled" | "rescheduled";
type Screen   = "onboarding" | "home" | "timetable" | "subject" | "calendar" | "semester" | "settings";
type TabId    = "home" | "timetable" | "calendar" | "settings";

interface Subject  { id: string; name: string; code: string; color: string; icon: string; threshold: number; }
interface Slot     { id: string; subjectId: string; day: number; time: string; endTime: string; room: string; prof: string; }
interface Record_  { date: string; slotId: string; subjectId: string; status: Status; note?: string; tag?: string; }
interface Stats    { total: number; attended: number; absent: number; cancelled: number; pct: number; }

// ════════════════════════════════════════════════════════════════
// DATA
// ════════════════════════════════════════════════════════════════
const SUBJECTS: Subject[] = [
  { id:"s1", name:"Data Structures",   code:"CS301", color:"#6E4F91", icon:"Cpu",        threshold:75 },
  { id:"s2", name:"Calculus II",       code:"MA201", color:"#8B6FBB", icon:"Calculator", threshold:75 },
  { id:"s3", name:"Digital Logic",     code:"EC201", color:"#5A3D78", icon:"Code2",      threshold:80 },
  { id:"s4", name:"Tech Writing",      code:"EN301", color:"#9B7FCC", icon:"PenLine",    threshold:75 },
  { id:"s5", name:"Microeconomics",    code:"EC101", color:"#7A5AA0", icon:"TrendingUp", threshold:75 },
];

const SLOTS: Slot[] = [
  { id:"sl1",  subjectId:"s1", day:0, time:"09:00", endTime:"10:00", room:"C-204", prof:"Prof. M. Iyer" },
  { id:"sl2",  subjectId:"s1", day:2, time:"09:00", endTime:"10:00", room:"C-204", prof:"Prof. M. Iyer" },
  { id:"sl3",  subjectId:"s1", day:4, time:"09:00", endTime:"10:00", room:"C-204", prof:"Prof. M. Iyer" },
  { id:"sl4",  subjectId:"s2", day:1, time:"10:00", endTime:"11:30", room:"A-101", prof:"Prof. R. Gupta" },
  { id:"sl5",  subjectId:"s2", day:3, time:"10:00", endTime:"11:30", room:"A-101", prof:"Prof. R. Gupta" },
  { id:"sl6",  subjectId:"s3", day:0, time:"11:00", endTime:"12:00", room:"B-301", prof:"Prof. A. Singh" },
  { id:"sl7",  subjectId:"s3", day:2, time:"11:00", endTime:"12:00", room:"B-301", prof:"Prof. A. Singh" },
  { id:"sl8",  subjectId:"s4", day:1, time:"14:00", endTime:"15:30", room:"D-102", prof:"Prof. V. Nair" },
  { id:"sl9",  subjectId:"s5", day:2, time:"14:00", endTime:"15:00", room:"E-201", prof:"Prof. P. Mehta" },
  { id:"sl10", subjectId:"s5", day:4, time:"14:00", endTime:"15:00", room:"E-201", prof:"Prof. P. Mehta" },
];

// Pre-computed stats as of Tue Jul 29, 2026 (after Calculus morning class)
const STATS: Record<string, Stats> = {
  s1: { total:18, attended:15, absent:2, cancelled:1, pct:83 },
  s2: { total:16, attended:12, absent:3, cancelled:1, pct:75 },
  s3: { total:14, attended:13, absent:1, cancelled:0, pct:93 },
  s4: { total:12, attended:9,  absent:2, cancelled:1, pct:75 },
  s5: { total:15, attended:10, absent:4, cancelled:1, pct:67 }, // below threshold
};
const OVERALL = 79;

// Today = Tuesday July 29, 2026 — day index 1 (Mon=0)
const TODAY_SLOTS = [
  { slot: SLOTS[3], status: "present" as Status, marked: true  },  // Calc 10:00 — done
  { slot: SLOTS[7], status: null as Status|null,  marked: false },  // TechWrite 14:00 — pending
];

const HISTORY: Record_[] = [
  { date:"2026-07-29", slotId:"sl4", subjectId:"s2", status:"present" },
  { date:"2026-07-28", slotId:"sl1", subjectId:"s1", status:"present" },
  { date:"2026-07-28", slotId:"sl6", subjectId:"s3", status:"present" },
  { date:"2026-07-25", slotId:"sl3", subjectId:"s1", status:"absent" },
  { date:"2026-07-25", slotId:"sl9", subjectId:"s5", status:"absent",    note:"Wasn't feeling well" },
  { date:"2026-07-24", slotId:"sl4", subjectId:"s2", status:"present" },
  { date:"2026-07-24", slotId:"sl8", subjectId:"s4", status:"cancelled", tag:"Holiday" },
  { date:"2026-07-23", slotId:"sl5", subjectId:"s2", status:"present" },
  { date:"2026-07-23", slotId:"sl2", subjectId:"s1", status:"present" },
  { date:"2026-07-22", slotId:"sl2", subjectId:"s1", status:"present" },
  { date:"2026-07-22", slotId:"sl7", subjectId:"s3", status:"present" },
  { date:"2026-07-22", slotId:"sl9", subjectId:"s5", status:"absent" },
  { date:"2026-07-21", slotId:"sl1", subjectId:"s1", status:"present" },
  { date:"2026-07-21", slotId:"sl6", subjectId:"s3", status:"absent",    note:"Prof absent" },
  { date:"2026-07-18", slotId:"sl3", subjectId:"s1", status:"present" },
  { date:"2026-07-17", slotId:"sl4", subjectId:"s2", status:"absent" },
  { date:"2026-07-17", slotId:"sl8", subjectId:"s4", status:"present" },
  { date:"2026-07-16", slotId:"sl2", subjectId:"s1", status:"present" },
  { date:"2026-07-15", slotId:"sl1", subjectId:"s1", status:"present" },
  { date:"2026-07-15", slotId:"sl9", subjectId:"s5", status:"absent" },
];

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════
function statusMeta(s: Status) {
  if (s === "present")     return { text:T.safe,   bg:T.safeFill,    label:"Present" };
  if (s === "absent")      return { text:T.danger, bg:T.dangerFill,  label:"Absent" };
  if (s === "cancelled")   return { text:T.inkM,   bg:T.cancelFill,  label:"Cancelled" };
  return                          { text:T.warn,   bg:T.warnFill,    label:"Rescheduled" };
}

function calcBunk(st: Stats, threshold: number) {
  const t  = threshold / 100;
  const canMiss  = Math.max(0, Math.floor(st.attended / t) - st.total);
  const need     = st.pct < threshold
    ? Math.ceil((t * st.total - st.attended) / (1 - t))
    : 0;
  return { canMiss, need };
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN",
    { weekday:"short", day:"numeric", month:"short" });
}

function useCountUp(target: number, ms = 750, trigger = true) {
  const [v, setV] = useState(trigger ? 0 : target);
  useEffect(() => {
    if (!trigger) { setV(target); return; }
    const t0 = performance.now();
    const raf = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * e));
      if (p < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, ms, trigger]);
  return v;
}

// ════════════════════════════════════════════════════════════════
// ATOMS
// ════════════════════════════════════════════════════════════════
function Icon({ name, size=18, color=T.accent }: { name:string; size?:number; color?:string }) {
  const p = { size, color };
  if (name==="Cpu")        return <Cpu {...p} />;
  if (name==="Calculator") return <Calculator {...p} />;
  if (name==="Code2")      return <Code2 {...p} />;
  if (name==="PenLine")    return <PenLine {...p} />;
  if (name==="TrendingUp") return <TrendingUp {...p} />;
  return <BookOpen {...p} />;
}

/* The signature radial-gradient seal — the single most important brand element */
function Seal({ pct, size=84, animate=false, label="OVERALL" }: {
  pct:number; size?:number; animate?:boolean; label?:string;
}) {
  const display = useCountUp(pct, 720, animate);
  const hue = pct >= 75 ? T.safe : pct >= 60 ? T.warn : T.danger;
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:"radial-gradient(circle at 38% 33%, #ffffff 0%, #f0e9fb 55%, #ddd0ef 100%)",
      boxShadow:`0 8px 28px rgba(110,79,145,0.26), 0 2px 6px rgba(110,79,145,0.14), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(110,79,145,0.08)`,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden",
    }}>
      {/* subtle inner rim */}
      <div style={{ position:"absolute", inset:3, borderRadius:"50%", border:"1px solid rgba(110,79,145,0.1)", pointerEvents:"none" }} />
      <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:size*0.295, color:INK(pct), lineHeight:1, zIndex:1 }}>
        {display}%
      </span>
      {label && (
        <span style={{ fontFamily:F.mono, fontSize:size*0.09, color:T.inkM, letterSpacing:"0.13em", textTransform:"uppercase", marginTop:3, zIndex:1 }}>
          {label}
        </span>
      )}
    </div>
  );
}

function INK(pct: number) { return pct >= 75 ? T.safe : pct >= 60 ? T.warn : T.danger; }

function Pill({ status }: { status:Status }) {
  const { text, bg, label } = statusMeta(status);
  return (
    <span style={{
      fontFamily:F.mono, fontSize:10, color:text, background:bg,
      padding:"3px 10px", borderRadius:100, letterSpacing:"0.04em", whiteSpace:"nowrap", flexShrink:0,
    }}>{label}</span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.17em", textTransform:"uppercase", marginBottom:0 }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ height:1, background:"rgba(110,79,145,0.07)", margin:"0 0" }} />;
}

// ════════════════════════════════════════════════════════════════
// SCREEN 1 — ONBOARDING
// ════════════════════════════════════════════════════════════════
function OnboardingScreen({ onDone }: { onDone:()=>void }) {
  const [step,  setStep]  = useState<0|1>(0);
  const [name,  setName]  = useState("");
  const [pulse, setPulse] = useState(false);

  const [semesterId, setSemesterId] = useState<string|null>(null);
  const [subjects, setSubjects] = useState<{id:string; name:string; color:string; threshold:number}[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newThreshold, setNewThreshold] = useState("75");
  const [error, setError] = useState<string|null>(null);

  const PALETTE = ["#6E4F91","#8B6FBB","#5A3D78","#9B7FCC","#7A5AA0"];

  useEffect(() => {
    if (step !== 1) return;
    const id = setInterval(() => setPulse(p => !p), 1600);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    (async () => {
      try {
        const { semesters } = await api.get("/semesters");
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (active) {
          setSemesterId(active.id);
          const { subjects: fetched } = await api.get(`/subjects?semesterId=${active.id}`);
          setSubjects(fetched);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function addSubject() {
    if (!newName.trim() || !semesterId) return;
    setLoading(true);
    setError(null);
    try {
      const color = PALETTE[subjects.length % PALETTE.length];
      const { subject } = await api.post("/subjects", {
        semesterId,
        name: newName.trim(),
        color,
        threshold: parseInt(newThreshold, 10) || 75,
      });
      setSubjects(prev => [...prev, subject]);
      setNewName("");
      setNewThreshold("75");
      setAdding(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      {step === 0 ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"60px 28px 44px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:56 }} className="ae0">
            <div style={{
              width:44, height:44, borderRadius:14,
              background:"linear-gradient(140deg,#6E4F91 0%,#9B7FCC 100%)",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:S.acc,
            }}>
              <GraduationCap size={22} color="#fff" />
            </div>
            <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:23, color:T.inkH, letterSpacing:"-0.01em" }}>AttendEasy</span>
          </div>

          <div style={{ flex:1 }}>
            <div className="ae1" style={{ marginBottom:10 }}><Eyebrow>MONSOON SEMESTER · 2026</Eyebrow></div>
            <h1 className="ae2" style={{ fontFamily:F.serif, fontWeight:600, fontSize:36, color:T.inkH, lineHeight:1.16, marginBottom:18 }}>
              Never guess<br />your attendance<br />again.
            </h1>
            <p className="ae3" style={{ fontSize:15, color:T.inkM, lineHeight:1.7, marginBottom:48 }}>
              AttendEasy tracks every class so you always know exactly where you stand — before it's too late.
            </p>
            <div className="ae4">
              <label style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.16em", textTransform:"uppercase", display:"block", marginBottom:10 }}>
                YOUR NAME
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                style={{
                  width:"100%", padding:"16px 18px", borderRadius:16,
                  border:`1.5px solid rgba(110,79,145,0.22)`, background:T.card,
                  fontFamily:F.sans, fontSize:16, color:T.inkH, outline:"none",
                  boxShadow:S.sm, transition:"border-color 0.2s",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
                onBlur={e  => (e.currentTarget.style.borderColor = "rgba(110,79,145,0.22)")}
              />
            </div>
          </div>

          <button
            className="ae5"
            onClick={() => setStep(1)}
            style={{
              width:"100%", padding:"18px", borderRadius:20, border:"none",
              background:T.accent, color:"#fff",
              fontFamily:F.sans, fontSize:16, fontWeight:600, cursor:"pointer",
              boxShadow:S.acc, letterSpacing:"0.01em",
              transition:"transform 0.14s ease, box-shadow 0.14s ease",
            }}
            onMouseDown={e => { e.currentTarget.style.transform="scale(0.98)"; e.currentTarget.style.boxShadow=S.sm; }}
            onMouseUp={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow=S.acc; }}
          >
            Continue →
          </button>
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"60px 28px 28px" }}>
            <div className="ae0" style={{ marginBottom:8 }}><Eyebrow>STEP 2 OF 2 · SUBJECTS</Eyebrow></div>
            <h2 className="ae1" style={{ fontFamily:F.serif, fontWeight:600, fontSize:30, color:T.inkH, lineHeight:1.15, marginBottom:8 }}>
              Your enrolled<br />courses
            </h2>
            <p className="ae2" style={{ fontSize:14, color:T.inkM }}>Add each subject you're taking this semester.</p>
          </div>

          <div style={{ flex:1, overflow:"auto", padding:"0 28px" }}>
            {subjects.map((s, i) => (
              <SubjectSlotRow key={s.id} subject={s} index={i} semesterId={semesterId!} />
            ))}

            {adding ? (
              <div style={{
                padding:"16px", borderRadius:18, marginBottom:10, background:T.card,
                boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)`,
              }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Subject name"
                  style={{
                    width:"100%", padding:"12px 14px", borderRadius:12, marginBottom:10,
                    border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg,
                    fontFamily:F.sans, fontSize:14, color:T.inkH, outline:"none", boxSizing:"border-box",
                  }}
                />
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
                  <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>Threshold %</span>
                  <input
                    value={newThreshold}
                    onChange={e => setNewThreshold(e.target.value.replace(/\D/g, ""))}
                    style={{
                      width:60, padding:"8px 10px", borderRadius:10,
                      border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg,
                      fontFamily:F.sans, fontSize:13, color:T.inkH, outline:"none", textAlign:"center",
                    }}
                  />
                </div>
                {error && <p style={{ color:T.danger, fontSize:12, marginBottom:10 }}>{error}</p>}
                <div style={{ display:"flex", gap:8 }}>
                  <button
                    onClick={() => { setAdding(false); setError(null); }}
                    style={{ flex:1, padding:"11px", borderRadius:12, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:13, fontWeight:600, cursor:"pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSubject}
                    disabled={loading}
                    style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:T.accent, color:"#fff", fontFamily:F.sans, fontSize:13, fontWeight:600, cursor:"pointer" }}
                  >
                    {loading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                style={{
                  width:"100%", padding:"15px", borderRadius:18, marginTop:2, marginBottom:8,
                  border:`1.5px dashed rgba(110,79,145,0.3)`, background:"transparent",
                  color:T.accent, fontFamily:F.sans, fontSize:14, fontWeight:500,
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}
              >
                <Plus size={15} /> Add Subject
              </button>
            )}
          </div>

          <div style={{ padding:"20px 28px 52px" }}>
            <button
              onClick={onDone}
              disabled={subjects.length === 0}
              style={{
                width:"100%", padding:"18px", borderRadius:20, border:"none",
                background: subjects.length === 0 ? "rgba(110,79,145,0.25)" : T.accent, color:"#fff",
                fontFamily:F.sans, fontSize:16, fontWeight:600, cursor: subjects.length === 0 ? "not-allowed" : "pointer",
                boxShadow: subjects.length === 0 ? "none" : S.acc,
                transform: pulse ? "scale(1.022)" : "scale(1)",
                transition:"transform 0.55s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectSlotRow({ subject, index, semesterId }: {
  subject: {id:string; name:string; color:string; threshold:number};
  index: number;
  semesterId: string;
}) {
  const [slots, setSlots] = useState<{id:string; day:number; startTime:string; endTime:string; room:string|null}[]>([]);
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [loading, setLoading] = useState(false);
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  useEffect(() => {
    (async () => {
      const { slots: fetched } = await api.get(`/slots?semesterId=${semesterId}`);
      setSlots(fetched.filter((s:any) => s.subjectId === subject.id));
    })();
  }, [subject.id, semesterId]);

  async function addSlot() {
    setLoading(true);
    try {
      const { slot } = await api.post("/slots", {
        semesterId, subjectId: subject.id,
        day: parseInt(day, 10), startTime, endTime, room: room || undefined,
      });
      setSlots(prev => [...prev, slot]);
      setAdding(false);
      setRoom("");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`ae${Math.min(index+1,5)}`} style={{
      padding:"15px 16px", borderRadius:18, marginBottom:10, background:T.card,
      boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)`,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:T.aFill, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon name="BookOpen" size={19} color={subject.color} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16, color:T.inkH, marginBottom:3 }}>{subject.name}</div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.05em" }}>
            {subject.threshold}% threshold · {slots.length} slot{slots.length===1?"":"s"}/wk
          </div>
        </div>
      </div>

      {slots.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10 }}>
          {slots.map(sl => (
            <span key={sl.id} style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"3px 10px", borderRadius:8 }}>
              {DAYS[sl.day]} {sl.startTime}
            </span>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop:12 }}>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <select value={day} onChange={e => setDay(e.target.value)} style={{ ...miniField, flex:1 }}>
              {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
            </select>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...miniField, width:90 }} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...miniField, width:90 }} />
          </div>
          <input placeholder="Room (optional)" value={room} onChange={e => setRoom(e.target.value)} style={{ ...miniField, width:"100%", marginBottom:8, boxSizing:"border-box" }} />
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setAdding(false)} style={{ flex:1, padding:"9px", borderRadius:10, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
            <button onClick={addSlot} disabled={loading} style={{ flex:1, padding:"9px", borderRadius:10, border:"none", background:T.accent, color:"#fff", fontFamily:F.sans, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          marginTop:10, padding:"8px 12px", borderRadius:10, border:`1.5px dashed rgba(110,79,145,0.3)`,
          background:"transparent", color:T.accent, fontFamily:F.sans, fontSize:12, fontWeight:500,
          cursor:"pointer", display:"flex", alignItems:"center", gap:6,
        }}>
          <Plus size={13} /> Add Class Time
        </button>
      )}
    </div>
  );
}

const miniField: React.CSSProperties = {
  padding:"9px 10px", borderRadius:10,
  border:`1.5px solid rgba(110,79,145,0.18)`, background:"#FCFBFE",
  fontFamily:"'Inter', system-ui, sans-serif", fontSize:12, outline:"none",
};

// ════════════════════════════════════════════════════════════════
// SCREEN 2 — HOME DASHBOARD
// ════════════════════════════════════════════════════════════════
function HomeScreen({ onSubject, onMark }: {
  onSubject:(id:string)=>void;
  onMark:(slotId:string)=>void;
}) {
  const [quicked, setQuicked] = useState<Record<string,Status>>({});
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      {/* ── Header ── */}
      <div style={{ padding:"56px 24px 0", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div className="ae0" style={{ marginBottom:10 }}>
            <Eyebrow>MONSOON 2026 · TUE 29 JUL</Eyebrow>
          </div>
          <h1 className="ae1" style={{ fontFamily:F.serif, fontWeight:600, fontSize:34, color:T.inkH, lineHeight:1.05, marginBottom:6 }}>
            Hey, Arjun.
          </h1>
          <p className="ae2" style={{ fontSize:14, color:T.inkM }}>2 classes today</p>
        </div>
        <div className="ae1" style={{ paddingTop:2 }}>
          <Seal pct={OVERALL} size={80} animate={true} />
        </div>
      </div>

      {/* ── Subject cards ── */}
      <div style={{ marginTop:34, paddingLeft:24 }} className="ae3">
        <Eyebrow>YOUR SUBJECTS</Eyebrow>
        <div style={{ display:"flex", gap:12, overflowX:"auto", paddingRight:24, paddingBottom:8, marginTop:14 }}>
          {SUBJECTS.map((subj, i) => {
            const st   = STATS[subj.id];
            const warn = st.pct < subj.threshold;
            return (
              <button
                key={subj.id}
                onClick={() => onSubject(subj.id)}
                className={`ae${i+1}`}
                style={{
                  flexShrink:0, width:148, height:164, padding:"18px 16px", borderRadius:22, border:"none",
                  background:`linear-gradient(148deg, ${subj.color} 0%, ${subj.color}AA 100%)`,
                  boxShadow:`0 8px 24px ${subj.color}50`,
                  display:"flex", flexDirection:"column", justifyContent:"space-between", textAlign:"left",
                  cursor:"pointer", transition:"transform 0.16s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.16s ease",
                  position:"relative", overflow:"hidden",
                }}
                onMouseDown={e => { e.currentTarget.style.transform="scale(0.95)"; e.currentTarget.style.boxShadow=`0 4px 12px ${subj.color}40`; }}
                onMouseUp={e   => { e.currentTarget.style.transform="scale(1)";    e.currentTarget.style.boxShadow=`0 8px 24px ${subj.color}50`; }}
              >
                {/* subtle shimmer top-right */}
                <div style={{ position:"absolute", top:-20, right:-20, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.12)", pointerEvents:"none" }} />
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ width:34, height:34, borderRadius:11, background:"rgba(255,255,255,0.22)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Icon name={subj.icon} size={16} color="#fff" />
                  </div>
                  {warn && <AlertCircle size={14} color="rgba(255,220,180,0.95)" />}
                </div>
                <div>
                  <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:34, color:"#fff", lineHeight:1, marginBottom:5 }}>
                    {st.pct}%
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:"rgba(255,255,255,0.7)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                    {subj.code}
                  </div>
                  {warn && (
                    <div style={{ marginTop:8, fontFamily:F.mono, fontSize:9, color:"rgba(255,224,188,1)", background:"rgba(0,0,0,0.24)", padding:"3px 8px", borderRadius:100, display:"inline-block" }}>
                      Below {subj.threshold}%
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Today timeline ── */}
      <div style={{ margin:"36px 24px 0" }} className="ae4">
        <Eyebrow>TODAY</Eyebrow>
        <div style={{ position:"relative", marginTop:18 }}>
          {/* gradient line */}
          <div style={{
            position:"absolute", left:18, top:14, bottom:14, width:2,
            background:`linear-gradient(to bottom, ${T.accent}90 0%, ${T.accent}18 100%)`,
            borderRadius:2,
          }} />
          {TODAY_SLOTS.map(({ slot, status, marked }, idx) => {
            const subj       = SUBJECTS.find(s => s.id === slot.subjectId)!;
            const local      = quicked[slot.id] || status;
            const isPending  = !marked && !quicked[slot.id];
            const dotColor   = isPending ? T.aFillDeep : local === "present" ? T.safe : T.danger;
            return (
              <div key={slot.id} style={{ display:"flex", gap:18, marginBottom:16 }} className={`ae${idx+1}`}>
                {/* dot */}
                <div style={{ width:38, flexShrink:0, display:"flex", justifyContent:"center", paddingTop:18 }}>
                  <div style={{
                    width:10, height:10, borderRadius:"50%", zIndex:1, position:"relative",
                    background: dotColor,
                    border:`2px solid ${T.bg}`,
                    boxShadow:`0 0 0 3px ${dotColor}40`,
                  }} />
                </div>
                {/* card */}
                <div style={{
                  flex:1, background:T.card, borderRadius:20, padding:"18px 18px",
                  boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)`,
                  borderLeft: isPending ? `3px solid ${T.aFillDeep}` : `3px solid ${dotColor}`,
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                    <div>
                      <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:18, color:T.inkH, marginBottom:5 }}>
                        {subj.name}
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>{slot.time}–{slot.endTime}</span>
                        <span style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"2px 9px", borderRadius:7 }}>{slot.room}</span>
                      </div>
                      <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkL, marginTop:5 }}>{slot.prof}</div>
                    </div>
                    {!isPending && local && <Pill status={local} />}
                  </div>

                  {isPending && (
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                      {(["present","absent","cancelled"] as Status[]).map(s => {
                        const { text, bg, label } = statusMeta(s);
                        return (
                          <button key={s}
                            onClick={() => setQuicked(p => ({ ...p, [slot.id]: s }))}
                            style={{
                              padding:"7px 14px", borderRadius:100, border:`1.5px solid ${text}25`,
                              background:bg, color:text,
                              fontFamily:F.sans, fontSize:12, fontWeight:600, cursor:"pointer",
                              transition:"transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
                            }}
                            onMouseDown={e => (e.currentTarget.style.transform="scale(0.90)")}
                            onMouseUp={e   => (e.currentTarget.style.transform="scale(1)")}
                          >{label}</button>
                        );
                      })}
                      <button onClick={() => onMark(slot.id)} style={{
                        padding:"7px 13px", borderRadius:100,
                        border:`1.5px solid rgba(110,79,145,0.22)`, background:"transparent",
                        color:T.accent, fontFamily:F.sans, fontSize:12, fontWeight:500, cursor:"pointer",
                      }}>+ Note</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setFabOpen(f => !f)}
        style={{
          position:"fixed", right:24, bottom:94, width:58, height:58, borderRadius:"50%",
          background:T.accent, border:"none", cursor:"pointer", zIndex:20,
          boxShadow:S.acc,
          display:"flex", alignItems:"center", justifyContent:"center",
          transform: fabOpen ? "rotate(45deg) scale(1.06)" : "rotate(0) scale(1)",
          transition:"transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <Plus size={26} color="#fff" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 3 — FULL TIMETABLE
// ════════════════════════════════════════════════════════════════
function TimetableScreen({ onMark }: { onMark:(slotId:string)=>void }) {
  const [wk, setWk] = useState(0);
  const HOURS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00"];
  const DAYS  = ["Mon","Tue","Wed","Thu","Fri"];

  // Mon Jul 28 = base for wk=0; today (Tue 29) is index 1
  const dates = (() => {
    const mon = new Date(2026,6,28);
    return Array.from({ length:5 }, (_,i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i + wk*7);
      return d;
    });
  })();

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, height:"100vh", display:"flex", flexDirection:"column", paddingBottom:80 }}>
      <div style={{ padding:"56px 20px 16px", flexShrink:0 }}>
        <div className="ae0" style={{ marginBottom:8 }}><Eyebrow>WEEK VIEW</Eyebrow></div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Timetable</h2>
          <div style={{ display:"flex", gap:5 }}>
            <button onClick={() => setWk(w=>w-1)} style={navBtn}><ChevronLeft size={15} color={T.inkM} /></button>
            <button onClick={() => setWk(0)} style={{ ...navBtn, background: wk===0 ? T.aFill : T.card, color: wk===0 ? T.accent : T.inkM, padding:"0 11px", width:"auto", fontFamily:F.mono, fontSize:9, letterSpacing:"0.1em" }}>TODAY</button>
            <button onClick={() => setWk(w=>w+1)} style={navBtn}><ChevronRight size={15} color={T.inkM} /></button>
          </div>
        </div>
      </div>

      {/* Day header */}
      <div style={{ display:"flex", paddingLeft:46, paddingRight:12, gap:5, marginBottom:10, flexShrink:0 }}>
        {dates.map((d,i) => {
          const today = wk===0 && i===1;
          return (
            <div key={i} style={{ flex:1, textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:today?T.accent:T.inkM, letterSpacing:"0.1em", textTransform:"uppercase" }}>{DAYS[i]}</div>
              <div style={{
                fontFamily:F.serif, fontWeight:600, fontSize:17,
                color: today?"#fff":T.inkH,
                width:28, height:28, borderRadius:"50%",
                background: today?T.accent:"transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                margin:"4px auto 0",
                boxShadow: today?S.acc:"none",
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ flex:1, overflow:"auto", paddingRight:12 }}>
        {HOURS.map(hr => (
          <div key={hr} style={{ display:"flex", gap:5, marginBottom:6, minHeight:58, alignItems:"stretch" }}>
            <div style={{ width:40, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:8 }}>
              <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM }}>{hr}</span>
            </div>
            {Array.from({ length:5 }, (_,di) => {
              const slot = SLOTS.find(s => s.day===di && s.time===hr);
              if (!slot) return (
                <div key={di} style={{
                  flex:1, borderRadius:11, minHeight:58,
                  background:"rgba(110,79,145,0.025)",
                  border:"1px solid rgba(110,79,145,0.05)",
                }} />
              );
              const subj = SUBJECTS.find(s => s.id===slot.subjectId)!;
              return (
                <button key={di} onClick={() => onMark(slot.id)} style={{
                  flex:1, borderRadius:11, border:"none", cursor:"pointer",
                  background:T.aFill, padding:"8px 7px",
                  display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4,
                  borderLeft:`3px solid ${subj.color}`,
                  transition:"transform 0.12s ease, box-shadow 0.12s ease", outline:"none",
                }}
                  onMouseDown={e => { e.currentTarget.style.transform="scale(0.95)"; e.currentTarget.style.boxShadow=S.sm; }}
                  onMouseUp={e   => { e.currentTarget.style.transform="scale(1)";    e.currentTarget.style.boxShadow="none"; }}
                >
                  <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:11, color:T.inkH, lineHeight:1.3 }}>{subj.name}</span>
                  <span style={{ fontFamily:F.mono, fontSize:9, color:subj.color, letterSpacing:"0.04em" }}>{slot.room}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width:34, height:34, borderRadius:10,
  border:`1px solid rgba(110,79,145,0.14)`, background:T.card,
  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
};

// ════════════════════════════════════════════════════════════════
// SCREEN 4 — SUBJECT DETAIL
// ════════════════════════════════════════════════════════════════
function SubjectDetailScreen({ subjectId, onBack, onMark }: {
  subjectId:string; onBack:()=>void; onMark:(slotId:string)=>void;
}) {
  const subj     = SUBJECTS.find(s => s.id===subjectId)!;
  const stats    = STATS[subjectId];
  const { canMiss, need } = calcBunk(stats, subj.threshold);
  const isGood   = canMiss > 0;
  const bunkVal  = useCountUp(isGood ? canMiss : need, 680);
  const history  = HISTORY.filter(r => r.subjectId===subjectId).slice(0,8);
  const slots    = SLOTS.filter(s => s.subjectId===subjectId);

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:108 }}>
      {/* Header */}
      <div style={{ padding:"56px 24px 0" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6, color:T.accent, marginBottom:28, padding:0, fontFamily:F.sans, fontSize:14, fontWeight:500 }}>
          <ChevronLeft size={17} /> Back
        </button>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div style={{ flex:1, paddingRight:16 }}>
            <div style={{ marginBottom:10 }}><Eyebrow>{subj.code}</Eyebrow></div>
            <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:30, color:T.inkH, lineHeight:1.15, marginBottom:8 }}>{subj.name}</h2>
            <p style={{ fontSize:13, color:T.inkM, marginBottom:12 }}>{slots[0]?.prof}</p>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {slots.map(sl => (
                <span key={sl.id} style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"3px 10px", borderRadius:8 }}>
                  {["Mon","Tue","Wed","Thu","Fri"][sl.day]} {sl.time}
                </span>
              ))}
            </div>
          </div>
          <Seal pct={stats.pct} size={84} animate={true} label={`${subj.threshold}% min`} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"flex", gap:8, padding:"24px 24px 0" }}>
        {[
          { label:"Total",     v:stats.total,     c:T.inkH },
          { label:"Attended",  v:stats.attended,  c:T.safe },
          { label:"Missed",    v:stats.absent,    c:T.danger },
          { label:"Cancelled", v:stats.cancelled, c:T.inkM },
        ].map(item => (
          <div key={item.label} style={{
            flex:1, background:T.card, borderRadius:17, padding:"14px 8px",
            textAlign:"center", boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.06)`,
          }}>
            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:26, color:item.c }}>{item.v}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.09em", marginTop:3 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Bunk calculator */}
      <div style={{ margin:"20px 24px", background:T.card, borderRadius:24, padding:"24px 22px", boxShadow:S.md, border:`1px solid rgba(110,79,145,0.08)` }}>
        <div style={{ marginBottom:14 }}><Eyebrow>{isGood ? "SAFE TO SKIP" : "RECOVERY PLAN"}</Eyebrow></div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, marginBottom:12 }}>
          <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:76, color: isGood?T.safe:T.danger, lineHeight:1 }}>{bunkVal}</span>
          <span style={{ fontFamily:F.serif, fontSize:18, color:T.inkM, paddingBottom:12 }}>class{(isGood?canMiss:need)!==1?"es":""}</span>
        </div>
        <p style={{ fontSize:14, color:T.inkM, lineHeight:1.6 }}>
          {isGood
            ? `You can miss ${canMiss} more class${canMiss!==1?"es":""} and still hold above ${subj.threshold}%.`
            : `Attend the next ${need} class${need!==1?"es":""} in a row to recover to ${subj.threshold}%.`
          }
        </p>
        {!isGood && (
          <div style={{ marginTop:14, padding:"11px 15px", borderRadius:13, background:T.dangerFill, display:"flex", alignItems:"center", gap:10 }}>
            <AlertCircle size={15} color={T.danger} />
            <span style={{ fontSize:12, color:T.danger, fontWeight:600 }}>Currently at {stats.pct}% — {subj.threshold - stats.pct}pp below threshold</span>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ padding:"0 24px" }}>
        <div style={{ marginBottom:14 }}><Eyebrow>ATTENDANCE HISTORY</Eyebrow></div>
        {history.map((rec, i) => {
          const sl   = SLOTS.find(s => s.id===rec.slotId);
          return (
            <div key={i} className={`ae${Math.min(i+1,5)}`} style={{
              display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
              background:T.card, borderRadius:17, marginBottom:8,
              boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.06)`,
            }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.serif, fontSize:15, color:T.inkH, fontWeight:500, marginBottom:4 }}>{fmtDate(rec.date)}</div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  {sl && <span style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{sl.time}</span>}
                  {sl && <span style={{ fontFamily:F.mono, fontSize:9, color:T.accent, background:T.aFill, padding:"1px 7px", borderRadius:6 }}>{sl.room}</span>}
                  {rec.tag && <span style={{ fontFamily:F.mono, fontSize:9, color:T.warn, background:T.warnFill, padding:"1px 7px", borderRadius:6 }}>{rec.tag}</span>}
                </div>
                {rec.note && <p style={{ fontSize:12, color:T.inkM, fontStyle:"italic", marginTop:5, lineHeight:1.45 }}>{rec.note}</p>}
              </div>
              <Pill status={rec.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 5 — MARK ATTENDANCE SHEET
// ════════════════════════════════════════════════════════════════
function AttendanceSheet({ slotId, onClose, onSave }: {
  slotId:string|null; onClose:()=>void; onSave:(id:string,s:Status,note?:string,tag?:string)=>void;
}) {
  const [sel,    setSel]    = useState<Status|null>(null);
  const [cTag,   setCTag]   = useState<string|null>(null);
  const [note,   setNote]   = useState("");
  const [rMode,  setRMode]  = useState<"add"|"replace">("add");
  const [visible,setVisible]= useState(false);

  useEffect(() => {
    if (slotId) { setSel(null); setCTag(null); setNote(""); setVisible(false); requestAnimationFrame(() => setVisible(true)); }
  }, [slotId]);

  if (!slotId) return null;
  const slot = SLOTS.find(s => s.id===slotId)!;
  const subj = SUBJECTS.find(s => s.id===slot.subjectId)!;
  const TAGS = ["Holiday","Prof Absent","Exam","Other"];
  const OPTS: { s:Status; desc:string; icon:React.ReactNode }[] = [
    { s:"present",     desc:"I attended this class",     icon:<Check size={18}/> },
    { s:"absent",      desc:"I missed this class",        icon:<X size={18}/> },
    { s:"cancelled",   desc:"Class was called off",       icon:<Ban size={18}/> },
    { s:"rescheduled", desc:"Moving to another time",     icon:<RotateCcw size={18}/> },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:"fixed", inset:0,
          background: visible ? "rgba(27,21,48,0.44)" : "rgba(27,21,48,0)",
          backdropFilter:"blur(5px)",
          transition:"background 0.25s ease",
          zIndex:50,
        }}
      />
      {/* Sheet */}
      <div style={{
        position:"fixed", bottom:0, left:"50%",
        width:"100%", maxWidth:390,
        background:T.card, borderRadius:"28px 28px 0 0",
        boxShadow:`0 -12px 56px rgba(27,21,48,0.20)`,
        zIndex:51,
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(100%)",
        transition:`transform 0.42s cubic-bezier(0.22,1.3,0.55,1)`,
      }}>
        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"16px 0 0" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:"rgba(27,21,48,0.1)" }} />
        </div>

        {/* Subject info */}
        <div style={{ padding:"16px 24px 18px", borderBottom:`1px solid rgba(110,79,145,0.09)` }}>
          <div style={{ marginBottom:5 }}><Eyebrow>MARK ATTENDANCE</Eyebrow></div>
          <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:T.inkH, marginBottom:6 }}>{subj.name}</h3>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>Today · {slot.time}–{slot.endTime}</span>
            <span style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"2px 9px", borderRadius:7 }}>{slot.room}</span>
          </div>
        </div>

        {/* Options */}
        <div style={{ padding:"18px 24px 0", maxHeight:"65vh", overflowY:"auto" }}>
          {OPTS.map(({ s, desc, icon }) => {
            const { text, bg, label } = statusMeta(s);
            const on = sel===s;
            return (
              <button key={s} onClick={() => { setSel(s); setCTag(null); }} style={{
                width:"100%", padding:"15px 16px", borderRadius:19,
                border:`2px solid ${on ? text : "transparent"}`,
                background: on ? bg : "rgba(110,79,145,0.035)",
                display:"flex", alignItems:"center", gap:14,
                cursor:"pointer", marginBottom:9, textAlign:"left",
                transition:"all 0.18s ease",
                transform: on ? "scale(1.012)" : "scale(1)",
              }}>
                <div style={{
                  width:40, height:40, borderRadius:12, flexShrink:0,
                  background: on ? bg : T.card,
                  border:`1.5px solid ${text}28`,
                  display:"flex", alignItems:"center", justifyContent:"center", color:text,
                  boxShadow: on ? `0 3px 10px ${text}25` : S.xs,
                  transition:"box-shadow 0.18s ease, background 0.18s ease",
                }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontFamily:F.sans, fontWeight:600, fontSize:15, color:text, marginBottom:2 }}>{label}</div>
                  <div style={{ fontFamily:F.sans, fontSize:12, color:T.inkM }}>{desc}</div>
                </div>
                {on && (
                  <div style={{ marginLeft:"auto", width:20, height:20, borderRadius:"50%", background:text, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Check size={12} color="#fff" />
                  </div>
                )}
              </button>
            );
          })}

          {/* Cancel quick-tags */}
          {sel==="cancelled" && (
            <div style={{ marginBottom:12, padding:"16px", background:T.aFill, borderRadius:18, animation:"ae0 0.28s ease both" }}>
              <div style={{ marginBottom:10 }}><Eyebrow>REASON (OPTIONAL)</Eyebrow></div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {TAGS.map(tag => (
                  <button key={tag} onClick={() => setCTag(cTag===tag?null:tag)} style={{
                    padding:"8px 16px", borderRadius:100, border:"none",
                    background: cTag===tag ? T.accent : T.card,
                    color: cTag===tag ? "#fff" : T.accent,
                    fontFamily:F.sans, fontSize:13, fontWeight:500, cursor:"pointer",
                    boxShadow: cTag===tag ? S.acc : S.xs,
                    transform: cTag===tag ? "scale(1.06)" : "scale(1)",
                    transition:"all 0.18s cubic-bezier(0.34,1.56,0.64,1)",
                  }}>{tag}</button>
                ))}
              </div>
            </div>
          )}

          {/* Reschedule fields */}
          {sel==="rescheduled" && (
            <div style={{ marginBottom:12, padding:"16px", background:T.warnFill, borderRadius:18, animation:"ae0 0.28s ease both" }}>
              {/* Segmented toggle */}
              <div style={{ display:"flex", background:"rgba(255,255,255,0.6)", borderRadius:13, padding:3, marginBottom:14 }}>
                {(["add","replace"] as const).map(m => (
                  <button key={m} onClick={() => setRMode(m)} style={{
                    flex:1, padding:"10px", borderRadius:11, border:"none",
                    background: rMode===m ? T.accent : "transparent",
                    color: rMode===m ? "#fff" : T.inkM,
                    fontFamily:F.sans, fontSize:13, fontWeight:600, cursor:"pointer",
                    transition:"all 0.22s cubic-bezier(0.34,1.56,0.64,1)",
                    boxShadow: rMode===m ? S.acc : "none",
                  }}>{m==="add" ? "Extra Class" : "Replace Slot"}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input placeholder="Date" style={fieldStyle} />
                <input placeholder="Time" style={{ ...fieldStyle, width:80 }} />
                <input placeholder="Room" style={{ ...fieldStyle, width:70 }} />
              </div>
            </div>
          )}

          {/* Note */}
          <input
            placeholder="Add a note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ ...fieldStyle, width:"100%", fontStyle: note?"normal":"italic", marginBottom:0 }}
          />

          {/* Save */}
          <button
            disabled={!sel}
            onClick={() => { if (sel && slotId) { onSave(slotId,sel,note||undefined,cTag||undefined); onClose(); }}}
            style={{
              width:"100%", padding:"17px", borderRadius:20, border:"none",
              background: sel ? T.accent : "rgba(110,79,145,0.12)",
              color: sel ? "#fff" : T.inkM,
              fontFamily:F.sans, fontSize:16, fontWeight:600,
              cursor: sel ? "pointer" : "not-allowed",
              marginTop:14, marginBottom:10,
              boxShadow: sel ? S.acc : "none",
              transition:"all 0.22s ease",
              transform: sel ? "scale(1)" : "scale(0.99)",
            }}
          >
            Save Attendance
          </button>
        </div>
      </div>
    </>
  );
}

const fieldStyle: React.CSSProperties = {
  flex:1, padding:"12px 14px", borderRadius:13,
  border:`1.5px solid rgba(110,79,145,0.18)`, background:T.card,
  fontFamily:F.sans, fontSize:13, color:T.inkH, outline:"none",
};

// ════════════════════════════════════════════════════════════════
// SCREEN 6 — CALENDAR / HISTORY
// ════════════════════════════════════════════════════════════════
function CalendarScreen() {
  const [expanded, setExpanded] = useState<number|null>(null);

  // July 2026: July 1 = Wed → Mon-start offset = 2
  type DaySt = "all-present"|"has-absent"|"all-cancelled"|"no-class"|"today"|"future";

  const dayMap: Record<number,DaySt> = {};
  for (let d=1; d<=31; d++) {
    if (d > 29)  { dayMap[d] = "future";   continue; }
    const dow = new Date(2026,6,d).getDay(); // 0=Sun
    if (dow===0 || dow===6) { dayMap[d] = "no-class"; continue; }
    const di   = dow - 1; // Mon=0
    if (!SLOTS.some(s=>s.day===di)) { dayMap[d] = "no-class"; continue; }
    if (d===29) { dayMap[d] = "today";     continue; }
    const ds   = `2026-07-${String(d).padStart(2,"0")}`;
    const recs = HISTORY.filter(r=>r.date===ds);
    if (recs.length===0)                         { dayMap[d] = "no-class"; continue; }
    if (recs.every(r=>r.status==="cancelled"))    { dayMap[d] = "all-cancelled"; continue; }
    if (recs.some(r=>r.status==="absent"))        { dayMap[d] = "has-absent"; continue; }
    dayMap[d] = "all-present";
  }

  function cs(st:DaySt): { bg:string; fg:string } {
    if (st==="all-present")   return { bg:T.safeFill,   fg:T.safe };
    if (st==="has-absent")    return { bg:T.dangerFill, fg:T.danger };
    if (st==="all-cancelled") return { bg:T.cancelFill, fg:T.inkM };
    if (st==="today")         return { bg:T.aFill,      fg:T.accent };
    if (st==="future")        return { bg:"transparent", fg:"rgba(27,21,48,0.2)" };
    return                           { bg:"transparent", fg:T.inkL };
  }

  const expRecs = expanded
    ? HISTORY.filter(r => r.date===`2026-07-${String(expanded).padStart(2,"0")}`)
    : [];

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"56px 24px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div className="ae0" style={{ marginBottom:8 }}><Eyebrow>ATTENDANCE HISTORY</Eyebrow></div>
            <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>July 2026</h2>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            <button style={navBtn}><ChevronLeft size={14} color={T.inkM} /></button>
            <button style={navBtn}><ChevronRight size={14} color={T.inkM} /></button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:"flex", gap:18, padding:"0 24px", marginBottom:20 }}>
        {[
          { bg:T.safeFill,   fg:T.safe,   l:"All present" },
          { bg:T.dangerFill, fg:T.danger, l:"Absent" },
          { bg:T.cancelFill, fg:T.inkM,   l:"Cancelled" },
        ].map(item => (
          <div key={item.l} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:11, height:11, borderRadius:4, background:item.bg, border:`1px solid ${item.fg}30` }} />
            <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, letterSpacing:"0.06em" }}>{item.l}</span>
          </div>
        ))}
      </div>

      <div style={{ padding:"0 24px" }}>
        {/* Day labels */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
          {["M","T","W","T","F","S","S"].map((d,i) => (
            <div key={i} style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, textAlign:"center", paddingBottom:4 }}>{d}</div>
          ))}
        </div>

        {/* Cells — diagonal wave via index-based delay */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:5 }}>
          {Array.from({ length:2 }, (_,i) => <div key={`e${i}`} style={{ height:46 }} />)}
          {Array.from({ length:31 }, (_,i) => {
            const day = i + 1;
            const st  = dayMap[day] ?? "no-class";
            const { bg, fg } = cs(st);
            const isT = day===29;
            const isE = expanded===day;
            // diagonal wave: row = Math.floor((i+2)/7), col = (i+2)%7, delay = (row+col)*30ms
            const r = Math.floor((i+2)/7), c = (i+2)%7;
            const delay = `${(r+c)*28}ms`;
            return (
              <button key={day}
                onClick={() => setExpanded(isE ? null : day)}
                style={{
                  height:46, borderRadius:12, border: isT ? `2px solid ${T.accent}` : "none",
                  background: bg || "rgba(110,79,145,0.028)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", outline:"none",
                  transform: isE ? "scale(1.1)" : "scale(1)",
                  boxShadow: isE ? S.md : "none",
                  transition:"transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease",
                  animationDelay: delay,
                }}
                className="ae-cal"
              >
                <span style={{ fontFamily:F.serif, fontWeight:isT?600:400, fontSize:15, color:fg }}>{day}</span>
              </button>
            );
          })}
        </div>

        {/* Expanded accordion */}
        {expanded && (
          <div style={{
            marginTop:16, background:T.card, borderRadius:24, padding:"18px 16px",
            boxShadow:S.lg, border:`1px solid rgba(110,79,145,0.1)`,
            animation:"ae-scale-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <Eyebrow>JULY {expanded}</Eyebrow>
              <button onClick={()=>setExpanded(null)} style={{ background:"none", border:"none", cursor:"pointer", color:T.inkM }}><X size={16} /></button>
            </div>
            {expRecs.length===0 ? (
              <p style={{ fontSize:14, color:T.inkM, fontStyle:"italic" }}>No records for this day.</p>
            ) : expRecs.map((rec,i) => {
              const sl   = SLOTS.find(s=>s.id===rec.slotId);
              const subj = SUBJECTS.find(s=>s.id===rec.subjectId);
              return (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:12, marginBottom:10,
                  paddingBottom:10, borderBottom: i<expRecs.length-1 ? `1px solid rgba(110,79,145,0.07)` : "none",
                }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Icon name={subj?.icon||"BookOpen"} size={15} color={subj?.color||T.accent} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:14, color:T.inkH, marginBottom:2 }}>{subj?.name}</div>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{sl?.time} · {sl?.room}</div>
                  </div>
                  <Pill status={rec.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 7 — SEMESTER MANAGEMENT
// ════════════════════════════════════════════════════════════════
function SemesterScreen() {
  const [confirm, setConfirm] = useState(false);
  const [expand,  setExpand]  = useState<number|null>(null);

  const archived = [
    { name:"Winter 2025–26", dates:"Nov 2025 – Apr 2026", pct:82, subjects:6, total:112, attended:92 },
    { name:"Monsoon 2025",   dates:"Jul – Oct 2025",      pct:78, subjects:5, total:90,  attended:70 },
    { name:"Winter 2024–25", dates:"Nov 2024 – Apr 2025", pct:91, subjects:5, total:88,  attended:80 },
  ];

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"56px 24px 24px" }}>
        <div style={{ marginBottom:8 }}><Eyebrow>SEMESTER MANAGEMENT</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Semesters</h2>
      </div>

      {/* Current semester */}
      <div style={{ margin:"0 24px 28px" }}>
        <div style={{
          background:`linear-gradient(150deg, ${T.accent} 0%, #8B6FBB 100%)`,
          borderRadius:28, padding:"28px 24px",
          boxShadow:`0 12px 40px rgba(110,79,145,0.44), 0 4px 12px rgba(110,79,145,0.22)`,
          position:"relative", overflow:"hidden",
        }}>
          {/* decorative orb */}
          <div style={{ position:"absolute", top:-24, right:-24, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.1)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-20, left:-12, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }} />

          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", position:"relative" }}>
            <div>
              <Eyebrow><span style={{ color:"rgba(255,255,255,0.62)", fontFamily:F.mono }}>CURRENT</span></Eyebrow>
              <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:28, color:"#fff", marginTop:8, marginBottom:5 }}>Monsoon 2026</h3>
              <p style={{ fontFamily:F.mono, fontSize:11, color:"rgba(255,255,255,0.62)", marginBottom:0 }}>Jul – Nov 2026</p>
            </div>
            <Seal pct={OVERALL} size={68} animate label="" />
          </div>

          <div style={{ display:"flex", gap:8, marginTop:22 }}>
            {[{l:"Subjects",v:SUBJECTS.length},{l:"Attended",v:59},{l:"Total",v:75}].map(item => (
              <div key={item.l} style={{ flex:1, background:"rgba(255,255,255,0.16)", borderRadius:15, padding:"12px 8px", textAlign:"center" }}>
                <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:22, color:"#fff" }}>{item.v}</div>
                <div style={{ fontFamily:F.mono, fontSize:8, color:"rgba(255,255,255,0.62)", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:3 }}>{item.l}</div>
              </div>
            ))}
          </div>

          <button onClick={() => setConfirm(true)} style={{
            marginTop:20, width:"100%", padding:"14px", borderRadius:16, border:"none",
            background:"rgba(255,255,255,0.2)", color:"#fff",
            fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            transition:"background 0.15s",
          }}
            onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.28)")}
            onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.2)")}
          >
            <Archive size={16} /> Archive & Start New Semester
          </button>
        </div>
      </div>

      {/* Archived semesters */}
      <div style={{ padding:"0 24px" }}>
        <div style={{ marginBottom:14 }}><Eyebrow>ARCHIVED SEMESTERS</Eyebrow></div>
        {archived.map((sem,i) => (
          <div key={i} className={`ae${i+1}`}>
            <button onClick={() => setExpand(expand===i?null:i)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:14, padding:"16px 18px",
              background:T.card, borderRadius:expand===i?"18px 18px 0 0":18, border:"none",
              boxShadow:S.sm, cursor:"pointer", textAlign:"left",
              marginBottom: expand===i ? 0 : 10,
              borderBottom: expand===i ? `1px solid rgba(110,79,145,0.08)` : "none",
            }}>
              <div style={{ width:46, height:46, borderRadius:14, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Archive size={19} color={T.accent} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16, color:T.inkH, marginBottom:3 }}>{sem.name}</div>
                <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{sem.dates}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:sem.pct>=75?T.safe:T.danger }}>{sem.pct}%</div>
                <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, letterSpacing:"0.09em" }}>OVERALL</div>
              </div>
              <div style={{ transform: expand===i ? "rotate(180deg)":"rotate(0)", transition:"transform 0.2s ease", marginLeft:4 }}>
                <ChevronDown size={15} color={T.inkM} />
              </div>
            </button>

            {expand===i && (
              <div style={{
                background:T.card, borderRadius:"0 0 18px 18px",
                padding:"16px 18px 18px", marginBottom:10,
                boxShadow:`${S.sm}, 0 6px 0 0 rgba(110,79,145,0.02)`,
                animation:"ae0 0.28s ease both",
              }}>
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {[{l:"Subjects",v:sem.subjects},{l:"Attended",v:sem.attended},{l:"Total",v:sem.total}].map(item=>(
                    <div key={item.l} style={{ flex:1, background:T.bg, borderRadius:13, padding:"10px 8px", textAlign:"center" }}>
                      <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:20, color:T.inkH }}>{item.v}</div>
                      <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.09em", marginTop:2 }}>{item.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding:"10px 14px", background:T.aFill, borderRadius:12, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>Read-only · Archived</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <>
          <div className="ae-backdrop" onClick={()=>setConfirm(false)} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.52)", backdropFilter:"blur(6px)", zIndex:50 }} />
          <div className="ae-modal" style={{
            position:"fixed", top:"50%", left:"50%",
            width:"calc(100% - 48px)", maxWidth:350,
            background:T.card, borderRadius:28, padding:"30px 26px",
            boxShadow:S.lg, zIndex:51,
          }}>
            <div style={{ width:52, height:52, borderRadius:16, background:T.dangerFill, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18 }}>
              <Archive size={22} color={T.danger} />
            </div>
            <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:T.inkH, marginBottom:10 }}>Archive this semester?</h3>
            <p style={{ fontSize:14, color:T.inkM, lineHeight:1.68, marginBottom:26 }}>
              Monsoon 2026 will be archived. All attendance records will be preserved in read-only mode.
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirm(false)} style={{ flex:1, padding:"15px", borderRadius:15, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={()=>setConfirm(false)} style={{ flex:1, padding:"15px", borderRadius:15, border:"none", background:T.accent, color:"#fff", fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer", boxShadow:S.acc }}>
                Archive
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 8 — SETTINGS
// ════════════════════════════════════════════════════════════════
function SettingsScreen({ onSemesters, onOnboarding }: {
  onSemesters:()=>void; onOnboarding:()=>void;
}) {
  const groups = [
    { title:"TIMETABLE", items:[
      { I:Edit2,       l:"Edit Subjects",         s:"5 subjects enrolled",        c:"#6E4F91", fn:undefined as (()=>void)|undefined },
      { I:LayoutGrid,  l:"Edit Timetable",         s:"10 weekly slots",            c:"#8B6FBB", fn:undefined },
      { I:AlertCircle, l:"Attendance Thresholds",  s:"75% default · 80% for EC201",c:"#5A3D78", fn:undefined },
    ]},
    { title:"NOTIFICATIONS", items:[
      { I:Bell, l:"Class Reminders",       s:"15 min before class",        c:"#7A5AA0", fn:undefined },
      { I:Bell, l:"Low Attendance Alerts", s:"Below threshold",            c:"#9B7FCC", fn:undefined },
    ]},
    { title:"DATA & EXPORT", items:[
      { I:Archive,  l:"Manage Semesters",   s:"3 archived",                c:"#6E4F91", fn:onSemesters },
      { I:Download, l:"Export PDF Report",  s:"Full attendance report",    c:"#8B6FBB", fn:undefined },
      { I:FileText, l:"Start New Semester", s:"Archive current & reset",   c:"#5A3D78", fn:onOnboarding },
    ]},
  ];

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"56px 24px 24px" }}>
        <div style={{ marginBottom:8 }}><Eyebrow>PREFERENCES</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Settings</h2>
      </div>

      {/* Profile card */}
      <div style={{ margin:"0 24px 26px", background:T.card, borderRadius:22, padding:"18px 20px", boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.08)`, display:"flex", alignItems:"center", gap:16 }}>
        <div style={{
          width:56, height:56, borderRadius:"50%",
          background:"linear-gradient(140deg,#6E4F91 0%,#9B7FCC 100%)",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          boxShadow:S.acc,
        }}>
          <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:"#fff" }}>A</span>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:19, color:T.inkH, marginBottom:3 }}>Arjun Sharma</div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.09em" }}>B.Tech Computer Science · Sem 5</div>
        </div>
        <Seal pct={OVERALL} size={50} label="" />
      </div>

      {groups.map(grp => (
        <div key={grp.title} style={{ padding:"0 24px", marginBottom:22 }}>
          <div style={{ marginBottom:10 }}><Eyebrow>{grp.title}</Eyebrow></div>
          <div style={{ background:T.card, borderRadius:19, overflow:"hidden", boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)` }}>
            {grp.items.map((item,idx) => (
              <button key={idx} onClick={item.fn} style={{
                width:"100%", padding:"15px 18px", border:"none", background:"transparent",
                display:"flex", alignItems:"center", gap:14, cursor:"pointer", textAlign:"left",
                borderBottom: idx<grp.items.length-1 ? `1px solid rgba(110,79,145,0.06)` : "none",
                transition:"background 0.12s ease",
              }}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(110,79,145,0.03)")}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
                onMouseDown={e=>(e.currentTarget.style.background="rgba(110,79,145,0.07)")}
                onMouseUp={e=>(e.currentTarget.style.background="rgba(110,79,145,0.03)")}
              >
                <div style={{ width:38, height:38, borderRadius:11, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <item.I size={16} color={item.c} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, color:T.inkH, fontWeight:500, marginBottom:2 }}>{item.l}</div>
                  <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{item.s}</div>
                </div>
                <ChevronRight size={15} color={T.inkL} />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding:"0 24px 8px", textAlign:"center" }}>
        <p style={{ fontFamily:F.mono, fontSize:10, color:T.inkL, letterSpacing:"0.1em" }}>ATTENDEASY v2.0 · MONSOON 2026</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB BAR
// ════════════════════════════════════════════════════════════════
function TabBar({ active, onChange }: { active:TabId; onChange:(t:TabId)=>void }) {
  const TABS: { id:TabId; I:typeof Home; label:string }[] = [
    { id:"home",      I:Home,        label:"Home"      },
    { id:"timetable", I:LayoutGrid,  label:"Timetable" },
    { id:"calendar",  I:CalendarDays,label:"Calendar"  },
    { id:"settings",  I:Settings,    label:"Settings"  },
  ];
  return (
    <div style={{
      position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
      width:"100%", maxWidth:390,
      background:"rgba(252,251,254,0.94)",
      backdropFilter:"blur(20px) saturate(180%)",
      borderTop:`1px solid rgba(110,79,145,0.09)`,
      display:"flex", zIndex:40, padding:"10px 0 30px",
    }}>
      {TABS.map(({ id,I,label }) => {
        const on = active===id;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3,
            border:"none", background:"transparent", cursor:"pointer", padding:"6px 0",
            transition:"opacity 0.15s",
          }}>
            <div style={{
              width:44, height:32, borderRadius:14,
              background: on ? T.aFill : "transparent",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background 0.2s ease",
            }}>
              <I size={21} color={on?T.accent:T.inkM} strokeWidth={on?2:1.7} />
            </div>
            <span style={{ fontFamily:F.sans, fontSize:10, fontWeight:on?600:400, color:on?T.accent:T.inkM, letterSpacing:"0.01em" }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [screen,  setScreen]  = useState<Screen>("onboarding");
  const [tab,     setTab]     = useState<TabId>("home");
  const [subjId,  setSubjId]  = useState<string|null>(null);
  const [markSlot,setMarkSlot]= useState<string|null>(null);

  const goTab = (t: TabId) => {
    setTab(t);
    const m: Record<TabId,Screen> = { home:"home", timetable:"timetable", calendar:"calendar", settings:"settings" };
    setScreen(m[t]);
    setSubjId(null);
  };

  if (!authed) {
    return <AuthScreen onSuccess={() => setAuthed(true)} />;
  }
  
  return (
    <>
      <style>{`
        @keyframes ae-up {
          from { transform:translateY(18px); opacity:0; }
          to   { transform:translateY(0);    opacity:1; }
        }
        @keyframes ae-cal {
          from { transform:scale(0.8); opacity:0; }
          to   { transform:scale(1);   opacity:1; }
        }
        @keyframes ae-scale-in {
          from { transform:scale(0.92); opacity:0; }
          to   { transform:scale(1);   opacity:1; }
        }
        @keyframes ae-modal-in {
          from { transform:translate(-50%,-48%) scale(0.94); opacity:0; }
          to   { transform:translate(-50%,-50%) scale(1);    opacity:1; }
        }
        @keyframes ae-backdrop-in {
          from { opacity:0; }
          to   { opacity:1; }
        }

        .ae0  { animation:ae-up 0.44s ease-out both; }
        .ae1  { animation:ae-up 0.44s 0.06s ease-out both; }
        .ae2  { animation:ae-up 0.44s 0.12s ease-out both; }
        .ae3  { animation:ae-up 0.44s 0.18s ease-out both; }
        .ae4  { animation:ae-up 0.44s 0.24s ease-out both; }
        .ae5  { animation:ae-up 0.44s 0.30s ease-out both; }

        .ae-cal       { animation:ae-cal       0.36s ease-out both; }
        .ae-scale-in  { animation:ae-scale-in  0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
        .ae-modal     { animation:ae-modal-in  0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
        .ae-backdrop  { animation:ae-backdrop-in 0.22s ease both; }

        ::-webkit-scrollbar { display:none; }
        * { scrollbar-width:none; -ms-overflow-style:none; }
        input::placeholder { color:#BAB4C4; font-style:italic; }
        input:focus { border-color:${T.accent} !important; }
      `}</style>

      <div style={{
        width:"100%", maxWidth:390, margin:"0 auto",
        minHeight:"100dvh", background:T.bg, position:"relative",
        fontFamily:F.sans, overflow:"hidden",
      }}>
        <div key={screen} style={{ height:"100dvh", overflowY:"auto" }}>
          {screen==="onboarding" && (
            <OnboardingScreen onDone={() => { setScreen("home"); setTab("home"); }} />
          )}
          {screen==="home" && (
            <HomeScreen
              onSubject={id => { setSubjId(id); setScreen("subject"); }}
              onMark={id => setMarkSlot(id)}
            />
          )}
          {screen==="timetable" && (
            <TimetableScreen onMark={id => setMarkSlot(id)} />
          )}
          {screen==="subject" && subjId && (
            <SubjectDetailScreen
              subjectId={subjId}
              onBack={() => { setScreen("home"); setTab("home"); setSubjId(null); }}
              onMark={id => setMarkSlot(id)}
            />
          )}
          {screen==="calendar"  && <CalendarScreen />}
          {screen==="semester"  && <SemesterScreen />}
          {screen==="settings"  && (
            <SettingsScreen
              onSemesters={() => setScreen("semester")}
              onOnboarding={() => setScreen("onboarding")}
            />
          )}
        </div>

        {screen !== "onboarding" && (
          <TabBar active={tab} onChange={goTab} />
        )}
      </div>

      {/* Attendance sheet rendered outside container for full-screen overlay */}
      <AttendanceSheet
        slotId={markSlot}
        onClose={() => setMarkSlot(null)}
        onSave={(id,st,note,tag) => setMarkSlot(null)}
      />
    </>
  );
}
