import { useState, useEffect, useRef, useCallback, useId } from "react";
import {
  Home, CalendarDays, LayoutGrid, Settings, Plus, ChevronLeft, ChevronRight, ChevronDown,
  X, Check, Ban, RotateCcw, Bell, Cpu, Calculator, PenLine, TrendingUp, Code2,
  Edit2, Download, Archive, BookOpen, GraduationCap, AlertCircle, FileText,
  Sparkles, Star, Clock,
} from "lucide-react";
import AuthScreen from "./AuthScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";
import { api, getToken } from "../lib/api";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "motion/react";

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
type Screen   = "onboarding" | "home" | "timetable" | "subject" | "calendar" | "semester" | "settings" | "edit-timetable";
type TabId    = "home" | "timetable" | "calendar" | "settings";

interface Subject  { id: string; name: string; code: string; color: string; icon: string; threshold: number; }
interface Slot     { id: string; subjectId: string; day: number; time: string; endTime: string; room: string; prof: string; }
interface Record_  { date: string; slotId: string; subjectId: string; status: Status; note?: string; tag?: string; }
interface Stats    { total: number; attended: number; absent: number; cancelled: number; pct: number; }

function fireConfetti() {
  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#6E4F91", "#2F7A5C", "#9B7FCC", "#FFD700"],
  });
}

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

/* The signature seal — an SVG progress ring showing overall % */
function Seal({ pct, size=84, animate=false, label="OVERALL" }: {
  pct:number; size?:number; animate?:boolean; label?:string;
}) {
  const display = useCountUp(pct, 720, animate);
  const gradId = useId().replace(/:/g, "");
  const stroke = size * (5/84);
  const r = size/2 - stroke*1.2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(Math.max(display, 0), 100) / 100);
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0, position:"relative",
      background:"#FFFFFF",
      boxShadow:"0 10px 26px rgba(110,79,145,0.2), 0 2px 8px rgba(27,21,48,0.06), inset 0 1px 0 #fff",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position:"absolute", inset:0 }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9B7FCC" />
            <stop offset="100%" stopColor="#5A3D78" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F0EAF7" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: animate ? "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" : "none" }}
        />
      </svg>
      <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
        <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:size*0.25, color:T.inkH, lineHeight:1, letterSpacing:"-0.01em" }}>
          {display}%
        </div>
        {label && (
          <div style={{ fontFamily:F.mono, fontSize:size*0.078, letterSpacing:"0.09em", color:T.accent, marginTop:3, textTransform:"uppercase", fontWeight:600 }}>
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

function INK(pct: number) { return pct >= 75 ? T.safe : pct >= 60 ? T.warn : T.danger; }

function shadeHex(hex: string, factor: number) {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  if (factor < 0) { r *= 1+factor; g *= 1+factor; b *= 1+factor; }
  else            { r += (255-r)*factor; g += (255-g)*factor; b += (255-b)*factor; }
  const clamp = (v:number) => Math.max(0, Math.min(255, Math.round(v)));
  r=clamp(r); g=clamp(g); b=clamp(b);
  return `#${((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}`;
}

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
    <p style={{
      display:"flex", alignItems:"center", gap:7,
      fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.17em",
      textTransform:"uppercase", marginBottom:0,
    }}>
      {children}
      <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
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
  const [prof, setProf] = useState("");
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
        day: parseInt(day, 10), startTime, endTime, room: room || undefined, prof: prof || undefined,
      });
      setSlots(prev => [...prev, slot]);
      setAdding(false);
      setRoom("");
      setProf("");
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
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <input placeholder="Room (optional)" value={room} onChange={e => setRoom(e.target.value)} style={{ ...miniField, flex:1, boxSizing:"border-box" }} />
            <input placeholder="Professor (optional)" value={prof} onChange={e => setProf(e.target.value)} style={{ ...miniField, flex:1, boxSizing:"border-box" }} />
          </div>
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
function HomeScreen({ onSubject, onMark, refreshKey }: {
  onSubject:(id:string)=>void;
  onMark:(slotId:string)=>void;
  refreshKey: number;
}) {
  const [fabOpen, setFabOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [semesterName, setSemesterName] = useState("");
  const [overall, setOverall] = useState<{percentage:number}|null>(null);
  const [subjectCards, setSubjectCards] = useState<{subject:any; stats:any; status:string}[]>([]);
  const [todayClasses, setTodayClasses] = useState<{slot:any; record:any}[]>([]);
  const [quickBusy, setQuickBusy] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ user }, { semesters }] = await Promise.all([api.me(), api.get("/semesters")]);
        setUserName(user.name);
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (!active) return;
        setSemesterName(active.name || "");

        const [overviewRes, todayRes] = await Promise.all([
          api.get(`/records/stats/overview?semesterId=${active.id}`),
          api.get(`/slots/today?semesterId=${active.id}`),
        ]);
        setOverall(overviewRes.overall);
        setSubjectCards(overviewRes.subjects);
        setTodayClasses(todayRes.classes);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [refreshKey]);

  async function quickMark(slotId: string, status: Status) {
    setQuickBusy(slotId);
    try {
      const cls = todayClasses.find(c => c.slot.id === slotId);
      const subjectId = cls?.slot.subjectId;
      let before: any = null;
      if (subjectId && status === "present") {
        before = await api.get(`/records/stats/subject/${subjectId}`);
      }

      await api.post("/records/mark", { slotId, date: new Date().toISOString(), status });
      setTodayClasses(prev => prev.map(c => c.slot.id === slotId ? { ...c, record: { ...c.record, status } } : c));

      if (before && status === "present") {
        const after = await api.get(`/records/stats/subject/${subjectId}`);
        if (before.stats.percentage < after.subject.threshold && after.stats.percentage >= after.subject.threshold) {
          fireConfetti();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQuickBusy(null);
    }
  }

  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(" ")[0] : "";
  const nextClass = todayClasses.find(c => !c.record);

  function fmtTime12(t: string) {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2,"0")} ${period}`;
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:180 }}>
      {/* ── Header ── */}
      <div style={{ padding:"52px 24px 0", display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div className="ae0" style={{ display:"flex", alignItems:"center", gap:7, marginBottom:11 }}>
            <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
            <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>
              {semesterName ? `${semesterName} · ${todayLabel}` : todayLabel}
            </span>
          </div>
          <h1 className="ae1" style={{ fontFamily:F.serif, fontWeight:500, fontSize:29, letterSpacing:"-0.01em", color:T.inkH, lineHeight:1.12, marginBottom:7 }}>
            {greeting},{firstName && <><br />{firstName}</>}
          </h1>
          <div className="ae2" style={{ display:"flex", alignItems:"center", gap:7, fontSize:13.5, color:T.inkM }}>
            <span>{todayClasses.length} class{todayClasses.length===1?"":"es"} today</span>
            {nextClass && (
              <>
                <span style={{ width:3, height:3, borderRadius:"50%", background:T.inkL, flexShrink:0 }} />
                <span>next at <b style={{ color:T.accent, fontWeight:600 }}>{fmtTime12(nextClass.slot.startTime)}</b></span>
              </>
            )}
          </div>
        </div>
        <div className="ae1" style={{ paddingTop:2 }}>
          <Seal pct={overall ? Math.round(overall.percentage) : 0} size={84} animate={true} />
        </div>
      </div>

      {/* ── Subject cards ── */}
      <div style={{ marginTop:34, paddingLeft:24 }} className="ae3">
        <Eyebrow>YOUR SUBJECTS</Eyebrow>
        <div style={{ display:"flex", gap:12, overflowX:"auto", paddingRight:24, paddingBottom:8, marginTop:14 }}>
          {subjectCards.length === 0 && (
            <p style={{ fontSize:13, color:T.inkM, fontStyle:"italic" }}>No subjects yet — add some from onboarding.</p>
          )}
          {subjectCards.map(({ subject, stats, status }, i) => {
            const warn = status !== "green";
            const mid  = shadeHex(subject.color, -0.22);
            const dark = shadeHex(subject.color, -0.48);
            return (
              <button
                key={subject.id}
                onClick={() => onSubject(subject.id)}
                className={`ae${Math.min(i+1,5)}`}
                style={{
                  flexShrink:0, width:136, height:154, padding:16, borderRadius:22, border:"none",
                  background:`linear-gradient(155deg, ${subject.color} 0%, ${mid} 65%, ${dark} 100%)`,
                  boxShadow:`0 10px 26px -6px ${mid}73`,
                  display:"flex", flexDirection:"column", justifyContent:"space-between", textAlign:"left",
                  cursor:"pointer", transition:"transform 0.16s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.16s ease",
                  position:"relative", overflow:"hidden",
                }}
                onMouseDown={e => { e.currentTarget.style.transform="scale(0.95)"; }}
                onMouseUp={e   => { e.currentTarget.style.transform="scale(1)"; }}
              >
                <div style={{ position:"absolute", top:-20, right:-20, width:76, height:76, borderRadius:"50%", background:"rgba(255,255,255,0.13)", pointerEvents:"none" }} />
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:1 }}>
                  <div style={{ width:31, height:31, borderRadius:10, background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Icon name="BookOpen" size={15} color="#fff" />
                  </div>
                  {warn && <AlertCircle size={14} color="rgba(255,220,180,0.95)" />}
                </div>
                <div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:2, position:"relative", zIndex:1 }}>
                    <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:25, color:"#fff", lineHeight:1 }}>
                      {Math.round(stats.percentage)}
                    </span>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,0.75)", fontWeight:600 }}>%</span>
                  </div>
                  <div style={{ fontFamily:F.mono, fontSize:9, color:"rgba(255,255,255,0.68)", letterSpacing:"0.08em", textTransform:"uppercase", marginTop:5, position:"relative", zIndex:1 }}>
                    {subject.name}
                  </div>
                  {warn && (
                    <div style={{ marginTop:8, fontFamily:F.mono, fontSize:9, color:"rgba(255,224,188,1)", background:"rgba(0,0,0,0.24)", padding:"3px 8px", borderRadius:100, display:"inline-block" }}>
                      Below {subject.threshold}%
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {subjectCards.length > 1 && (
            <div aria-hidden="true" style={{
              flexShrink:0, width:56, height:154, borderRadius:22,
              background:"linear-gradient(155deg,#5A3D78,#3A2650 65%,#2A1C3A)",
              boxShadow:"0 10px 26px -6px rgba(58,38,80,0.4)",
            }} />
          )}
        </div>
      </div>

      {/* ── Today timeline ── */}
      <div style={{ margin:"34px 24px 0" }} className="ae4">
        <Eyebrow>TODAY</Eyebrow>
        <div style={{ position:"relative", marginTop:16 }}>
          {todayClasses.length === 0 && (
            <p style={{ fontSize:13, color:T.inkM, fontStyle:"italic" }}>No classes scheduled today.</p>
          )}
          {todayClasses.map(({ slot, record }, idx) => {
            const isPending = !record;
            const dotColor  = isPending ? T.aFillDeep : record.status === "present" ? T.safe : T.danger;
            const isLast    = idx === todayClasses.length - 1;
            return (
              <div key={slot.id} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"stretch" }} className={`ae${Math.min(idx+1,5)}`}>
                {/* rail */}
                <div style={{ width:20, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", position:"relative", paddingTop:20 }}>
                  <div style={{
                    width:8, height:8, borderRadius:"50%", position:"relative", zIndex:1,
                    border:`2px solid ${T.bg}`, background:dotColor,
                    boxShadow:`0 0 0 3px ${dotColor}30`,
                    animation: isPending ? `ae-dot-breathe 2.2s ease-in-out ${idx * 0.3}s infinite` : "none",
                  }} />
                  {!isLast && (
                    <div style={{
                      position:"absolute", top:28, bottom:-10, width:1.5,
                      background:"linear-gradient(to bottom, rgba(110,79,145,0.32), rgba(110,79,145,0.05))",
                      transformOrigin:"top", animation:"ae-line-grow 0.8s cubic-bezier(0.22,1,0.36,1) both",
                    }} />
                  )}
                </div>

                {/* card */}
                <div style={{
                  flex:1, background:"#FFFFFF", borderRadius:16, padding:"13px 15px",
                  boxShadow:"0 2px 10px rgba(27,21,48,0.06), 0 1px 3px rgba(27,21,48,0.03), inset 0 1px 0 #fff",
                  border:"1px solid rgba(110,79,145,0.07)",
                  borderLeft: `3px solid ${isPending ? T.aFillDeep : dotColor}`,
                  display:"flex", flexDirection:"column", justifyContent:"center",
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                    <div>
                      <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15.5, color:T.inkH, marginBottom:3 }}>
                        {slot.subject.name}
                      </div>
                      <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span>{slot.startTime}–{slot.endTime}</span>
                        {slot.room && (
                          <>
                            <span style={{ width:2.5, height:2.5, borderRadius:"50%", background:T.inkL, flexShrink:0 }} />
                            <span style={{ color:T.accent, fontWeight:500 }}>{slot.room}</span>
                          </>
                        )}
                        {slot.prof && (
                          <span style={{ fontSize:9, color:T.inkL, marginLeft:6 }}>{slot.prof}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onMark(slot.id)}
                      title="Add note"
                      aria-label="Add note"
                      style={{
                        width:26, height:26, borderRadius:8, flexShrink:0,
                        border:"none", background:T.aFill,
                        color:T.accent, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}
                    >
                      <PenLine size={12.5} strokeWidth={2} />
                    </button>
                  </div>

                  {isPending ? (
                    <div style={{ display:"flex", gap:7, marginTop:10 }}>
                      {(["present","absent"] as Status[]).map(s => {
                        const { text, bg, label } = statusMeta(s);
                        return (
                          <button key={s}
                            disabled={quickBusy === slot.id}
                            onClick={() => quickMark(slot.id, s)}
                            style={{
                              flex:1, padding:"7px 6px", borderRadius:10,
                              border:`1.5px solid ${text}2e`, background:bg, color:text,
                              fontFamily:F.sans, fontWeight:600, fontSize:11.5, cursor:"pointer",
                              display:"flex", alignItems:"center", justifyContent:"center", gap:4,
                            }}
                          >
                            {s==="present"
                              ? <Check size={12} strokeWidth={3} />
                              : <X size={12} strokeWidth={3} />}
                            {label}
                          </button>
                        );
                      })}
                      <button
                        disabled={quickBusy === slot.id}
                        onClick={() => quickMark(slot.id, "cancelled")}
                        style={{
                          flex:1, padding:"7px 6px", borderRadius:10,
                          border:`1.5px solid rgba(138,129,148,0.12)`, background:T.cancelFill, color:T.inkM,
                          fontFamily:F.sans, fontWeight:600, fontSize:11.5, cursor:"pointer",
                        }}
                      >Cancelled</button>
                    </div>
                  ) : (
                    <span style={{
                      marginTop:2, alignSelf:"flex-start",
                      display:"inline-flex", alignItems:"center", gap:5,
                      padding:"5px 12px", borderRadius:100,
                      fontFamily:F.sans, fontWeight:700, fontSize:11,
                      background: statusMeta(record.status).bg, color: statusMeta(record.status).text,
                    }}>
                      {record.status === "present" && <Check size={10} strokeWidth={3} />}
                      {statusMeta(record.status).label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setFabOpen(true)}
        style={{
          position:"fixed", right:24, bottom:96, width:58, height:58, borderRadius:"50%",
          background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
          border:"none", cursor:"pointer", zIndex:20,
          boxShadow:"0 16px 30px rgba(94,63,138,0.45), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -3px 6px rgba(0,0,0,0.15)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}
      >
        <Plus size={22} color="#fff" strokeWidth={2.5} />
      </button>

      {fabOpen && (
        <ExtraClassModal
          subjects={subjectCards.map(c => c.subject)}
          onClose={() => setFabOpen(false)}
          onSaved={() => { setFabOpen(false); setQuickBusy(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}

function ExtraClassModal({ subjects, onClose, onSaved }: {
  subjects: {id:string; name:string; color:string}[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [room, setRoom] = useState("");
  const [prof, setProf] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);

  async function save() {
    if (!subjectId) { setError("Pick a subject first."); return; }
    setSaving(true);
    setError(null);
    try {
      const { semesters } = await api.get("/semesters");
      const active = semesters.find((s:any) => s.isActive) || semesters[0];
      await api.post("/slots/extra", {
        semesterId: active.id,
        subjectId, date, startTime, endTime,
        room: room || undefined, prof: prof || undefined,
        mode: "add",
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const label = (text: string) => (
    <label style={{
      display:"block", fontFamily:F.mono, fontSize:10, letterSpacing:"0.1em",
      textTransform:"uppercase", color:T.inkM, marginBottom:8, fontWeight:500,
    }}>{text}</label>
  );

  const shellStyle: React.CSSProperties = {
    width:"100%", padding:"14px 44px 14px 16px", borderRadius:16,
    border:"1px solid rgba(110,79,145,0.1)", background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)",
    fontFamily:F.sans, fontSize:15, color:T.inkH, outline:"none",
    boxSizing:"border-box", appearance:"none", WebkitAppearance:"none",
  };

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });

  return (
    <>
      <style>{`
        .ecm-native { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
        .ecm-sheet { scrollbar-width:none; -ms-overflow-style:none; }
        .ecm-sheet::-webkit-scrollbar { display:none; }
      `}</style>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.44)", backdropFilter:"blur(5px)", zIndex:60 }} />
      <div className="ecm-sheet" style={{
        position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:"calc(100% - 40px)", maxWidth:360, maxHeight:"92vh", overflowY:"auto",
        background:"linear-gradient(180deg, #FEFDFF 0%, #FBF8FE 55%, #F6F1FB 100%)",
        borderRadius:28, padding:"14px 24px 24px", boxShadow:S.lg, zIndex:61,
      }}>
        <div style={{ width:36, height:4, borderRadius:2, background:T.aFillDeep, margin:"0 auto 18px" }} />

        <div style={{
          display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:100,
          background:T.aFill, fontFamily:F.mono, fontSize:10.5, color:T.accent, fontWeight:600,
          letterSpacing:"0.02em", marginBottom:16,
        }}>
          <Plus size={12} strokeWidth={2.5} /> One-time class
        </div>

        <h3 style={{ fontFamily:F.serif, fontWeight:700, fontSize:26, color:T.inkH, marginBottom:6, letterSpacing:"-0.01em" }}>
          Add extra class
        </h3>
        <p style={{ fontSize:14, color:T.inkM, marginBottom:22, lineHeight:1.4 }}>
          For a makeup lecture or rescheduled session.
        </p>

        {subjects.length === 0 ? (
          <p style={{ fontSize:13, color:T.inkM }}>Add a subject first before scheduling an extra class.</p>
        ) : (
          <>
            <div style={{ marginBottom:16 }}>
              {label("Subject")}
              <div style={{ position:"relative" }}>
                <select value={subjectId} onChange={e => setSubjectId(e.target.value)} style={shellStyle}>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <ChevronDown size={17} color={T.inkM} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              {label("Date")}
              <div style={{ position:"relative" }}>
                <div style={{ ...shellStyle, display:"flex", alignItems:"center" }}>{dateLabel}</div>
                <CalendarDays size={17} color={T.inkM} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="ecm-native" />
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <div style={{ flex:1 }}>
                {label("Starts")}
                <div style={{ position:"relative" }}>
                  <div style={{ ...shellStyle }}>{startTime}</div>
                  <Clock size={16} color={T.inkM} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="ecm-native" />
                </div>
              </div>
              <div style={{ flex:1 }}>
                {label("Ends")}
                <div style={{ position:"relative" }}>
                  <div style={{ ...shellStyle }}>{endTime}</div>
                  <Clock size={16} color={T.inkM} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="ecm-native" />
                </div>
              </div>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:22 }}>
              <div style={{ flex:1 }}>
                {label("Room (optional)")}
                <input placeholder="e.g. C-204" value={room} onChange={e => setRoom(e.target.value)}
                  style={{ ...shellStyle, padding:"14px 16px" }} />
              </div>
              <div style={{ flex:1 }}>
                {label("Professor (optional)")}
                <input placeholder="e.g. Prof. Iyer" value={prof} onChange={e => setProf(e.target.value)}
                  style={{ ...shellStyle, padding:"14px 16px" }} />
              </div>
            </div>

            {error && <p style={{ color:T.danger, fontSize:12, marginBottom:14 }}>{error}</p>}

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onClose} style={{
                flex:1, padding:"15px", borderRadius:16, border:"1px solid rgba(110,79,145,0.14)",
                background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)", color:T.inkM, fontFamily:F.sans, fontSize:14.5, fontWeight:600, cursor:"pointer",
              }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{
                flex:1.4, padding:"15px", borderRadius:16, border:"none",
                background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
                color:"#fff", fontFamily:F.sans, fontSize:14.5, fontWeight:700, cursor:"pointer",
                boxShadow:"0 10px 24px rgba(94,63,138,0.35)",
              }}>
                {saving ? "Saving..." : "Save class"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 3 — FULL TIMETABLE
// ════════════════════════════════════════════════════════════════
function TimetableScreen({ onMark }: { onMark:(slotId:string)=>void }) {
  const [slots, setSlots] = useState<any[]>([]);
  const HOURS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00"];
  const DAYS  = ["Mon","Tue","Wed","Thu","Fri"];

  useEffect(() => {
    (async () => {
      try {
        const { semesters } = await api.get("/semesters");
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (!active) return;
        const { slots: fetched } = await api.get(`/slots?semesterId=${active.id}`);
        setSlots(fetched);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const today = new Date();
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates = Array.from({ length:5 }, (_,i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
  const todayIdx = (today.getDay() + 6) % 7;

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, height:"100vh", display:"flex", flexDirection:"column", paddingBottom:80 }}>
      <div style={{ padding:"56px 20px 16px", flexShrink:0 }}>
        <div className="ae0" style={{ marginBottom:8 }}><Eyebrow>WEEK VIEW</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Timetable</h2>
      </div>

      <div style={{ display:"flex", paddingLeft:46, paddingRight:12, gap:5, marginBottom:10, flexShrink:0 }}>
        {dates.map((d,i) => {
          const isToday = i === todayIdx;
          return (
            <div key={i} style={{ flex:1, textAlign:"center" }}>
              <div style={{ fontFamily:F.mono, fontSize:9, color:isToday?T.accent:T.inkM, letterSpacing:"0.1em", textTransform:"uppercase" }}>{DAYS[i]}</div>
              <div style={{
                fontFamily:F.serif, fontWeight:600, fontSize:17,
                color: isToday?"#fff":T.inkH,
                width:28, height:28, borderRadius:"50%",
                background: isToday?T.accent:"transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                margin:"4px auto 0",
                boxShadow: isToday?S.acc:"none",
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      <div style={{ flex:1, overflow:"auto", paddingRight:12 }}>
        {HOURS.map(hr => (
          <div key={hr} style={{ display:"flex", gap:5, marginBottom:6, minHeight:58, alignItems:"stretch" }}>
            <div style={{ width:40, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:8 }}>
              <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM }}>{hr}</span>
            </div>
            {Array.from({ length:5 }, (_,di) => {
              const slot = slots.find(s => s.day===di && s.startTime===hr);
              if (!slot) return (
                <div key={di} style={{
                  flex:1, borderRadius:11, minHeight:58,
                  background:"rgba(110,79,145,0.025)",
                  border:"1px solid rgba(110,79,145,0.05)",
                }} />
              );
              return (
                <button key={di} onClick={() => onMark(slot.id)} style={{
                  flex:1, borderRadius:11, border:"none", cursor:"pointer",
                  background:T.aFill, padding:"8px 7px",
                  display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4,
                  borderLeft:`3px solid ${slot.subject.color}`,
                  transition:"transform 0.12s ease, box-shadow 0.12s ease", outline:"none",
                }}>
                  <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:11, color:T.inkH, lineHeight:1.3 }}>{slot.subject.name}</span>
                  {slot.room && <span style={{ fontFamily:F.mono, fontSize:9, color:slot.subject.color, letterSpacing:"0.04em" }}>{slot.room}</span>}
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
  const [data, setData] = useState<{subject:any; stats:any}|null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, recordsRes, semRes] = await Promise.all([
          api.get(`/records/stats/subject/${subjectId}`),
          api.get(`/records?subjectId=${subjectId}`),
          api.get("/semesters"),
        ]);
        setData(statsRes);
        setHistory(recordsRes.records);

        const active = semRes.semesters.find((s:any) => s.isActive) || semRes.semesters[0];
        if (active) {
          const { slots: allSlots } = await api.get(`/slots?semesterId=${active.id}`);
          setSlots(allSlots.filter((s:any) => s.subjectId === subjectId));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [subjectId]);

  const isGood  = data ? data.stats.canMissMore > 0 : false;
  const bunkVal = useCountUp(data ? (isGood ? data.stats.canMissMore : data.stats.needToAttend) : 0, 680);

  if (!data) {
    return (
      <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", padding:"56px 24px" }}>
        <p style={{ color:T.inkM }}>Loading...</p>
      </div>
    );
  }

  const { subject, stats } = data;

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:108 }}>
      {/* Header */}
      <div style={{ padding:"56px 24px 0" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6, color:T.accent, marginBottom:28, padding:0, fontFamily:F.sans, fontSize:14, fontWeight:500 }}>
          <ChevronLeft size={17} /> Back
        </button>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div style={{ flex:1, paddingRight:16 }}>
            <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:30, color:T.inkH, lineHeight:1.15, marginBottom:8 }}>{subject.name}</h2>
            {slots[0]?.prof && <p style={{ fontSize:13, color:T.inkM, marginBottom:12 }}>{slots[0].prof}</p>}
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {slots.map(sl => (
                <span key={sl.id} style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"3px 10px", borderRadius:8 }}>
                  {DAYS[sl.day]} {sl.startTime}
                </span>
              ))}
            </div>
          </div>
          <Seal pct={Math.round(stats.percentage)} size={84} animate={true} label={`${subject.threshold}% min`} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"flex", gap:8, padding:"24px 24px 0" }}>
        {[
          { label:"Total",     v:stats.held,     c:T.inkH },
          { label:"Attended",  v:stats.attended, c:T.safe },
          { label:"Missed",    v:stats.missed,   c:T.danger },
          { label:"Cancelled", v:stats.cancelled,c:T.inkM },
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
          <span style={{ fontFamily:F.serif, fontSize:18, color:T.inkM, paddingBottom:12 }}>class{(isGood?stats.canMissMore:stats.needToAttend)!==1?"es":""}</span>
        </div>
        <p style={{ fontSize:14, color:T.inkM, lineHeight:1.6 }}>
          {isGood
            ? `You can miss ${stats.canMissMore} more class${stats.canMissMore!==1?"es":""} and still hold above ${subject.threshold}%.`
            : `Attend the next ${stats.needToAttend} class${stats.needToAttend!==1?"es":""} in a row to recover to ${subject.threshold}%.`
          }
        </p>
        {!isGood && (
          <div style={{ marginTop:14, padding:"11px 15px", borderRadius:13, background:T.dangerFill, display:"flex", alignItems:"center", gap:10 }}>
            <AlertCircle size={15} color={T.danger} />
            <span style={{ fontSize:12, color:T.danger, fontWeight:600 }}>Currently at {Math.round(stats.percentage)}% — {Math.round(subject.threshold - stats.percentage)}pp below threshold</span>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ padding:"0 24px" }}>
        <div style={{ marginBottom:14 }}><Eyebrow>ATTENDANCE HISTORY</Eyebrow></div>
        {history.length === 0 && <p style={{ fontSize:13, color:T.inkM, fontStyle:"italic" }}>No records yet.</p>}
        {history.map((rec, i) => (
          <div key={rec.id} className={`ae${Math.min(i+1,5)}`} style={{
            display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
            background:T.card, borderRadius:17, marginBottom:8,
            boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.06)`,
          }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:F.serif, fontSize:15, color:T.inkH, fontWeight:500, marginBottom:4 }}>
                {new Date(rec.date).toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" })}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{rec.slot?.startTime}</span>
                {rec.slot?.room && <span style={{ fontFamily:F.mono, fontSize:9, color:T.accent, background:T.aFill, padding:"1px 7px", borderRadius:6 }}>{rec.slot.room}</span>}
                {rec.tag && <span style={{ fontFamily:F.mono, fontSize:9, color:T.warn, background:T.warnFill, padding:"1px 7px", borderRadius:6 }}>{rec.tag}</span>}
              </div>
              {rec.note && <p style={{ fontSize:12, color:T.inkM, fontStyle:"italic", marginTop:5, lineHeight:1.45 }}>{rec.note}</p>}
            </div>
            <Pill status={rec.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 5 — MARK ATTENDANCE SHEET
// ════════════════════════════════════════════════════════════════
function AttendanceSheet({ slotId, onClose, onSaved }: {
  slotId:string|null; onClose:()=>void; onSaved:()=>void;
}) {
  const [sel,    setSel]    = useState<Status|null>(null);
  const [cTag,   setCTag]   = useState<string|null>(null);
  const [note,   setNote]   = useState("");
  const [rDate,  setRDate]  = useState("");
  const [rStart, setRStart] = useState("");
  const [rEnd,   setREnd]   = useState("");
  const [rRoom,  setRRoom]  = useState("");
  const [visible,setVisible]= useState(false);
  const [slotInfo, setSlotInfo] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slotId) return;
    setSel(null); setCTag(null); setNote(""); setVisible(false);
    setSlotInfo(null);
    requestAnimationFrame(() => setVisible(true));

    (async () => {
      try {
        const { slot } = await api.get(`/slots/${slotId}`);
        setSlotInfo(slot);
        setRDate(new Date().toISOString().slice(0,10));
        setRStart(slot.startTime);
        setREnd(slot.endTime);
        setRRoom(slot.room || "");
      } catch (e) {
        console.error(e);
      }
    })();
  }, [slotId]);

  if (!slotId) return null;

  const TAGS = ["Holiday","Prof Absent","Exam","Other"];
  const OPTS: { s:Status; desc:string; icon:React.ReactNode }[] = [
    { s:"present",     desc:"I attended this class",     icon:<Check size={18}/> },
    { s:"absent",      desc:"I missed this class",        icon:<X size={18}/> },
    { s:"cancelled",   desc:"Class was called off",       icon:<Ban size={18}/> },
    { s:"rescheduled", desc:"Moving to another time",     icon:<RotateCcw size={18}/> },
  ];

  async function handleSave() {
    if (!sel || !slotId) return;
    setSaving(true);
    try {
      let before: any = null;
      if (sel === "present" && slotInfo) {
        before = await api.get(`/records/stats/subject/${slotInfo.subjectId}`);
      }

      await api.post("/records/mark", {
        slotId, date: new Date().toISOString(), status: sel,
        note: note || undefined,
        tag: sel === "cancelled" && cTag ? cTag.toLowerCase().replace(/\s+/g, "_") : undefined,
      });

      if (sel === "rescheduled" && slotInfo) {
        await api.post("/slots/extra", {
          semesterId: slotInfo.semesterId,
          subjectId: slotInfo.subjectId,
          date: rDate,
          startTime: rStart,
          endTime: rEnd,
          room: rRoom || undefined,
          mode: "replace",
          replacesSlotId: slotId,
        });
      }

      if (before && slotInfo) {
        const after = await api.get(`/records/stats/subject/${slotInfo.subjectId}`);
        if (before.stats.percentage < after.subject.threshold && after.stats.percentage >= after.subject.threshold) {
          fireConfetti();
        }
      }

      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
      <div style={{
        position:"fixed", bottom:0, left:"50%",
        width:"100%", maxWidth:390,
        background:T.card, borderRadius:"28px 28px 0 0",
        boxShadow:`0 -12px 56px rgba(27,21,48,0.20)`,
        zIndex:51,
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(100%)",
        transition:`transform 0.42s cubic-bezier(0.22,1.3,0.55,1)`,
      }}>
        <div style={{ display:"flex", justifyContent:"center", padding:"16px 0 0" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:"rgba(27,21,48,0.1)" }} />
        </div>

        <div style={{ padding:"16px 24px 18px", borderBottom:`1px solid rgba(110,79,145,0.09)` }}>
          <div style={{ marginBottom:5 }}><Eyebrow>MARK ATTENDANCE</Eyebrow></div>
          <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:T.inkH, marginBottom:6 }}>
            {slotInfo?.subject?.name || "Loading..."}
          </h3>
          {slotInfo && (
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>Today · {slotInfo.startTime}–{slotInfo.endTime}</span>
              {slotInfo.room && <span style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"2px 9px", borderRadius:7 }}>{slotInfo.room}</span>}
            </div>
          )}
        </div>

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

          {sel==="rescheduled" && (
            <div style={{ marginBottom:12, padding:"16px", background:T.warnFill, borderRadius:18, animation:"ae0 0.28s ease both" }}>
              <div style={{ marginBottom:14 }}>
                <Eyebrow>MOVING TO</Eyebrow>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input type="date" value={rDate} onChange={e => setRDate(e.target.value)} style={fieldStyle} />
                <input type="time" value={rStart} onChange={e => setRStart(e.target.value)} style={{ ...fieldStyle, width:80 }} />
                <input type="time" value={rEnd} onChange={e => setREnd(e.target.value)} style={{ ...fieldStyle, width:80 }} />
              </div>
              <input placeholder="Room (optional)" value={rRoom} onChange={e => setRRoom(e.target.value)} style={{ ...fieldStyle, width:"100%", marginTop:8, boxSizing:"border-box" }} />
            </div>
          )}

          <input
            placeholder="Add a note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ ...fieldStyle, width:"100%", fontStyle: note?"normal":"italic", marginBottom:0 }}
          />

          <button
            disabled={!sel || saving}
            onClick={handleSave}
            style={{
              width:"100%", padding:"17px", borderRadius:20, border:"none",
              background: sel ? T.accent : "rgba(110,79,145,0.12)",
              color: sel ? "#fff" : T.inkM,
              fontFamily:F.sans, fontSize:16, fontWeight:600,
              cursor: sel ? "pointer" : "not-allowed",
              marginTop:14, marginBottom:10,
              boxShadow: sel ? S.acc : "none",
              transition:"all 0.22s ease",
            }}
          >
            {saving ? "Saving..." : "Save Attendance"}
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
  const [semesterId, setSemesterId] = useState<string|null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [days, setDays] = useState<{date:string; color:string; classCount:number; present:number; absent:number}[]>([]);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [expRecs, setExpRecs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { semesters } = await api.get("/semesters");
      const active = semesters.find((s:any) => s.isActive) || semesters[0];
      if (active) setSemesterId(active.id);
    })();
  }, []);

  useEffect(() => {
    if (!semesterId) return;
    (async () => {
      const { days: fetched } = await api.get(`/records/calendar?semesterId=${semesterId}&year=${year}&month=${month}`);
      setDays(fetched);
    })();
  }, [semesterId, year, month]);

  async function openDay(dateStr: string) {
    if (expanded === dateStr) { setExpanded(null); return; }
    setExpanded(dateStr);
    if (!semesterId) return;
    const { records } = await api.get(`/records/day?semesterId=${semesterId}&date=${dateStr}`);
    setExpRecs(records);
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
    setExpanded(null);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
    setExpanded(null);
  }

  const dayMap = new Map(days.map(d => [d.date, d]));
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  function cs(color: string) {
    if (color === "green") return { bg:T.safeFill,   fg:T.safe };
    if (color === "red")   return { bg:T.dangerFill, fg:T.danger };
    if (color === "grey")  return { bg:T.cancelFill, fg:T.inkM };
    return { bg:"transparent", fg:T.inkL };
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"56px 24px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div className="ae0" style={{ marginBottom:8 }}><Eyebrow>ATTENDANCE HISTORY</Eyebrow></div>
            <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>{monthLabel}</h2>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} color={T.inkM} /></button>
            <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} color={T.inkM} /></button>
          </div>
        </div>
      </div>

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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
          {["M","T","W","T","F","S","S"].map((d,i) => (
            <div key={i} style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, textAlign:"center", paddingBottom:4 }}>{d}</div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:5 }}>
          {Array.from({ length:firstWeekday }, (_,i) => <div key={`e${i}`} style={{ height:46 }} />)}
          {Array.from({ length:daysInMonth }, (_,i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const entry = dayMap.get(dateStr);
            const isToday = dateStr === todayStr;
            const { bg, fg } = entry ? cs(entry.color) : cs("none");
            const isE = expanded === dateStr;
            return (
              <button key={day}
                onClick={() => openDay(dateStr)}
                style={{
                  height:46, borderRadius:12, border: isToday ? `2px solid ${T.accent}` : "none",
                  background: bg || "rgba(110,79,145,0.028)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", outline:"none",
                  transform: isE ? "scale(1.1)" : "scale(1)",
                  boxShadow: isE ? S.md : "none",
                  transition:"transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease",
                }}
              >
                <span style={{ fontFamily:F.serif, fontWeight:isToday?600:400, fontSize:15, color:fg }}>{day}</span>
              </button>
            );
          })}
        </div>

        {expanded && (
          <div style={{
            marginTop:16, background:T.card, borderRadius:24, padding:"18px 16px",
            boxShadow:S.lg, border:`1px solid rgba(110,79,145,0.1)`,
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <Eyebrow>{new Date(expanded + "T12:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"long" }).toUpperCase()}</Eyebrow>
              <button onClick={()=>setExpanded(null)} style={{ background:"none", border:"none", cursor:"pointer", color:T.inkM }}><X size={16} /></button>
            </div>
            {expRecs.length===0 ? (
              <p style={{ fontSize:14, color:T.inkM, fontStyle:"italic" }}>No records for this day.</p>
            ) : expRecs.map((rec,i) => (
              <div key={rec.id} style={{
                display:"flex", alignItems:"center", gap:12, marginBottom:10,
                paddingBottom:10, borderBottom: i<expRecs.length-1 ? `1px solid rgba(110,79,145,0.07)` : "none",
              }}>
                <div style={{ width:34, height:34, borderRadius:10, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Icon name="BookOpen" size={15} color={rec.slot?.subject?.color||T.accent} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:14, color:T.inkH, marginBottom:2 }}>{rec.slot?.subject?.name}</div>
                  <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{rec.slot?.startTime} · {rec.slot?.room}</div>
                </div>
                <Pill status={rec.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 7 — SEMESTER MANAGEMENT
// ════════════════════════════════════════════════════════════════
function SemesterScreen({ onStartNew }: { onStartNew: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [expand,  setExpand]  = useState<number|null>(null);
  const [current, setCurrent] = useState<{semester:any; overall:any; subjectCount:number}|null>(null);
  const [archived, setArchived] = useState<any[]>([]);
  const [expandStats, setExpandStats] = useState<Record<string, any>>({});
  const [starting, setStarting] = useState(false);

  async function loadAll() {
    const { semesters } = await api.get("/semesters");
    const active = semesters.find((s:any) => s.isActive);
    const archivedList = semesters.filter((s:any) => !s.isActive);
    setArchived(archivedList);

    if (active) {
      const [{ overall }, { subjects }] = await Promise.all([
        api.get(`/records/stats/overview?semesterId=${active.id}`),
        api.get(`/subjects?semesterId=${active.id}`),
      ]);
      setCurrent({ semester: active, overall, subjectCount: subjects.length });
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function toggleExpand(sem: any, i: number) {
    if (expand === i) { setExpand(null); return; }
    setExpand(i);
    if (!expandStats[sem.id]) {
      const { overall } = await api.get(`/records/stats/overview?semesterId=${sem.id}`);
      setExpandStats(prev => ({ ...prev, [sem.id]: overall }));
    }
  }

  async function confirmStartNew() {
    setStarting(true);
    try {
      await api.post("/semesters/start-new", {});
      setConfirm(false);
      onStartNew();
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"56px 24px 24px" }}>
        <div style={{ marginBottom:8 }}><Eyebrow>SEMESTER MANAGEMENT</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Semesters</h2>
      </div>

      {current && (
        <div style={{ margin:"0 24px 28px" }}>
          <div style={{
            background:`linear-gradient(150deg, ${T.accent} 0%, #8B6FBB 100%)`,
            borderRadius:28, padding:"28px 24px",
            boxShadow:`0 12px 40px rgba(110,79,145,0.44), 0 4px 12px rgba(110,79,145,0.22)`,
            position:"relative", overflow:"hidden",
          }}>
            <div style={{ position:"absolute", top:-24, right:-24, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.1)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:-20, left:-12, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }} />

            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", position:"relative" }}>
              <div>
                <Eyebrow><span style={{ color:"rgba(255,255,255,0.62)", fontFamily:F.mono }}>CURRENT</span></Eyebrow>
                <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:28, color:"#fff", marginTop:8, marginBottom:5 }}>{current.semester.name}</h3>
              </div>
              <Seal pct={Math.round(current.overall.percentage)} size={68} animate label="" />
            </div>

            <div style={{ display:"flex", gap:8, marginTop:22 }}>
              {[{l:"Subjects",v:current.subjectCount},{l:"Attended",v:current.overall.attended},{l:"Total",v:current.overall.held}].map(item => (
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
            }}>
              <Archive size={16} /> Archive & Start New Semester
            </button>
          </div>
        </div>
      )}

      <div style={{ padding:"0 24px" }}>
        <div style={{ marginBottom:14 }}><Eyebrow>ARCHIVED SEMESTERS</Eyebrow></div>
        {archived.length === 0 && <p style={{ fontSize:13, color:T.inkM, fontStyle:"italic" }}>No archived semesters yet.</p>}
        {archived.map((sem,i) => {
          const stats = expandStats[sem.id];
          return (
            <div key={sem.id}>
              <button onClick={() => toggleExpand(sem, i)} style={{
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
                  <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>
                    {new Date(sem.startDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" })}
                    {sem.endDate ? ` – ${new Date(sem.endDate).toLocaleDateString("en-IN", { month:"short", year:"numeric" })}` : ""}
                  </div>
                </div>
                {stats && (
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:stats.percentage>=75?T.safe:T.danger }}>{Math.round(stats.percentage)}%</div>
                    <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, letterSpacing:"0.09em" }}>OVERALL</div>
                  </div>
                )}
                <div style={{ transform: expand===i ? "rotate(180deg)":"rotate(0)", transition:"transform 0.2s ease", marginLeft:4 }}>
                  <ChevronDown size={15} color={T.inkM} />
                </div>
              </button>

              {expand===i && (
                <div style={{
                  background:T.card, borderRadius:"0 0 18px 18px",
                  padding:"16px 18px 18px", marginBottom:10,
                  boxShadow:S.sm,
                }}>
                  {stats ? (
                    <>
                      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                        {[{l:"Attended",v:stats.attended},{l:"Total",v:stats.held}].map(item=>(
                          <div key={item.l} style={{ flex:1, background:T.bg, borderRadius:13, padding:"10px 8px", textAlign:"center" }}>
                            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:20, color:T.inkH }}>{item.v}</div>
                            <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.09em", marginTop:2 }}>{item.l}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:"10px 14px", background:T.aFill, borderRadius:12, display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>Read-only · Archived</span>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize:13, color:T.inkM }}>Loading...</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
              {current?.semester.name} will be archived. All attendance records will be preserved in read-only mode.
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirm(false)} style={{ flex:1, padding:"15px", borderRadius:15, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={confirmStartNew} disabled={starting} style={{ flex:1, padding:"15px", borderRadius:15, border:"none", background:T.accent, color:"#fff", fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer", boxShadow:S.acc }}>
                {starting ? "Archiving..." : "Archive"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EditTimetableScreen({ onBack }: { onBack: () => void }) {
  const [semesterId, setSemesterId] = useState<string|null>(null);
  const [subjects, setSubjects] = useState<{id:string; name:string; color:string; threshold:number}[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newThreshold, setNewThreshold] = useState("75");
  const [loading, setLoading] = useState(false);
  const PALETTE = ["#6E4F91","#8B6FBB","#5A3D78","#9B7FCC","#7A5AA0"];

  async function load() {
    const { semesters } = await api.get("/semesters");
    const active = semesters.find((s:any) => s.isActive) || semesters[0];
    if (!active) return;
    setSemesterId(active.id);
    const { subjects: fetched } = await api.get(`/subjects?semesterId=${active.id}`);
    setSubjects(fetched);
  }

  useEffect(() => { load(); }, []);

  async function addSubject() {
    if (!newName.trim() || !semesterId) return;
    setLoading(true);
    try {
      const color = PALETTE[subjects.length % PALETTE.length];
      const { subject } = await api.post("/subjects", {
        semesterId, name: newName.trim(), color,
        threshold: parseInt(newThreshold, 10) || 75,
      });
      setSubjects(prev => [...prev, subject]);
      setNewName(""); setNewThreshold("75"); setAdding(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:60 }}>
      <div style={{ padding:"56px 24px 20px" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6, color:T.accent, marginBottom:20, padding:0, fontFamily:F.sans, fontSize:14, fontWeight:500 }}>
          <ChevronLeft size={17} /> Back
        </button>
        <div style={{ marginBottom:8 }}><Eyebrow>SUBJECTS & TIMETABLE</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Edit Timetable</h2>
      </div>

      <div style={{ padding:"0 24px" }}>
        {semesterId && subjects.map((s, i) => (
          <SubjectSlotRow key={s.id} subject={s} index={i} semesterId={semesterId} />
        ))}

        {adding ? (
          <div style={{ padding:"16px", borderRadius:18, marginBottom:10, background:T.card, boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)` }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)} placeholder="Subject name"
              style={{ width:"100%", padding:"12px 14px", borderRadius:12, marginBottom:10, border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg, fontFamily:F.sans, fontSize:14, color:T.inkH, outline:"none", boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12 }}>
              <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>Threshold %</span>
              <input
                value={newThreshold} onChange={e => setNewThreshold(e.target.value.replace(/\D/g, ""))}
                style={{ width:60, padding:"8px 10px", borderRadius:10, border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg, fontFamily:F.sans, fontSize:13, color:T.inkH, outline:"none", textAlign:"center" }}
              />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setAdding(false)} style={{ flex:1, padding:"11px", borderRadius:12, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancel</button>
              <button onClick={addSubject} disabled={loading} style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:T.accent, color:"#fff", fontFamily:F.sans, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{
            width:"100%", padding:"15px", borderRadius:18, marginBottom:8,
            border:`1.5px dashed rgba(110,79,145,0.3)`, background:"transparent",
            color:T.accent, fontFamily:F.sans, fontSize:14, fontWeight:500,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>
            <Plus size={15} /> Add Subject
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 8 — SETTINGS
// ════════════════════════════════════════════════════════════════
function SettingsScreen({ onSemesters, onOnboarding, onEditTimetable }: {
  onSemesters:()=>void; onOnboarding:()=>void; onEditTimetable:()=>void;
}) {
  async function downloadReport() {
    try {
      const { semesters } = await api.get("/semesters");
      const active = semesters.find((s:any) => s.isActive) || semesters[0];
      if (!active) return;

      const token = getToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/records/report/pdf?semesterId=${active.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to generate report");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-report-${active.name.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  }
  const groups = [
    { title:"TIMETABLE", items:[
      { I:Edit2,       l:"Edit Subjects",         s:"Manage your courses",        c:"#6E4F91", fn:onEditTimetable as (()=>void)|undefined },
      { I:LayoutGrid,  l:"Edit Timetable",         s:"Manage weekly slots",        c:"#8B6FBB", fn:onEditTimetable },
      { I:AlertCircle, l:"Attendance Thresholds",  s:"75% default · 80% for EC201",c:"#5A3D78", fn:undefined },
    ]},
    { title:"NOTIFICATIONS", items:[
      { I:Bell, l:"Class Reminders",       s:"15 min before class",        c:"#7A5AA0", fn:undefined },
      { I:Bell, l:"Low Attendance Alerts", s:"Below threshold",            c:"#9B7FCC", fn:undefined },
    ]},
    { title:"DATA & EXPORT", items:[
      { I:Archive,  l:"Manage Semesters",   s:"3 archived",                c:"#6E4F91", fn:onSemesters },
      { I:Download, l:"Export PDF Report",  s:"Full attendance report",    c:"#8B6FBB", fn:downloadReport },
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
      position:"fixed", left:14, right:14, bottom:14,
      background:"#FFFFFF", borderRadius:24,
      boxShadow:"0 12px 30px rgba(27,21,48,0.14), 0 2px 8px rgba(27,21,48,0.06)",
      display:"flex", zIndex:40, padding:"12px 8px",
    }}>
      {TABS.map(({ id,I,label }) => {
        const on = active===id;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4,
            border:"none", background:"transparent", cursor:"pointer", padding:0,
          }}>
            <div style={{
              width:34, height:26, borderRadius:9,
              background: on ? T.aFill : "transparent",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"background 0.2s ease",
            }}>
              <I size={16} color={on?T.accent:T.inkL} strokeWidth={2} />
            </div>
            <span style={{ fontFamily:F.sans, fontSize:10, fontWeight:600, color:on?T.accent:T.inkL }}>
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
  const [homeRefresh, setHomeRefresh] = useState(0);
  const [checkingOnboard, setCheckingOnboard] = useState(true);

  // Runs once whenever the user becomes authenticated (fresh login,
  // signup, or an existing token found on page load). If they already
  // have a semester set up, skip straight to Home instead of showing
  // onboarding again.
  useEffect(() => {
    if (!authed) { setCheckingOnboard(false); return; }
    let cancelled = false;
    setCheckingOnboard(true);
    api.get("/semesters")
      .then((data) => {
        if (cancelled) return;
        if (data.semesters && data.semesters.length > 0) {
          setScreen("home");
          setTab("home");
        } else {
          setScreen("onboarding");
        }
      })
      .catch(() => {
        // If the check fails, don't trap the user on onboarding forever —
        // fall back to onboarding, they can navigate from there.
        if (!cancelled) setScreen("onboarding");
      })
      .finally(() => {
        if (!cancelled) setCheckingOnboard(false);
      });
    return () => { cancelled = true; };
  }, [authed]);

  const goTab = (t: TabId) => {
    setTab(t);
    const m: Record<TabId,Screen> = { home:"home", timetable:"timetable", calendar:"calendar", settings:"settings" };
    setScreen(m[t]);
    setSubjId(null);
  };

  const resetToken = new URLSearchParams(window.location.search).get("reset");
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={() => { window.location.href = window.location.pathname; }}
      />
    );
  }

  if (!authed) {
    return <AuthScreen onSuccess={() => setAuthed(true)} />;
  }

  if (checkingOnboard) {
    return (
      <div style={{
        minHeight: "100dvh", background: T.bg, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: F.sans,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: "linear-gradient(140deg,#6E4F91 0%,#9B7FCC 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: S.acc, animation: "ae-pulse 1.1s ease-in-out infinite",
        }}>
          <GraduationCap size={22} color="#fff" />
        </div>
        <style>{`
          @keyframes ae-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(0.94); } }
        `}</style>
      </div>
    );
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
        @keyframes ae-line-grow {
          from { transform:scaleY(0); }
          to   { transform:scaleY(1); }
        }
        @keyframes ae-dot-breathe {
          0%, 100% { box-shadow: 0 0 0 3px rgba(110,79,145,0.32); }
          50%      { box-shadow: 0 0 0 6px rgba(110,79,145,0.14); }
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
        <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ height:"100dvh", overflowY:"auto" }}
        >
          {screen==="onboarding" && (
            <OnboardingScreen onDone={() => { setScreen("home"); setTab("home"); }} />
          )}
          {screen==="home" && (
            <HomeScreen
              refreshKey={homeRefresh}
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
          {screen==="semester"  && (
            <SemesterScreen onStartNew={() => { setScreen("onboarding"); setTab("home"); }} />
          )}
          {screen==="settings"  && (
            <SettingsScreen
              onSemesters={() => setScreen("semester")}
              onOnboarding={() => setScreen("onboarding")}
              onEditTimetable={() => setScreen("edit-timetable")}
            />
          )}
          {screen==="edit-timetable" && (
            <EditTimetableScreen onBack={() => setScreen("settings")} />
          )}
        </motion.div>
        </AnimatePresence>

        {screen !== "onboarding" && (
          <TabBar active={tab} onChange={goTab} />
        )}
      </div>

      {/* Attendance sheet rendered outside container for full-screen overlay */}
      <AttendanceSheet
        slotId={markSlot}
        onClose={() => setMarkSlot(null)}
        onSaved={() => {
          setMarkSlot(null);
          setHomeRefresh(r => r + 1);
        }}
      />
    </>
  );
}