import { useState, useEffect, useRef, useCallback, useId } from "react";
import {
  Home, CalendarDays, LayoutGrid, Settings, Plus, ChevronLeft, ChevronRight, ChevronDown,
  Eye, EyeOff, X, Check, Ban, RotateCcw, Bell, Cpu, Calculator, PenLine, TrendingUp, Code2,
  Edit2, Download, Archive, BookOpen, GraduationCap, AlertCircle, FileText,
  Sparkles, Star, Clock, Smartphone, Trash2, AlertTriangle, LogOut, ArrowRight,
} from "lucide-react";
import AuthScreen from "./AuthScreen";
import ResetPasswordScreen from "./ResetPasswordScreen";
import { api, getToken, clearToken } from "../lib/api";
import { subscribeToPush } from "../lib/push";
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
type Screen   = "onboarding" | "home" | "timetable" | "subject" | "calendar" | "semester" | "settings" | "edit-timetable" | "profile";
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
function Seal({ pct, size=84, animate=false, label="OVERALL", flat=false, tierColor }: {
  pct:number; size?:number; animate?:boolean; label?:string; flat?:boolean; tierColor?:string;
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
      background: flat ? "transparent" : "#FFFFFF",
      boxShadow: flat ? "none" : "0 10px 26px rgba(110,79,145,0.2), 0 2px 8px rgba(27,21,48,0.06), inset 0 1px 0 #fff",
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
          cx={size/2} cy={size/2} r={r} fill="none" stroke={tierColor || `url(#${gradId})`} strokeWidth={stroke}
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
          <div style={{ fontFamily:F.mono, fontSize:size*0.078, letterSpacing:"0.09em", color: flat ? T.inkM : T.accent, marginTop:3, textTransform:"uppercase", fontWeight:600 }}>
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
      fontFamily:F.sans, fontSize:11.5, fontWeight:700, color:text, background:bg,
      padding:"6px 13px", borderRadius:100, whiteSpace:"nowrap", flexShrink:0,
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

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width:42, height:24, borderRadius:100, border:"none", cursor:"pointer",
        background: checked ? "linear-gradient(135deg,#8E6BB8,#6E4F91)" : "#E4E0EA",
        boxShadow: checked ? "0 3px 8px rgba(110,79,145,0.35)" : "none",
        position:"relative", transition:"background 0.2s ease", flexShrink:0, padding:0,
      }}
    >
      <div style={{
        position:"absolute", top:2, left: checked ? 20 : 2,
        width:20, height:20, borderRadius:"50%", background:"#fff",
        boxShadow:"0 2px 5px rgba(27,21,48,0.2)", transition:"left 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      }} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 1 — ONBOARDING
// ════════════════════════════════════════════════════════════════
function OnboardingScreen({ onDone, skipIntro }: { onDone:()=>void; skipIntro?: boolean }) {
  const [step,  setStep]  = useState<0|1>(0);
  const [name,  setName]  = useState("");
  const [semesterEndDate, setSemesterEndDate] = useState("");
  const [pulse, setPulse] = useState(false);

  const [semesterId, setSemesterId] = useState<string|null>(null);
  const [subjects, setSubjects] = useState<{id:string; name:string; color:string; hasLecture:boolean; hasTutorial:boolean; hasPractical:boolean; thresholdLecture:number; thresholdTutorial:number; thresholdPractical:number}[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTypes, setNewTypes] = useState<Record<ClassType, boolean>>({ lecture:false, tutorial:false, practical:false });
  const [newThresholds, setNewThresholds] = useState<Record<ClassType, string>>({ lecture:"75", tutorial:"75", practical:"75" });
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

  function resetAddForm() {
    setNewName("");
    setNewTypes({ lecture:false, tutorial:false, practical:false });
    setNewThresholds({ lecture:"75", tutorial:"75", practical:"75" });
    setError(null);
  }

  async function addSubject() {
    setError(null);
    if (!newName.trim() || !semesterId) { setError("Subject name is required."); return; }
    const selected = TYPE_ORDER.filter(t => newTypes[t]);
    if (!selected.length) { setError("Select at least one class type."); return; }
    for (const t of selected) {
      const raw = newThresholds[t].trim();
      const n = parseInt(raw, 10);
      if (raw === "" || isNaN(n) || n < 0 || n > 100) {
        setError(`${t[0].toUpperCase()+t.slice(1)} threshold must be between 0–100%.`);
        return;
      }
    }
    setLoading(true);
    try {
      const color = PALETTE[subjects.length % PALETTE.length];
      const body: any = {
        semesterId, name: newName.trim(), color,
        hasLecture: selected.includes("lecture"),
        hasTutorial: selected.includes("tutorial"),
        hasPractical: selected.includes("practical"),
      };
      if (selected.includes("lecture"))   body.thresholdLecture   = parseInt(newThresholds.lecture, 10);
      if (selected.includes("tutorial"))  body.thresholdTutorial  = parseInt(newThresholds.tutorial, 10);
      if (selected.includes("practical")) body.thresholdPractical = parseInt(newThresholds.practical, 10);

      const { subject } = await api.post("/subjects", body);
      setSubjects(prev => [...prev, subject]);
      resetAddForm();
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
            <h1 className="ae2" style={{ fontFamily:F.serif, fontWeight:500, fontSize:31, color:T.inkH, lineHeight:1.18, letterSpacing:"-0.01em", marginBottom:16 }}>
              Never guess your attendance again.
            </h1>
            <p className="ae3" style={{ fontSize:14.5, color:T.inkM, lineHeight:1.6, marginBottom:34, maxWidth:310 }}>
              AttendEasy tracks every class so you always know exactly where you stand — <b style={{ color:T.inkB, fontWeight:600 }}>before it's too late</b>.
            </p>
            {!skipIntro && (
              <div className="ae4" style={{ marginBottom:20 }}>
                <label style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600, display:"block", marginBottom:9 }}>
                  Your Name
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your name"
                  style={{
                    width:"100%", padding:"15px 17px", borderRadius:15,
                    border:"1.5px solid #EFEAF6", background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)",
                    fontFamily:F.sans, fontSize:15, color:T.inkH, outline:"none",
                    boxShadow:"0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
                    boxSizing:"border-box", transition:"border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(110,79,145,0.12)"; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = "#EFEAF6"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)"; }}
                />
              </div>
            )}

            <div className="ae4">
              <label style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600, display:"block", marginBottom:9 }}>
                Semester Ends On <span style={{ textTransform:"none", fontWeight:400, color:T.inkL }}>(optional, for accurate bunk calculator)</span>
              </label>
              <input
                type="date"
                value={semesterEndDate}
                onChange={e => setSemesterEndDate(e.target.value)}
                style={{
                  width:"100%", padding:"15px 17px", borderRadius:15,
                  border:"1.5px solid #EFEAF6", background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)",
                  fontFamily:F.sans, fontSize:15, color:T.inkH, outline:"none",
                  boxShadow:"0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
                  boxSizing:"border-box",
                }}
              />
            </div>
          </div>

          <button
            className="ae5"
            onClick={async () => {
              try {
                if (!skipIntro && name.trim()) {
                  await api.updateName(name.trim());
                }
                if (semesterEndDate && semesterId) {
                  await api.setSemesterEndDate(semesterId, semesterEndDate);
                }
              } catch (e) {
                console.error(e);
              }
              setStep(1);
            }}
            style={{
              width:"100%", padding:17, borderRadius:16, border:"none", cursor:"pointer",
              background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
              fontFamily:F.sans, fontSize:15.5, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              boxShadow:"0 16px 32px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              transition:"transform 0.14s ease",
            }}
            onMouseDown={e => { e.currentTarget.style.transform="scale(0.98)"; }}
            onMouseUp={e => { e.currentTarget.style.transform="scale(1)"; }}
          >
            Continue <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"56px 28px 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }} className="ae0">
              <button onClick={() => setStep(0)} style={{
                width:34, height:34, borderRadius:11, background:T.card, border:`1px solid ${HAIR}`,
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                boxShadow:"0 2px 6px rgba(27,21,48,0.05)", cursor:"pointer", padding:0,
              }}>
                <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
              </button>
              <span onClick={() => setStep(0)} style={{ fontFamily:F.sans, fontWeight:600, fontSize:14, color:T.accent, cursor:"pointer" }}>Back</span>
            </div>
          </div>
          <div style={{ padding:"0 28px 28px" }}>
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
                padding:"18px", borderRadius:18, marginBottom:10, background:T.card,
                boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)`,
              }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Subject name"
                  style={{
                    width:"100%", padding:"12px 14px", borderRadius:12, marginBottom:14,
                    border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg,
                    fontFamily:F.sans, fontSize:14, color:T.inkH, outline:"none", boxSizing:"border-box",
                  }}
                />

                <div style={{ fontFamily:F.mono, fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase", color:T.inkM, fontWeight:500, marginBottom:9, paddingLeft:2 }}>
                  Class types
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:6 }}>
                  {TYPE_ORDER.map(t => {
                    const checked = newTypes[t];
                    return (
                      <div key={t} style={{
                        borderRadius:13, border:`1.5px solid ${checked ? "rgba(110,79,145,0.3)" : HAIR}`,
                        background: checked ? T.aFill : T.bg, padding:"11px 13px", transition:"background 0.15s",
                      }}>
                        <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                          <input
                            type="checkbox" checked={checked}
                            onChange={e => setNewTypes(prev => ({ ...prev, [t]: e.target.checked }))}
                            style={{ width:17, height:17, accentColor:T.accent, cursor:"pointer", flexShrink:0 }}
                          />
                          <span style={{ fontFamily:F.sans, fontSize:14, fontWeight:600, color:T.inkH }}>{t[0].toUpperCase()+t.slice(1)}</span>
                        </label>
                        {checked && (
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:9, paddingLeft:27 }}>
                            <span style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM }}>Threshold</span>
                            <input
                              value={newThresholds[t]}
                              onChange={e => setNewThresholds(prev => ({ ...prev, [t]: e.target.value.replace(/\D/g, "") }))}
                              style={{ width:52, padding:"6px 8px", borderRadius:9, border:`1.5px solid rgba(110,79,145,0.25)`, background:"#fff", fontFamily:F.sans, fontSize:12.5, color:T.inkH, outline:"none", textAlign:"center" }}
                            />
                            <span style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM }}>%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {error && (
                  <div style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"10px 12px", borderRadius:12, background:T.dangerFill, marginTop:10 }}>
                    <AlertTriangle size={13} color={T.danger} style={{ flexShrink:0, marginTop:1 }} />
                    <span style={{ fontFamily:F.sans, fontSize:12, color:T.danger, fontWeight:600, lineHeight:1.4 }}>{error}</span>
                  </div>
                )}

                <div style={{ display:"flex", gap:9, marginTop:16 }}>
                  <button
                    onClick={() => { resetAddForm(); setAdding(false); }}
                    style={{ flex:1, padding:13, borderRadius:13, border:`1.5px solid ${HAIR}`, background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:600, fontSize:13.5, cursor:"pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addSubject}
                    disabled={loading}
                    style={{
                      flex:1.6, padding:13, borderRadius:13, border:"none",
                      background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
                      fontFamily:F.sans, fontWeight:700, fontSize:13.5, cursor:"pointer",
                      boxShadow:"0 10px 22px rgba(94,63,138,0.36), inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
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
                width:"100%", padding:17, borderRadius:16, border:"none",
                cursor: subjects.length === 0 ? "not-allowed" : "pointer",
                background: subjects.length === 0 ? "rgba(110,79,145,0.25)" : "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)",
                color:"#fff", fontFamily:F.sans, fontSize:15.5, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow: subjects.length === 0 ? "none" : "0 16px 32px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                transform: pulse && subjects.length > 0 ? "scale(1.022)" : "scale(1)",
                transition:"transform 0.55s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              Get Started <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const HAIR = "#EFEAF6";
const GOLD = "#C9A24B";
const TYPE_DOT: Record<string,string> = { lecture:T.accent, tutorial:GOLD, practical:T.safe };
const TYPE_TAG: Record<string,string> = { lecture:"LEC", tutorial:"TUT", practical:"PRAC" };
const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_FULL  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const TYPE_ORDER = ["lecture", "tutorial", "practical"] as const;
type ClassType = typeof TYPE_ORDER[number];

function timeToMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function SubjectSlotRow({ subject, index, semesterId, onRenamed, onDeleted }: {
  subject: {id:string; name:string; color:string; hasLecture:boolean; hasTutorial:boolean; hasPractical:boolean; thresholdLecture:number; thresholdTutorial:number; thresholdPractical:number};
  index: number;
  semesterId: string;
  onRenamed?: (id: string, name: string) => void;
  onDeleted?: (id: string) => void;
}) {
  const [name, setName] = useState(subject.name);
  const [nameInput, setNameInput] = useState(subject.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  // Local mirror of which class types the subject has — lets the Add Slot
  // Type field pick up a newly added/removed type immediately after Save,
  // without waiting on the parent list to re-fetch.
  const [typeFlags, setTypeFlags] = useState({
    lecture: subject.hasLecture,
    tutorial: subject.hasTutorial,
    practical: subject.hasPractical,
  });
  const [editTypes, setEditTypes] = useState<Record<ClassType, boolean>>({ ...typeFlags });
  const [pendingRemoveType, setPendingRemoveType] = useState<ClassType | null>(null);
  const [thresholds, setThresholds] = useState({
    lecture: subject.thresholdLecture,
    tutorial: subject.thresholdTutorial,
    practical: subject.thresholdPractical,
  });
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInputs, setThresholdInputs] = useState({
    lecture: String(subject.thresholdLecture),
    tutorial: String(subject.thresholdTutorial),
    practical: String(subject.thresholdPractical),
  });
  const [thresholdError, setThresholdError] = useState<string|null>(null);

  // Every slot in the semester (all subjects) — needed so we can detect
  // day/time conflicts against subjects other than this one, not just our own.
  const [allSlots, setAllSlots] = useState<{id:string; subjectId:string; day:number; startTime:string; endTime:string; room:string|null; prof?:string|null; type?:string; isExtra?:boolean; subject?:{name:string}}[]>([]);
  const slots = allSlots.filter(s => s.subjectId === subject.id && !s.isExtra);

  // Which class types this subject was configured for at creation — used as
  // the fallback before any slots exist yet, so a subject created with just
  // Lecture + Practical never shows a Tutorial field it was never given.
  const configuredTypes: ClassType[] = TYPE_ORDER.filter(t =>
    t === "lecture" ? typeFlags.lecture : t === "tutorial" ? typeFlags.tutorial : typeFlags.practical
  );
  // Which class types this subject actually has slots for — once slots
  // exist, they're the source of truth (a slot could only be created for
  // a configured type in the first place).
  const presentTypes: ClassType[] = TYPE_ORDER.filter(t => slots.some(s => (s.type || "lecture") === t));
  // Everywhere the UI needs to know "this subject's types" — threshold
  // display and the add/edit slot Type field — uses the same list.
  const visibleTypes: ClassType[] = presentTypes.length ? presentTypes : (configuredTypes.length ? configuredTypes : ["lecture"]);
  const typeOptions: ClassType[] = visibleTypes;

  const [classType, setClassType] = useState<ClassType | "">("");
  const [day, setDay] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [room, setRoom] = useState("");
  const [prof, setProf] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string|null>(null);
  const [formError, setFormError] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      const { slots: fetched } = await api.get(`/slots?semesterId=${semesterId}`);
      setAllSlots(fetched);
    })();
  }, [semesterId]);

  function resetForm() {
    setClassType(""); setDay(""); setStartTime(""); setEndTime("");
    setRoom(""); setProf(""); setEditingSlotId(null); setFormError(null);
  }

  function openAddForm() {
    resetForm();
    // Only skip the choice when there's truly nothing to choose from —
    // every other field is left blank for the user to fill in intentionally.
    if (typeOptions.length === 1) setClassType(typeOptions[0]);
    setAdding(true);
  }

  function openEditForm(sl: typeof allSlots[number]) {
    setClassType((sl.type as ClassType) || "lecture");
    setDay(String(sl.day));
    setStartTime(sl.startTime);
    setEndTime(sl.endTime);
    setRoom(sl.room || "");
    setProf(sl.prof || "");
    setEditingSlotId(sl.id);
    setFormError(null);
    setAdding(true);
  }

  // A slot can't share a day + overlapping time with any other slot in the
  // semester — same subject or different. excludeId lets an edit ignore
  // the slot it's currently editing.
  function findConflict(dayVal: string, start: string, end: string, excludeId: string|null) {
    const d = parseInt(dayVal, 10);
    const s = timeToMin(start), e = timeToMin(end);
    return allSlots.find(sl =>
      sl.id !== excludeId && !sl.isExtra && sl.day === d &&
      timeToMin(sl.startTime) < e && s < timeToMin(sl.endTime)
    ) || null;
  }

  async function saveSlot() {
    setFormError(null);
    if (!classType) { setFormError("Please select a class type."); return; }
    if (day === "") { setFormError("Please select a day."); return; }
    if (!startTime || !endTime) { setFormError("Please set a start and end time."); return; }
    if (timeToMin(endTime) <= timeToMin(startTime)) { setFormError("End time must be after start time."); return; }
    const conflict = findConflict(day, startTime, endTime, editingSlotId);
    if (conflict) {
      const withName = conflict.subject?.name || (conflict.subjectId === subject.id ? name : "another class");
      setFormError(`This time slot conflicts with ${withName} (${conflict.startTime}\u2013${conflict.endTime}). Please choose another time.`);
      return;
    }
    setLoading(true);
    try {
      if (editingSlotId) {
        const { slot } = await api.patch(`/slots/${editingSlotId}`, {
          type: classType, day: parseInt(day, 10), startTime, endTime,
          room: room || null, prof: prof || null,
        });
        setAllSlots(prev => prev.map(s => s.id === slot.id ? { ...slot, subject } : s));
      } else {
        const { slot } = await api.post("/slots", {
          semesterId, subjectId: subject.id, type: classType,
          day: parseInt(day, 10), startTime, endTime, room: room || undefined, prof: prof || undefined,
        });
        setAllSlots(prev => [...prev, { ...slot, subject }]);
      }
      resetForm();
      setAdding(false);
    } catch (e: any) {
      setFormError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(id: string) {
    setDeleting(true);
    try {
      await api.del(`/slots/${id}`);
      setAllSlots(prev => prev.filter(s => s.id !== id));
      resetForm();
      setAdding(false);
    } catch (e: any) {
      setFormError(e.message || "Couldn't delete this slot. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSubject() {
    setDeletingSubject(true);
    try {
      await api.del(`/subjects/${subject.id}`);
      onDeleted?.(subject.id);
    } catch (e: any) {
      setThresholdError(e.message || "Couldn't delete this subject. Please try again.");
      setConfirmDelete(false);
    } finally {
      setDeletingSubject(false);
    }
  }

  // Adding a type is instant — its threshold field just appears. Removing one
  // that already has slots needs confirmation first, since it deletes them.
  function toggleType(t: ClassType, checked: boolean) {
    setThresholdError(null);
    if (checked) {
      setEditTypes(prev => ({ ...prev, [t]: true }));
      return;
    }
    const stillChecked = TYPE_ORDER.filter(x => x !== t && editTypes[x]);
    if (!stillChecked.length) {
      setThresholdError("A subject needs at least one class type.");
      return;
    }
    const count = slots.filter(s => (s.type || "lecture") === t).length;
    if (count > 0) {
      setPendingRemoveType(t);
    } else {
      setEditTypes(prev => ({ ...prev, [t]: false }));
    }
  }

  async function saveThresholds() {
    setThresholdError(null);
    if (!nameInput.trim()) {
      setThresholdError("Subject name is required.");
      return;
    }
    const selectedTypes = TYPE_ORDER.filter(t => editTypes[t]);
    if (!selectedTypes.length) {
      setThresholdError("Select at least one class type.");
      return;
    }
    const parsed: Partial<Record<ClassType, number>> = {};
    for (const t of selectedTypes) {
      const raw = thresholdInputs[t].trim();
      const n = parseInt(raw, 10);
      if (raw === "" || isNaN(n) || n < 0 || n > 100) {
        setThresholdError(`${t[0].toUpperCase()+t.slice(1)} threshold must be between 0–100%.`);
        return;
      }
      parsed[t] = n;
    }
    const removedTypes = visibleTypes.filter(t => !editTypes[t]);
    try {
      await api.patch(`/subjects/${subject.id}`, {
        name: nameInput.trim(),
        hasLecture: editTypes.lecture,
        hasTutorial: editTypes.tutorial,
        hasPractical: editTypes.practical,
        thresholdLecture: parsed.lecture ?? thresholds.lecture,
        thresholdTutorial: parsed.tutorial ?? thresholds.tutorial,
        thresholdPractical: parsed.practical ?? thresholds.practical,
      });
      setName(nameInput.trim());
      onRenamed?.(subject.id, nameInput.trim());
      setThresholds(prev => ({ ...prev, ...parsed }));
      setTypeFlags({ ...editTypes });
      if (removedTypes.length) {
        setAllSlots(prev => prev.filter(s => !(s.subjectId === subject.id && removedTypes.includes((s.type || "lecture") as ClassType))));
      }
      setEditingThreshold(false);
    } catch (e: any) {
      setThresholdError(e.message || "Couldn't save changes. Please try again.");
    }
  }

  const selectStyle: React.CSSProperties = {
    width:"100%", padding:"12px 30px 12px 13px", borderRadius:13, border:`1.5px solid ${HAIR}`,
    background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)", fontFamily:F.sans, fontSize:13.5, color:T.inkH,
    outline:"none", boxShadow:"0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
    appearance:"none", WebkitAppearance:"none", MozAppearance:"none", cursor:"pointer", boxSizing:"border-box",
  };
  const inputStyle: React.CSSProperties = {
    width:"100%", padding:"12px 13px", borderRadius:13, border:`1.5px solid ${HAIR}`,
    background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)", fontFamily:F.sans, fontSize:13.5, color:T.inkH,
    outline:"none", boxShadow:"0 1px 2px rgba(27,21,48,0.03), inset 0 1px 0 rgba(255,255,255,0.8)",
    boxSizing:"border-box",
  };
  const fieldLabelStyle: React.CSSProperties = {
    display:"block", fontFamily:F.mono, fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase",
    color:T.inkM, marginBottom:6, paddingLeft:2, fontWeight:500,
  };

  return (
    <div className={`ae${Math.min(index+1,5)}`} style={{
      position:"relative", padding:"18px 20px 20px", borderRadius:22, marginBottom:14, background:T.card,
      boxShadow:"0 14px 32px rgba(27,21,48,0.09), 0 2px 8px rgba(27,21,48,0.04)", border:`1px solid ${HAIR}`,
      overflow:"hidden",
    }}>
      {/* per-subject accent strip — keeps each card visually distinct without touching subject.color logic */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:subject.color, opacity:0.55 }} />

      {/* subject header — name leads, avatar is a small identity mark, edit sits inline */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{
          width:30, height:30, borderRadius:9, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
          background:`${subject.color}17`, border:`1px solid ${subject.color}2E`,
        }}>
          <span style={{ fontFamily:F.serif, fontWeight:700, fontSize:11.5, color:subject.color, letterSpacing:"-0.02em" }}>
            {name.trim().split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase() || "?"}
          </span>
        </div>
        <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:19.5, color:T.inkH, letterSpacing:"-0.01em", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {name}
        </div>
        <button
          onClick={() => {
            setEditingThreshold(v => !v); setThresholdError(null); setNameInput(name);
            setEditTypes({ lecture: visibleTypes.includes("lecture"), tutorial: visibleTypes.includes("tutorial"), practical: visibleTypes.includes("practical") });
          }}
          style={{ width:26, height:26, borderRadius:8, background:T.aFill, border:"none", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" }}
        >
          <Edit2 size={12} color={T.accent} />
        </button>
      </div>

      {/* thresholds + slot counts — one aligned row directly under the name, avatar-width indented */}
      <div style={{ marginLeft:40 }}>
        {editingThreshold ? (
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:10 }}>
            <div style={{ marginBottom:2 }}>
              <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.06em" }}>Subject Name</span>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Subject name"
                style={{ width:"100%", marginTop:5, padding:"7px 9px", borderRadius:8, border:`1.5px solid rgba(110,79,145,0.3)`, fontFamily:F.sans, fontSize:12.5, color:T.inkH, outline:"none", boxSizing:"border-box" }}
              />
            </div>
            {/* class types — check to add (threshold field appears), uncheck to remove
                (confirms first if that type already has slots) */}
            <div style={{ marginBottom:2 }}>
              <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.06em" }}>Class Types</span>
            </div>
            {TYPE_ORDER.map(t => (
              <div key={t} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <input
                  type="checkbox"
                  checked={editTypes[t]}
                  onChange={e => toggleType(t, e.target.checked)}
                  style={{ width:14, height:14, accentColor:T.accent, cursor:"pointer", flexShrink:0 }}
                />
                <span style={{ fontFamily:F.sans, fontSize:11, color:T.inkH, fontWeight:600, width:56, textTransform:"capitalize" }}>{t}</span>
                {editTypes[t] && (
                  <>
                    <input
                      value={thresholdInputs[t]}
                      onChange={e => setThresholdInputs(prev => ({ ...prev, [t]: e.target.value.replace(/\D/g, "") }))}
                      style={{ width:40, padding:"3px 6px", borderRadius:6, border:`1.5px solid rgba(110,79,145,0.3)`, fontSize:11, textAlign:"center" }}
                    />
                    <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM }}>%</span>
                  </>
                )}
              </div>
            ))}
            {thresholdError && (
              <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:2 }}>
                <AlertTriangle size={10} color={T.danger} />
                <span style={{ fontFamily:F.sans, fontSize:10, color:T.danger, fontWeight:600 }}>{thresholdError}</span>
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:2 }}>
              <button onClick={saveThresholds} style={{ fontSize:10, color:T.accent, fontWeight:600, background:"none", border:"none", cursor:"pointer" }}>Save</button>
              <button onClick={() => {
                setEditingThreshold(false); setThresholdError(null); setNameInput(name);
                setEditTypes({ lecture: visibleTypes.includes("lecture"), tutorial: visibleTypes.includes("tutorial"), practical: visibleTypes.includes("practical") });
              }} style={{ fontSize:10, color:T.inkM, background:"none", border:"none", cursor:"pointer" }}>Cancel</button>
            </div>
            <div style={{ height:1, background:HAIR, margin:"10px 0 2px" }} />
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, fontWeight:600, color:T.danger, background:"none", border:"none", cursor:"pointer", padding:0, alignSelf:"flex-start" }}
            >
              <Trash2 size={11} /> Delete Subject
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:7, marginTop:10, flexWrap:"wrap" }}>
            {/* one pill per type — threshold and slot count merged, so a 3-type subject
                shows 3 chips instead of 6 near-duplicate ones */}
            {visibleTypes.map(t => {
              const count = slots.filter(s => (s.type || "lecture") === t).length;
              const isPresent = presentTypes.includes(t);
              return (
                <div key={t} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"5px 10px 5px 8px", borderRadius:9,
                  background:T.bg, border:`1px solid ${HAIR}`,
                }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", flexShrink:0, background:TYPE_DOT[t] }} />
                  <span style={{ fontFamily:F.sans, fontSize:11, color:T.inkH, fontWeight:700 }}>{thresholds[t]}%</span>
                  <span style={{ width:1, height:10, background:HAIR, flexShrink:0 }} />
                  <span style={{ fontFamily:F.mono, fontSize:8.5, color: isPresent ? T.accent : T.inkL, fontWeight:600 }}>
                    {count} {TYPE_TAG[t]}{count !== 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* slots grid — tap a slot to edit it, the add tile is styled as one of the grid cells */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginTop:14 }}>
        {slots.map(sl => (
          <button
            key={sl.id}
            onClick={() => openEditForm(sl)}
            style={{
              display:"flex", alignItems:"center", gap:6, padding:"9px 10px", borderRadius:11,
              background:T.aFill, border: sl.id === editingSlotId ? `1.5px solid ${T.accent}` : "1.5px solid transparent",
              cursor:"pointer", textAlign:"left", font:"inherit",
            }}
          >
            <div style={{ width:5, height:5, borderRadius:"50%", flexShrink:0, background:TYPE_DOT[sl.type||"lecture"] }} />
            <span style={{ fontFamily:F.sans, fontSize:11, color:T.inkB, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{DAYS_SHORT[sl.day]} {sl.startTime}</span>
            <span style={{ marginLeft:"auto", flexShrink:0, fontFamily:F.mono, fontSize:7.5, color:T.accent, fontWeight:700, opacity:0.7 }}>{TYPE_TAG[sl.type||"lecture"]}</span>
          </button>
        ))}
        <button
          onClick={openAddForm}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"9px 10px", borderRadius:11,
            background:T.bg, border:`1px solid ${HAIR}`, cursor:"pointer", font:"inherit",
          }}
        >
          <Plus size={12} color={T.accent} />
          <span style={{ fontFamily:F.sans, fontSize:11, color:T.accent, fontWeight:600 }}>Add slot</span>
        </button>
      </div>

      {/* add / edit slot form — collapsed until opened via a slot card or the + tile */}
      {adding && (
        <>
          <div style={{ height:1, background:HAIR, margin:"20px 0 18px" }} />

          <div>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
              <div style={{ width:4, height:4, borderRadius:"50%", background: editingSlotId ? GOLD : T.accent }} />
              <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.13em", textTransform:"uppercase", color: editingSlotId ? GOLD : T.accent, fontWeight:600 }}>
                {editingSlotId ? "Editing slot" : "New slot"}
              </span>
            </div>

            <div style={{ display:"flex", gap:9, marginBottom:11 }}>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>Type</label>
                {typeOptions.length > 1 ? (
                  <div style={{ position:"relative" }}>
                    <select value={classType} onChange={e => setClassType(e.target.value as ClassType)} style={{ ...selectStyle, color: classType ? T.inkH : T.inkL }}>
                      <option value="" disabled>Select Type</option>
                      {typeOptions.map(t => (
                        <option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} color={T.inkM} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
                  </div>
                ) : (
                  <div style={{ ...selectStyle, cursor:"default", color:T.inkH, fontWeight:600, background:T.bg }}>
                    {typeOptions[0][0].toUpperCase()+typeOptions[0].slice(1)}
                  </div>
                )}
              </div>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>Day</label>
                <div style={{ position:"relative" }}>
                  <select value={day} onChange={e => setDay(e.target.value)} style={{ ...selectStyle, color: day !== "" ? T.inkH : T.inkL }}>
                    <option value="" disabled>Select Day</option>
                    {DAYS_FULL.map((d,i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <ChevronDown size={13} color={T.inkM} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} />
                </div>
              </div>
            </div>

            <div style={{ display:"flex", gap:9, marginBottom:11 }}>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>Start Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, color: startTime ? T.inkH : T.inkL }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>End Time</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inputStyle, color: endTime ? T.inkH : T.inkL }} />
              </div>
            </div>

            <div style={{ display:"flex", gap:9, marginBottom:11 }}>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>Room <span style={{ textTransform:"none", opacity:0.7 }}>(optional)</span></label>
                <input placeholder="e.g. C-204" value={room} onChange={e => setRoom(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex:1 }}>
                <label style={fieldLabelStyle}>Professor <span style={{ textTransform:"none", opacity:0.7 }}>(optional)</span></label>
                <input placeholder="e.g. Prof. Iyer" value={prof} onChange={e => setProf(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {formError && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"10px 12px", borderRadius:12, background:T.dangerFill, marginBottom:11 }}>
                <AlertTriangle size={13} color={T.danger} style={{ flexShrink:0, marginTop:1 }} />
                <span style={{ fontFamily:F.sans, fontSize:12, color:T.danger, fontWeight:600, lineHeight:1.4 }}>{formError}</span>
              </div>
            )}

            <div style={{ display:"flex", gap:9, marginTop:6, alignItems:"center" }}>
              {editingSlotId && (
                <button onClick={() => deleteSlot(editingSlotId)} disabled={deleting} style={{
                  display:"flex", alignItems:"center", gap:5, padding:"13px 12px", borderRadius:13,
                  border:`1.5px solid ${T.dangerFill}`, background:T.dangerFill, color:T.danger,
                  fontFamily:F.sans, fontWeight:600, fontSize:13, cursor:"pointer", flexShrink:0,
                }}>
                  <Trash2 size={13} /> {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
              <button onClick={() => { resetForm(); setAdding(false); }} style={{ flex:1, padding:13, borderRadius:13, border:`1.5px solid ${HAIR}`, background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:600, fontSize:13.5, cursor:"pointer" }}>
                {editingSlotId ? "Cancel editing" : "Cancel"}
              </button>
              <button onClick={saveSlot} disabled={loading} style={{
                flex:1.6, padding:13, borderRadius:13, border:"none",
                background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
                fontFamily:F.sans, fontWeight:700, fontSize:13.5, cursor:"pointer",
                boxShadow:"0 10px 22px rgba(94,63,138,0.36), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
                {loading ? "Saving..." : editingSlotId ? "Update slot" : "Save slot"}
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <>
          <div onClick={() => !deletingSubject && setConfirmDelete(false)} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.52)", backdropFilter:"blur(6px)", zIndex:50 }} />
          <div style={{
            position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:"calc(100% - 48px)", maxWidth:320,
            background:T.card, borderRadius:24, padding:"26px 24px 22px",
            boxShadow:"0 30px 70px rgba(15,8,28,0.4), 0 10px 24px rgba(15,8,28,0.2), inset 0 1px 0 #fff",
            zIndex:51,
          }}>
            <div style={{ width:48, height:48, borderRadius:15, background:T.dangerFill, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, boxShadow:"0 8px 18px rgba(176,58,69,0.18)" }}>
              <Trash2 size={21} color={T.danger} strokeWidth={2} />
            </div>
            <h3 style={{ fontFamily:F.serif, fontWeight:700, fontSize:22, color:T.inkH, letterSpacing:"-0.01em", marginBottom:9 }}>Delete {name}?</h3>
            <p style={{ fontSize:14, color:T.inkM, lineHeight:1.55, marginBottom:22 }}>
              This will also delete all <b style={{ color:T.inkB, fontWeight:600 }}>{slots.length} timetable slot{slots.length !== 1 ? "s" : ""}</b>. This can't be undone.
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deletingSubject} style={{ flex:1, padding:14, borderRadius:14, border:`1.5px solid ${HAIR}`, background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={deleteSubject} disabled={deletingSubject} style={{
                flex:1, padding:14, borderRadius:14, border:"none", cursor:"pointer",
                background:"linear-gradient(155deg,#C24A57,#B03A45 55%,#7A2530)", color:"#fff",
                fontFamily:F.sans, fontWeight:700, fontSize:14,
                boxShadow:"0 14px 28px rgba(176,58,69,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
                {deletingSubject ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}

      {pendingRemoveType && (() => {
        const removeCount = slots.filter(s => (s.type || "lecture") === pendingRemoveType).length;
        return (
          <>
            <div onClick={() => setPendingRemoveType(null)} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.52)", backdropFilter:"blur(6px)", zIndex:50 }} />
            <div style={{
              position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
              width:"calc(100% - 48px)", maxWidth:350,
              background:T.card, borderRadius:28, padding:"30px 26px",
              boxShadow:S.lg, zIndex:51,
            }}>
              <div style={{ width:52, height:52, borderRadius:16, background:T.dangerFill, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18 }}>
                <AlertTriangle size={22} color={T.danger} />
              </div>
              <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:22, color:T.inkH, marginBottom:10 }}>
                Remove {pendingRemoveType[0].toUpperCase()+pendingRemoveType.slice(1)}?
              </h3>
              <p style={{ fontSize:14, color:T.inkM, lineHeight:1.68, marginBottom:26 }}>
                This will delete {removeCount} {pendingRemoveType} slot{removeCount !== 1 ? "s" : ""} from the timetable once you save. This can't be undone.
              </p>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setPendingRemoveType(null)} style={{ flex:1, padding:"15px", borderRadius:15, border:`1.5px solid rgba(110,79,145,0.2)`, background:"transparent", color:T.inkM, fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={() => { setEditTypes(prev => ({ ...prev, [pendingRemoveType]: false })); setPendingRemoveType(null); }}
                  style={{ flex:1, padding:"15px", borderRadius:15, border:"none", background:T.danger, color:"#fff", fontFamily:F.sans, fontSize:14, fontWeight:600, cursor:"pointer" }}
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// SCREEN 2 — HOME DASHBOARD
// ════════════════════════════════════════════════════════════════
// Same labels used on the Subject Details screen's Theory/Lab toggle, so a
// card here and the tab it opens always read the same way.
const HOME_TYPE_LABELS: Record<string,string> = { lecture:"Theory", tutorial:"Tutorial", practical:"Lab" };

function HomeScreen({ onSubject, onMark, refreshKey }: {
  onSubject:(id:string, type?:string)=>void;
  onMark:(slotId:string)=>void;
  refreshKey: number;
}) {
  const [fabOpen, setFabOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [semesterName, setSemesterName] = useState("");
  const [overall, setOverall] = useState<{percentage:number}|null>(null);
  const [subjectCards, setSubjectCards] = useState<{subject:any; type:string; stats:any; status:string}[]>([]);
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
      const slotType = cls?.slot.type || "lecture";
      let beforeStats: any = null;
      if (subjectId && status === "present") {
        const { breakdown } = await api.get(`/records/stats/subject/${subjectId}`);
        beforeStats = breakdown[slotType];
      }

      await api.post("/records/mark", { slotId, date: new Date().toISOString(), status });
      setTodayClasses(prev => prev.map(c => c.slot.id === slotId ? { ...c, record: { ...c.record, status } } : c));

      if (beforeStats && subjectId) {
        const { subject: subj, breakdown } = await api.get(`/records/stats/subject/${subjectId}`);
        const afterStats = breakdown[slotType];
        const threshold = slotType === "tutorial" ? subj.thresholdTutorial : slotType === "practical" ? subj.thresholdPractical : subj.thresholdLecture;
        if (afterStats && beforeStats.percentage < threshold && afterStats.percentage >= threshold) {
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
          {subjectCards.map(({ subject, type, stats, status }, i) => {
            const warn = status !== "green";
            const mid  = shadeHex(subject.color, -0.22);
            const dark = shadeHex(subject.color, -0.48);
            const typeLabel = HOME_TYPE_LABELS[type] || "Theory";
            return (
              <button
                key={`${subject.id}-${type}`}
                onClick={() => onSubject(subject.id, type)}
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
                    {subject.name} <span style={{ color:"rgba(255,255,255,0.5)" }}>•</span> {typeLabel}
                  </div>
                  {warn && (
                    <div style={{ marginTop:8, fontFamily:F.mono, fontSize:9, color:"rgba(255,224,188,1)", background:"rgba(0,0,0,0.24)", padding:"3px 8px", borderRadius:100, display:"inline-block" }}>
                      Below {stats.threshold}%
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
  const [classType, setClassType] = useState<"lecture"|"tutorial"|"practical">("lecture");
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
        type: classType,
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
              {label("Type")}
              <div style={{ position:"relative" }}>
                <select value={classType} onChange={e => setClassType(e.target.value as any)} style={shellStyle}>
                  <option value="lecture">Lecture</option>
                  <option value="tutorial">Tutorial</option>
                  <option value="practical">Practical</option>
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
function TimetableScreen({ onMark, isLandscape, onBack, onEditTimetable }: {
  onMark:(slotId:string)=>void; isLandscape:boolean; onBack:()=>void; onEditTimetable:()=>void;
}) {
  const [slots, setSlots] = useState<any[]>([]);
  const DAYS  = ["Mon","Tue","Wed","Thu","Fri"];
  const HOUR_START = 9, HOUR_END = 17;
  const LANE_H = 56;       // min height of a single (non-overlapping) event card — sized to fit 3 single-line rows, no leftover space
  const LANE_GAP = 4;      // gap between stacked lanes when events overlap
  const ROW_PAD = 4;       // vertical padding inside a day row
  const DAY_LABEL_W = 46;
  const MIN_HOUR_WIDTH = 50; // readability floor — low enough that the full week always fits without clipping on real landscape phone widths
  const hoursArr = Array.from({ length: HOUR_END-HOUR_START+1 }, (_,i) => HOUR_START+i);
  const hair = "#EFEAF6";

  // Measure the available grid area (width AND height) and size the hour
  // columns / row heights to fit it exactly — so the full week always fits
  // on screen with no scrollbar, instead of a fixed px size that overflows.
  const HOUR_HEADER_H = 20; // x-axis hour label row + its bottom margin
  const [gridAreaEl, setGridAreaEl] = useState<HTMLDivElement | null>(null);
  // A callback ref (not a plain useRef) so this re-fires whenever the grid div
  // actually mounts — crucially including the moment the user rotates out of
  // the portrait "please rotate" placeholder into the real landscape layout.
  // A useRef + useEffect([]) pattern only ever sees the very first mount,
  // which is the portrait placeholder (no grid div at all), so the observer
  // never got attached — the grid stayed unmeasured (disoriented) until a
  // full page refresh remounted the component already in landscape.
  const gridAreaRef = useCallback((node: HTMLDivElement | null) => setGridAreaEl(node), []);
  const [gridAreaW, setGridAreaW] = useState(0);
  const [gridAreaH, setGridAreaH] = useState(0);
  useEffect(() => {
    if (!gridAreaEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setGridAreaW(entry.contentRect.width);
        setGridAreaH(entry.contentRect.height);
      }
    });
    ro.observe(gridAreaEl);
    return () => ro.disconnect();
  }, [gridAreaEl]);
  const availableForHours = Math.max(0, gridAreaW - DAY_LABEL_W);
  // No fixed minimum here — if width is tight, columns shrink to fit rather
  // than forcing a horizontal scrollbar.
  const hourWidth = Math.max(MIN_HOUR_WIDTH, availableForHours / (HOUR_END-HOUR_START));
  const gridWidth = (HOUR_END-HOUR_START) * hourWidth;

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

  function timeToMin(t:string) { const [h,m] = t.split(":").map(Number); return h*60+m; }
  // Full "09:00–11:00" wherever the card is wide enough to comfortably fit
  // it; only narrow (short-duration) cards fall back to "9–11" so nothing
  // truncates. cardWidth is the card's actual rendered width in px.
  function formatTimeRange(start:string, end:string, cardWidth:number) {
    const FULL_FORMAT_MIN_W = 95; // below this, "HH:MM–HH:MM" risks truncating
    if (cardWidth >= FULL_FORMAT_MIN_W) return `${start}–${end}`;
    const [sh, sm] = start.split(":");
    const [eh, em] = end.split(":");
    if (sm === "00" && em === "00") return `${parseInt(sh,10)}–${parseInt(eh,10)}`;
    return `${start}–${end}`;
  }
  function leftFor(t:string)   { return Math.max(0, (timeToMin(t) - HOUR_START*60) * (hourWidth/60)); }
  function widthFor(s:string,e:string) { return (timeToMin(e)-timeToMin(s)) * (hourWidth/60); }

  // When two slots on the same day overlap in time (e.g. a rescheduled/extra class
  // landing on top of a regular one), stack them into separate tracks within the
  // row instead of letting them render on top of each other.
  function layoutDaySlots(daySlots:any[]) {
    const sorted = [...daySlots].sort((a,b) => timeToMin(a.startTime) - timeToMin(b.startTime));
    const laidOut: { slot:any; track:number; trackCount:number }[] = [];
    let cluster: any[] = [];
    let clusterEnd = -Infinity;

    function flushCluster() {
      if (!cluster.length) return;
      const trackEnds: number[] = [];
      const withTrack = cluster.map(s => {
        const start = timeToMin(s.startTime);
        let track = trackEnds.findIndex(end => end <= start);
        if (track === -1) { track = trackEnds.length; trackEnds.push(timeToMin(s.endTime)); }
        else { trackEnds[track] = timeToMin(s.endTime); }
        return { slot:s, track };
      });
      const trackCount = trackEnds.length;
      withTrack.forEach(({ slot, track }) => laidOut.push({ slot, track, trackCount }));
      cluster = [];
      clusterEnd = -Infinity;
    }

    for (const s of sorted) {
      const start = timeToMin(s.startTime), end = timeToMin(s.endTime);
      if (cluster.length && start >= clusterEnd) flushCluster();
      cluster.push(s);
      clusterEnd = Math.max(clusterEnd, end);
    }
    flushCluster();
    return laidOut;
  }

  // Base lane height: solved from the measured container so all 5 rows
  // together exactly fill it (no scrollbar, Friday never pushed off-screen).
  // Width is untouched by this — hour columns keep their own floor, so this
  // never "squeezes" cards horizontally, only sizes them vertically to fit.
  const dayLaneCounts = dates.map((_d, di) => {
    const daySlots = slots.filter(s => s.day === di);
    const laidOut = layoutDaySlots(daySlots);
    const laneCount = laidOut.reduce((max, l) => Math.max(max, l.trackCount), 1);
    return { daySlots, laidOut, laneCount };
  });
  const totalLaneUnits = dayLaneCounts.reduce((sum, d) => sum + d.laneCount, 0);
  const totalOverhead = dayLaneCounts.reduce((sum, d) => sum + (d.laneCount-1)*LANE_GAP, 0) + dates.length*ROW_PAD*2;
  const availableRowsH = Math.max(0, gridAreaH - HOUR_HEADER_H);
  const MIN_LANE_H = 56; // floor so rows stay comfortably readable even on a short viewport
  const baseLaneH = (gridAreaH > 0 && totalLaneUnits > 0)
    ? Math.max(MIN_LANE_H, (availableRowsH - totalOverhead) / totalLaneUnits)
    : LANE_H;

  // Card text is single-line + ellipsis (never wraps), so every card needs
  // the same height regardless of how narrow it is — no more per-card growing,
  // which used to make identical timetables look different across devices.
  const dayLayouts = dayLaneCounts.map(d => {
    const height = d.laneCount*baseLaneH + (d.laneCount-1)*LANE_GAP + ROW_PAD*2;
    return { ...d, laneH: baseLaneH, height };
  });
  const totalGridHeight = dayLayouts.reduce((sum, d) => sum + d.height, 0);

  // Timetable-only color assignment. Deliberately NOT reading subject.color —
  // that field is shared with the Home screen, Subject detail screen, and
  // Calendar, so changing it changes the color everywhere. This map is local
  // to this screen only, assigned by first-appearance order in `slots`.
  // Soft, desaturated shades spanning a few adjacent hue families (violet,
  // blue, green, rose, taupe) so subjects are clearly distinguishable, while
  // staying similar in saturation/lightness for a cohesive, premium feel.
  const TIMETABLE_PALETTE = [
    "#6C5D8C", // Deep Violet
    "#5C86A3", // Dusty Blue
    "#7E9B85", // Sage Green
    "#C08B97", // Soft Rose
    "#A38A72", // Warm Taupe
    "#6D7793", // Slate Blue
    "#4F9490", // Muted Teal
    "#9B7290", // Mauve
    "#8C4F5C", // Muted Burgundy
    "#8087C9", // Periwinkle
  ];
  const subjectColor = new Map<string,string>();
  slots.forEach(s => {
    if (!subjectColor.has(s.subjectId)) subjectColor.set(s.subjectId, TIMETABLE_PALETTE[subjectColor.size % TIMETABLE_PALETTE.length]);
  });

  const legendMap = new Map<string,{name:string; color:string}>();
  slots.forEach(s => { if (!legendMap.has(s.subjectId)) legendMap.set(s.subjectId, { name:s.subject.name, color: subjectColor.get(s.subjectId)! }); });
  const legend = Array.from(legendMap.values());

  if (!isLandscape) {
    return (
      <div style={{
        fontFamily:F.sans, background:T.bg, height:"100dvh", display:"flex",
        flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"40px", textAlign:"center", paddingBottom:96,
      }}>
        <div style={{
          width:64, height:64, borderRadius:20, background:T.aFill,
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18,
          animation:"ae-rotate-hint 1.8s ease-in-out infinite",
        }}>
          <Smartphone size={30} color={T.accent} strokeWidth={1.6} />
        </div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:20, color:T.inkH, marginBottom:8 }}>
          Rotate your phone
        </h2>
        <p style={{ fontSize:13.5, color:T.inkM, maxWidth:240, lineHeight:1.5 }}>
          The full week timetable looks best in landscape — turn your device sideways to view it.
        </p>
        <style>{`
          @keyframes ae-rotate-hint {
            0%, 100% { transform:rotate(0deg); }
            50%      { transform:rotate(90deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, height:"100dvh", display:"flex", overflow:"hidden" }}>
      {/* ── Sidebar ── */}
      <div style={{
        width:150, flexShrink:0, padding:"26px 20px",
        background:"linear-gradient(165deg,#F7F2FC,#FCFBFE 60%)",
        borderRight:`1px solid ${hair}`,
        display:"flex", flexDirection:"column", position:"relative", overflow:"hidden",
      }}>
        <div style={{
          position:"absolute", top:-40, right:-50, width:160, height:160, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(139,111,187,0.16), transparent 70%)", pointerEvents:"none",
        }} />
        {/* fixed header block — never scrolls */}
        <div style={{ flexShrink:0, position:"relative", zIndex:1 }}>
          <button onClick={onBack} style={{
            width:34, height:34, borderRadius:11, background:T.card, border:`1px solid ${hair}`,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            boxShadow:"0 2px 6px rgba(27,21,48,0.05)", cursor:"pointer", padding:0,
            marginBottom:12,
          }}>
            <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
            <span style={{ fontFamily:F.mono, fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>Week View</span>
          </div>
          <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:T.inkH, letterSpacing:"-0.01em", lineHeight:1.1 }}>
            Timetable
          </h2>
          <button onClick={onEditTimetable} title="Edit timetable" style={{
            width:26, height:26, minWidth:26, borderRadius:8, border:"none", cursor:"pointer", flexShrink:0,
            background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center",
            marginTop:6, marginBottom:14,
          }}>
            <PenLine size={12} color={T.accent} strokeWidth={2} />
          </button>
        </div>

        {/* subject legend — 2-column grid keeps every subject visible without needing to scroll */}
        {legend.length > 0 && (
          <div style={{
            marginTop:"auto", display:"grid", gridTemplateColumns:"1fr 1fr", gap:6,
            position:"relative", zIndex:1, overflow:"visible",
          }}>
            {legend.map(s => (
              <div key={s.name} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 6px", borderRadius:8, background:"rgba(255,255,255,0.7)", minWidth:0 }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:s.color, boxShadow:`0 0 0 3px ${s.color}38`, flexShrink:0 }} />
                <span style={{ fontFamily:F.sans, fontSize:9.5, color:T.inkB, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main: time-axis grid ── */}
      <div ref={gridAreaRef} style={{ flex:1, display:"flex", flexDirection:"column", padding:"14px 16px 12px 14px", overflow:"auto", minWidth:0 }}>
        {/* time header (X-axis) */}
        <div style={{ display:"flex", marginBottom:4, flexShrink:0 }}>
          <div style={{ width:46, flexShrink:0 }} />
          <div style={{ position:"relative", height:16, width:gridWidth, flexShrink:0 }}>
            {hoursArr.map(h => (
              <span key={h} style={{
                position:"absolute", left:(h-HOUR_START)*hourWidth, transform:"translateX(-50%)",
                fontFamily:F.mono, fontSize:8.5, color:T.inkL, fontWeight:500,
              }}>{h}</span>
            ))}
          </div>
        </div>

        {/* body: day labels + rows */}
        <div style={{ flex:1, display:"flex" }}>
          {/* day labels */}
          <div style={{ width:46, flexShrink:0, display:"flex", flexDirection:"column" }}>
            {dates.map((d,i) => {
              const isToday = i === todayIdx;
              return (
                <div key={i} style={{ height:dayLayouts[i].height, display:"flex", flexDirection:"column", justifyContent:"center" }}>
                  <span style={{ fontFamily:F.mono, fontSize:8.5, letterSpacing:"0.08em", color:isToday?T.accent:T.inkL, fontWeight:500 }}>
                    {DAYS[i].toUpperCase()}
                  </span>
                  {isToday ? (
                    <span style={{
                      fontFamily:F.serif, fontWeight:600, fontSize:11, color:"#fff", background:T.accent,
                      width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                      marginTop:2, boxShadow:S.acc,
                    }}>{d.getDate()}</span>
                  ) : (
                    <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:14, color:T.inkH, marginTop:1 }}>{d.getDate()}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* fixed-width time-axis grid, exact reference pixel sizing */}
          <div style={{ width:gridWidth, flexShrink:0, position:"relative" }}>
            {/* vertical hour gridlines spanning all rows — skip the very first one
                (h===HOUR_START, left:0), since it sits right at the grid's own edge
                just after the day-label column and reads as a stray line rather
                than an actual divider between two columns */}
            <div style={{ position:"absolute", inset:0, height:totalGridHeight, pointerEvents:"none" }}>
              {hoursArr.filter(h => h !== HOUR_START).map(h => (
                <div key={h} style={{ position:"absolute", top:0, bottom:0, left:(h-HOUR_START)*hourWidth, width:1, background:hair }} />
              ))}
            </div>

            {dates.map((d,di) => {
              const isToday = di === todayIdx;
              const { laidOut, height: rowHeight, laneH } = dayLayouts[di];
              return (
                <div key={di} style={{
                  position:"relative", height:rowHeight,
                  borderTop:`1px solid ${hair}`,
                  borderBottom: di===dates.length-1 ? `1px solid ${hair}` : "none",
                  background: isToday ? "rgba(239,231,246,0.35)" : "transparent",
                }}>
                  {laidOut.map(({ slot, track, trackCount }) => {
                    const typeLabel = slot.type === "practical" ? "Lab" : slot.type === "tutorial" ? "Tut" : null;
                    const top = ROW_PAD + track*(laneH + LANE_GAP);
                    const color = subjectColor.get(slot.subjectId)!;
                    const w = widthFor(slot.startTime, slot.endTime);
                    return (
                    <button key={slot.id} onClick={() => onMark(slot.id)} style={{
                      position:"absolute", top, height:laneH,
                      left:leftFor(slot.startTime), width:w,
                      borderRadius:11, padding:"6px 7px", border:"none", cursor:"pointer",
                      background:"rgba(255,255,255,0.72)",
                      backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
                      borderLeft:`3px solid ${color}`,
                      boxShadow:"0 6px 16px -6px rgba(27,21,48,0.14), 0 1px 2px rgba(27,21,48,0.05)",
                      display:"flex", flexDirection:"column", justifyContent:"center", gap:2,
                      overflow:"hidden", textAlign:"left", zIndex:track+1,
                    }}>
                      <span style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:5, width:"100%", minWidth:0 }}>
                        <span style={{
                          fontFamily:F.serif, fontWeight:700, fontSize:11.5, color, lineHeight:1.2,
                          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", minWidth:0,
                        }}>
                          {slot.subject.name}
                        </span>
                        {typeLabel && (
                          <span style={{
                            fontFamily:F.mono, fontSize:8, fontWeight:700, letterSpacing:"0.02em",
                            color:"#fff", background:color, lineHeight:1.4,
                            borderRadius:999, padding:"1px 6px", flexShrink:0, textTransform:"uppercase",
                          }}>
                            {typeLabel}
                          </span>
                        )}
                      </span>
                      <span style={{ fontFamily:F.mono, fontSize:9.5, color:"#2E2E2E", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.25 }}>
                        {formatTimeRange(slot.startTime, slot.endTime, w)}
                      </span>
                      {slot.room && (
                        <span style={{ fontFamily:F.sans, fontSize:8.5, color:"#6B7280", fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.25 }}>
                          📍 {slot.room}
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
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

function Sparkline({ points, color }: { points:number[]; color:string }) {
  if (points.length < 2) return null;
  const w = 280, h = 56, pad = 4;
  const stepX = (w - pad*2) / (points.length - 1);
  const xy = (i:number, p:number) => [pad + i*stepX, pad + (h - pad*2) * (1 - p/100)] as const;
  const coords = points.map((p, i) => xy(i, p).join(",")).join(" ");
  const [lastX, lastY] = xy(points.length-1, points[points.length-1]);
  const [firstX, firstY] = xy(0, points[0]);
  // closed path along the baseline so the trend reads as a light filled area, not just a line —
  // a bit more visual weight than a bare sparkline while staying a single glanceable shape
  const areaPath = `M${firstX},${h-pad} L${coords.split(" ").join(" L")} L${lastX},${h-pad} Z`;
  const gradId = `sparkfill-${color.replace(/[^a-zA-Z0-9]/g,"")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <polyline points={coords} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={firstX} cy={firstY} r={2.5} fill={color} opacity={0.5} />
      <circle cx={lastX} cy={lastY} r={4} fill={color} />
    </svg>
  );
}

function SubjectDetailScreen({ subjectId, initialType, onBack, onMark, onEditTimetable }: {
  subjectId:string; initialType?:string|null; onBack:()=>void; onMark:(slotId:string)=>void; onEditTimetable:()=>void;
}) {
  const [data, setData] = useState<{subject:any; overall:any; breakdown:Record<string,any>}|null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [activeType, setActiveType] = useState<string|null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all"|Status>("all");
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const typeLabels: Record<string,string> = { lecture:"Theory", tutorial:"Tutorial", practical:"Lab" };

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
        // Honor the tab the user tapped from the dashboard (e.g. the "Lab"
        // card), falling back to the first available component otherwise.
        const preselect = initialType && statsRes.breakdown[initialType] ? initialType : null;
        setActiveType(preselect || Object.keys(statsRes.breakdown)[0] || "lecture");

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

  if (!data || !activeType) {
    return (
      <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", padding:"56px 24px" }}>
        <p style={{ color:T.inkM }}>Loading...</p>
      </div>
    );
  }

  const { subject, breakdown } = data;
  const typesPresent = Object.keys(breakdown);
  const stats = breakdown[activeType];

  const activeSlots = slots.filter(sl => (sl.type || "lecture") === activeType);
  const groupMap = new Map<string, { days:number[]; startTime:string; endTime:string; room:string|null }>();
  for (const sl of activeSlots) {
    const key = `${sl.startTime}-${sl.endTime}-${sl.room||""}`;
    if (!groupMap.has(key)) groupMap.set(key, { days:[], startTime:sl.startTime, endTime:sl.endTime, room:sl.room });
    groupMap.get(key)!.days.push(sl.day);
  }
  const scheduleLines = Array.from(groupMap.values()).map(g => {
    const dayStr = [...g.days].sort((a,b)=>a-b).map(d => DAYS[d]).join(" · ");
    return `${dayStr}, ${g.startTime}–${g.endTime}${g.room ? " · Room " + g.room : ""}`;
  });

  const activeHistory = history.filter(r => (r.slot?.type || "lecture") === activeType);
  const historyCounts = {
    all: activeHistory.length,
    present: activeHistory.filter(r => r.status === "present").length,
    absent: activeHistory.filter(r => r.status === "absent").length,
    cancelled: activeHistory.filter(r => r.status === "cancelled").length,
  };
  const filteredHistory = historyFilter === "all"
    ? activeHistory
    : activeHistory.filter(r => r.status === historyFilter);

  const held = [...activeHistory]
    .filter(r => r.status === "present" || r.status === "absent")
    .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Each class's weight in the running percentage is its duration in hours —
  // a 1-hour lecture is 1 unit, a 3-hour lab is 3 — matching how the backend
  // computes the actual attendance percentage, so this trend line never
  // disagrees with it for subjects with mixed-duration classes.
  function slotHours(slot: any) {
    if (!slot?.startTime || !slot?.endTime) return 1;
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const mins = (eh*60+em) - (sh*60+sm);
    return mins > 0 ? mins/60 : 1;
  }
  let presentHours = 0, heldHours = 0;
  const trendAll = held.map((r) => {
    const hrs = slotHours(r.slot);
    heldHours += hrs;
    if (r.status === "present") presentHours += hrs;
    return Math.round((presentHours / heldHours) * 100);
  });
  const trendPoints = trendAll.slice(-12);
  const trendDelta = trendPoints.length >= 2 ? trendPoints[trendPoints.length-1] - trendPoints[0] : 0;
  const trendColor = trendDelta >= 0 ? T.safe : T.danger;

  const isGood = stats.canMissMore > 0;
  const diff = Math.round(Math.abs(stats.percentage - stats.threshold));

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:108 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"56px 24px 0" }}>
        <button onClick={onBack} style={{
          width:34, height:34, borderRadius:11, background:T.card, border:`1px solid ${HAIR}`,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          boxShadow:"0 2px 6px rgba(27,21,48,0.05)", cursor:"pointer", padding:0,
        }}>
          <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
        </button>
        <span onClick={onBack} style={{ fontFamily:F.sans, fontWeight:600, fontSize:14, color:T.accent, cursor:"pointer" }}>Back</span>
      </div>

      <div style={{ padding:"18px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1, paddingRight:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:26, color:T.inkH, letterSpacing:"-0.01em" }}>{subject.name}</div>
            {/* Contextual label — same pill used for "Lab" on the timetable screen,
                sized up to actually read at a glance, colored with this subject's own
                dashboard color instead of the generic type color. */}
            {activeType === "practical" && (
              <span style={{
                fontFamily:F.mono, fontSize:9, fontWeight:700, letterSpacing:"0.08em",
                color:"#fff", background:"linear-gradient(155deg,#8E6BB8,#6E4F91)",
                boxShadow:"0 4px 10px rgba(110,79,145,0.3)",
                borderRadius:20, padding:"5px 11px", flexShrink:0, textTransform:"uppercase",
              }}>
                Lab
              </span>
            )}
          </div>
          {subject.code && (
            <div style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM, marginTop:3, letterSpacing:"0.04em" }}>{subject.code}</div>
          )}
          {/* Timings for the active type only, grouped under the label above as a compact
              list — one row per distinct slot, rather than one run-on sentence. */}
          {scheduleLines.length > 0 && (
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
              {scheduleLines.map((line, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <Clock size={10} color={T.accent} strokeWidth={2.2} style={{ flexShrink:0 }} />
                  <span style={{ fontFamily:F.mono, fontSize:10.5, color:T.accent, fontWeight:600 }}>{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10 }}>
          <Seal pct={Math.round(stats.percentage)} size={78} animate={true} label={stats.threshold !== 75 ? `${stats.threshold}% min` : "Overall"} tierColor={INK(stats.percentage)} />
          <button onClick={onEditTimetable} style={{
            display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:20,
            background:T.aFill, border:"none", cursor:"pointer",
            boxShadow:"0 4px 10px rgba(110,79,145,0.14)",
          }}>
            <Edit2 size={11} color={T.accent} />
            <span style={{ fontFamily:F.mono, fontSize:9.5, color:T.accent, fontWeight:600, letterSpacing:"0.04em" }}>EDIT</span>
          </button>
        </div>
      </div>

      {/* Theory / Lab switch — a segmented control, not two separate action buttons:
          one continuous track with a sliding indicator so it reads as "pick a view",
          not "trigger something". */}
      {typesPresent.length > 1 && (
        <div style={{
          display:"flex", gap:4, margin:"20px 24px 0", padding:4,
          borderRadius:16, background:T.aFill,
        }}>
          {typesPresent.map(type => {
            const on = activeType === type;
            return (
              <button key={type} onClick={() => { setActiveType(type); setHistoryFilter("all"); }} style={{
                flex:1, padding:10, borderRadius:12, textAlign:"center",
                border:"none", cursor:"pointer",
                background: on ? "linear-gradient(155deg,#8E6BB8,#6E4F91)" : "transparent",
                boxShadow: on ? "0 8px 18px rgba(110,79,145,0.35), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
                transition:"all 0.2s ease",
              }}>
                <span style={{
                  fontFamily:F.sans, fontWeight:700, fontSize:13.5,
                  color: on ? "#fff" : T.accent,
                }}>
                  {typeLabels[type]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display:"flex", gap:8, margin:"20px 24px 0" }}>
        {[
          { label:"Total",     v:stats.held,     c:T.inkH },
          { label:"Attended",  v:stats.attended, c:T.safe },
          { label:"Missed",    v:stats.missed,   c:T.danger },
          { label:"Cancelled", v:stats.cancelled,c:T.inkL },
        ].map(item => (
          <div key={item.label} style={{
            flex:1, background:T.card, borderRadius:16, padding:"13px 6px",
            textAlign:"center", boxShadow:"0 8px 20px rgba(27,21,48,0.07), 0 2px 6px rgba(27,21,48,0.03)", border:`1px solid ${HAIR}`,
          }}>
            <div style={{ fontFamily:F.serif, fontWeight:700, fontSize:19, color:item.c, lineHeight:1 }}>{item.v}</div>
            <div style={{ fontFamily:F.mono, fontSize:7.5, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.06em", marginTop:6, fontWeight:500 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Bunk calculator */}
      <div style={{
        margin:"18px 24px 0", borderRadius:22, padding:20,
        background: isGood
          ? "linear-gradient(155deg,#EEF7F2,#E3F3EA 65%)"
          : "linear-gradient(155deg,#FDF1EC,#FCE6E8 65%)",
        boxShadow: isGood
          ? "0 16px 36px rgba(47,122,92,0.12), 0 2px 8px rgba(47,122,92,0.05)"
          : "0 16px 36px rgba(176,58,69,0.14), 0 2px 8px rgba(176,58,69,0.06)",
        border: `1px solid ${isGood ? "rgba(47,122,92,0.12)" : "rgba(176,58,69,0.1)"}`,
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            <div style={{ width:4, height:4, borderRadius:"50%", background:GOLD }} />
            <span style={{ fontFamily:F.mono, fontSize:9.5, letterSpacing:"0.1em", textTransform:"uppercase", color:T.inkM, fontWeight:600, whiteSpace:"nowrap" }}>
              {typeLabels[activeType]} Recovery Plan
            </span>
          </div>
          <div style={{ padding:"5px 11px", borderRadius:20, background:"#fff", flexShrink:0, boxShadow:`0 4px 10px ${isGood?"rgba(47,122,92,0.15)":"rgba(176,58,69,0.15)"}` }}>
            <span style={{ fontFamily:F.sans, fontWeight:700, fontSize:12, color: isGood?T.safe:T.danger }}>{Math.round(stats.percentage)}%</span>
          </div>
        </div>

        {stats.impossible ? (
          <p style={{ fontFamily:F.sans, fontSize:13, color:T.danger, lineHeight:1.55, margin:"6px 0 16px", fontWeight:500 }}>
            Recovering to a {stats.threshold}% threshold isn't mathematically possible anymore after a missed class — consider lowering the threshold for this component.
          </p>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"baseline", gap:9 }}>
              <span style={{ fontFamily:F.serif, fontWeight:700, fontSize:44, color: isGood?T.safe:T.danger, lineHeight:1 }}>{isGood ? 0 : stats.needToAttend}</span>
              <span style={{ fontFamily:F.sans, fontSize:15, color:T.inkM, fontWeight:500 }}>classes needed</span>
            </div>

            <p style={{ fontFamily:F.sans, fontSize:13, color:T.inkM, lineHeight:1.55, margin:"10px 0 16px" }}>
              {isGood
                ? <>You're on track — no makeup classes required to stay above the <b style={{ color:T.inkB, fontWeight:600 }}>{stats.threshold}%</b> threshold.</>
                : <>Attend the next <b style={{ color:T.inkB, fontWeight:600 }}>{stats.needToAttend}</b> {typeLabels[activeType].toLowerCase()} class{stats.needToAttend!==1?"es":""} in a row to recover to <b style={{ color:T.inkB, fontWeight:600 }}>{stats.threshold}%</b>.</>
              }
            </p>
          </>
        )}

        <div style={{ display:"flex", gap:10, padding:"13px 14px", borderRadius:14, background:"#fff", alignItems:"flex-start", boxShadow:`0 4px 12px ${isGood?"rgba(47,122,92,0.1)":"rgba(176,58,69,0.1)"}` }}>
          {isGood
            ? <Check size={15} color={T.safe} strokeWidth={2.2} style={{ flexShrink:0, marginTop:1 }} />
            : <AlertCircle size={15} color={T.danger} strokeWidth={2.2} style={{ flexShrink:0, marginTop:1 }} />
          }
          <span style={{ fontFamily:F.sans, fontSize:12.5, fontWeight:600, color: isGood?T.safe:T.danger, lineHeight:1.4 }}>
            Currently at {Math.round(stats.percentage)}% — {diff}pp {isGood?"above":"below"} threshold
          </span>
        </div>
      </div>

      {/* Trend */}
      {trendPoints.length >= 2 && (
        <div style={{ margin:"18px 24px 0", background:T.card, borderRadius:22, padding:20, boxShadow:"0 14px 32px rgba(27,21,48,0.09), 0 2px 8px rgba(27,21,48,0.04)", border:`1px solid ${HAIR}` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <span style={{ fontFamily:F.sans, fontWeight:700, fontSize:13.5, color:T.inkH }}>
                Attendance Trend
              </span>
              <div style={{ fontFamily:F.mono, fontSize:9.5, color:T.inkM, marginTop:3 }}>
                Last {trendPoints.length} {typeLabels[activeType].toLowerCase()} classes
              </div>
            </div>
            <span style={{ fontFamily:F.sans, fontWeight:700, fontSize:12, color:trendColor }}>
              {trendDelta >= 0 ? "+" : ""}{trendDelta}pp
            </span>
          </div>
          <Sparkline points={trendPoints} color={trendColor} />
        </div>
      )}

      {/* History */}
      <div style={{ margin:"26px 24px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:13 }}>
          <div style={{ width:4, height:4, borderRadius:"50%", background:GOLD }} />
          <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>
            {typeLabels[activeType]} History
          </span>
        </div>

        {/* Filter chips — same rounded-pill / purple-accent language as the rest of the app.
            Purely client-side: swaps which records render, no refetch. */}
        <div style={{ display:"flex", gap:7, marginBottom:14, overflowX:"auto" }}>
          {([
            { key:"all",       label:"All" },
            { key:"present",   label:"Present" },
            { key:"absent",    label:"Absent" },
            { key:"cancelled", label:"Cancelled" },
          ] as const).map(({ key, label }) => {
            const on = historyFilter === key;
            return (
              <button key={key} onClick={() => setHistoryFilter(key)} style={{
                padding:"8px 13px", borderRadius:20, flexShrink:0,
                border: on ? "1.5px solid transparent" : `1.5px solid ${HAIR}`,
                background: on ? "linear-gradient(155deg,#8E6BB8,#6E4F91)" : T.card,
                display:"flex", alignItems:"center", gap:5,
                fontFamily:F.sans, fontSize:12, fontWeight:700, cursor:"pointer",
                boxShadow: on ? "0 6px 14px rgba(110,79,145,0.32)" : "none",
                transition:"all 0.18s ease",
              }}>
                <span style={{ color: on ? "#fff" : T.inkM }}>{label}</span>
                <span style={{ fontFamily:F.mono, fontSize:9.5, color: on ? "rgba(255,255,255,0.75)" : T.inkL }}>{historyCounts[key]}</span>
              </button>
            );
          })}
        </div>

        {filteredHistory.length === 0 && (
          <div style={{ padding:20, borderRadius:18, background:T.card, border:`1.5px dashed ${HAIR}`, textAlign:"center" }}>
            <span style={{ fontFamily:F.serif, fontStyle:"italic", fontWeight:500, fontSize:14, color:T.inkL }}>
              {historyFilter === "all" ? "No records yet." : `No ${historyFilter} records.`}
            </span>
          </div>
        )}
        {filteredHistory.map((rec, i) => (
          <div key={rec.id} className={`ae${Math.min(i+1,5)}`} style={{
            display:"flex", justifyContent:"space-between", alignItems:"center",
            background:T.card, borderRadius:17, padding:"14px 16px", marginBottom:9,
            boxShadow:"0 6px 16px rgba(27,21,48,0.06), 0 1px 3px rgba(27,21,48,0.03)", border:`1px solid ${HAIR}`,
          }}>
            <div>
              <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:14.5, color:T.inkH }}>
                {new Date(rec.date).toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" })}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:5, flexWrap:"wrap" }}>
                {rec.slot?.startTime && <span style={{ fontFamily:F.mono, fontSize:10, color:T.inkM }}>{rec.slot.startTime}</span>}
                {rec.slot?.room && <span style={{ padding:"2px 8px", borderRadius:8, background:T.aFill, fontFamily:F.mono, fontSize:8.5, color:T.accent, fontWeight:600 }}>{rec.slot.room}</span>}
                {rec.tag && <span style={{ padding:"2px 8px", borderRadius:8, background:T.warnFill, fontFamily:F.mono, fontSize:8.5, color:T.warn, fontWeight:600 }}>{rec.tag}</span>}
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
function AttendanceSheet({ slotId, date, initialRecord, onClose, onSaved }: {
  slotId:string|null; date?:string; initialRecord?: { status:Status; note?:string|null; tag?:string|null } | null;
  onClose:()=>void; onSaved:()=>void;
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

  const todayStr = new Date().toISOString().slice(0,10);
  const targetDate = date || todayStr;
  const isFutureDate = targetDate > todayStr;

  useEffect(() => {
    if (!slotId) return;
    setSel(initialRecord?.status ?? null);
    setCTag(initialRecord?.tag ? initialRecord.tag.split("_").map(w => w[0].toUpperCase()+w.slice(1)).join(" ") : null);
    setNote(initialRecord?.note ?? "");
    setVisible(false);
    setSlotInfo(null);
    requestAnimationFrame(() => setVisible(true));

    (async () => {
      try {
        const { slot } = await api.get(`/slots/${slotId}`);
        setSlotInfo(slot);
        setRDate(targetDate);
        setRStart(slot.startTime);
        setREnd(slot.endTime);
        setRRoom(slot.room || "");
      } catch (e) {
        console.error(e);
      }
    })();
  }, [slotId, date]);

  if (!slotId) return null;

  const TAGS = ["Holiday","Prof Absent","Exam","Other"];
  const ALL_OPTS: { s:Status; desc:string; icon:React.ReactNode }[] = [
    { s:"present",     desc:"I attended this class",     icon:<Check size={18}/> },
    { s:"absent",      desc:"I missed this class",        icon:<X size={18}/> },
    { s:"cancelled",   desc:"Class was called off",       icon:<Ban size={18}/> },
    { s:"rescheduled", desc:"Moving to another time",     icon:<RotateCcw size={18}/> },
  ];
  // A class that hasn't happened yet can only be pre-marked as cancelled or
  // rescheduled — "I attended" / "I missed" don't make sense ahead of time.
  const OPTS = isFutureDate ? ALL_OPTS.filter(o => o.s === "cancelled" || o.s === "rescheduled") : ALL_OPTS;

  async function handleSave() {
    if (!sel || !slotId) return;
    setSaving(true);
    try {
      const slotType = slotInfo?.type || "lecture";
      let beforeStats: any = null;
      if (sel === "present" && slotInfo) {
        const { breakdown } = await api.get(`/records/stats/subject/${slotInfo.subjectId}`);
        beforeStats = breakdown[slotType];
      }

      await api.post("/records/mark", {
        slotId, date: targetDate, status: sel,
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

      if (beforeStats && slotInfo) {
        const { subject: subj, breakdown } = await api.get(`/records/stats/subject/${slotInfo.subjectId}`);
        const afterStats = breakdown[slotType];
        const threshold = slotType === "tutorial" ? subj.thresholdTutorial : slotType === "practical" ? subj.thresholdPractical : subj.thresholdLecture;
        if (afterStats && beforeStats.percentage < threshold && afterStats.percentage >= threshold) {
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
              <span style={{ fontFamily:F.mono, fontSize:11, color:T.inkM }}>
                {targetDate === todayStr ? "Today" : new Date(targetDate + "T12:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short" })} · {slotInfo.startTime}–{slotInfo.endTime}
              </span>
              {slotInfo.room && <span style={{ fontFamily:F.mono, fontSize:10, color:T.accent, background:T.aFill, padding:"2px 9px", borderRadius:7 }}>{slotInfo.room}</span>}
            </div>
          )}
        </div>

        <div style={{ padding:"18px 24px 0", maxHeight:"65vh", overflowY:"auto" }}>
          {OPTS.map(({ s, desc, icon }) => {
            const { text, bg, label } = statusMeta(s);
            const on = sel===s;

            if (s === "rescheduled" && on) {
              const rInputStyle: React.CSSProperties = {
                width:"100%", padding:"12px 13px", borderRadius:13, border:"1.5px solid rgba(255,255,255,0.7)",
                background:"rgba(255,255,255,0.75)", fontFamily:F.sans, fontSize:13.5, color:T.inkH,
                outline:"none", boxSizing:"border-box", appearance:"none", WebkitAppearance:"none",
              };
              const rDateLabel = rDate ? new Date(rDate + "T12:00:00").toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "Pick date";
              return (
                <div key={s} style={{
                  borderRadius:18, padding:16, marginBottom:9,
                  background:"linear-gradient(155deg,#FBF1DC,#F7EAC8)",
                  border:"1.5px solid #E8CE8F",
                  boxShadow:"0 10px 24px rgba(201,162,75,0.18)",
                  animation:"ae0 0.24s ease both",
                }}>
                  <button onClick={() => { setSel(s); setCTag(null); }} style={{
                    width:"100%", background:"none", border:"none", padding:0, cursor:"pointer",
                    display:"flex", alignItems:"center", gap:12, textAlign:"left",
                  }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:"rgba(255,255,255,0.6)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <RotateCcw size={17} color="#9C7A2E" />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16.5, color:"#9C7A2E" }}>Rescheduled</div>
                      <div style={{ fontFamily:F.sans, fontSize:12, color:"#A6863F", marginTop:2 }}>Moving to another time</div>
                    </div>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:"#C9A24B", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 10px rgba(201,162,75,0.4)" }}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </div>
                  </button>

                  <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid rgba(201,162,75,0.28)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                      <span style={{ width:4, height:4, borderRadius:"50%", background:"#9C7A2E", flexShrink:0 }} />
                      <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:"#9C7A2E", fontWeight:600 }}>Moving to</span>
                    </div>

                    <div style={{ display:"flex", gap:9, marginBottom:9 }}>
                      <div style={{ flex:1, minWidth:0, position:"relative" }}>
                        <div style={{ ...rInputStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rDateLabel}</span>
                          <CalendarDays size={14} color="#9C7A2E" style={{ flexShrink:0 }} />
                        </div>
                        <input type="date" value={rDate} onChange={e => setRDate(e.target.value)}
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer" }} />
                      </div>
                      <div style={{ flex:0.75, position:"relative" }}>
                        <div style={{ ...rInputStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                          <span>{rStart}</span>
                          <Clock size={14} color="#9C7A2E" style={{ flexShrink:0 }} />
                        </div>
                        <input type="time" value={rStart} onChange={e => setRStart(e.target.value)}
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer" }} />
                      </div>
                      <div style={{ flex:0.75, position:"relative" }}>
                        <div style={{ ...rInputStyle, display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                          <span>{rEnd}</span>
                          <Clock size={14} color="#9C7A2E" style={{ flexShrink:0 }} />
                        </div>
                        <input type="time" value={rEnd} onChange={e => setREnd(e.target.value)}
                          style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer" }} />
                      </div>
                    </div>

                    <input placeholder="Room (optional)" value={rRoom} onChange={e => setRRoom(e.target.value)} style={rInputStyle} />
                  </div>
                </div>
              );
            }

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
              background: sel ? "linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)" : "rgba(110,79,145,0.12)",
              color: sel ? "#fff" : T.inkM,
              fontFamily:F.sans, fontSize:16, fontWeight:700,
              cursor: sel ? "pointer" : "not-allowed",
              marginTop:14, marginBottom:10,
              boxShadow: sel ? "0 14px 28px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
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
  const [days, setDays] = useState<{date:string; color:{bg:string;fg:string}; classCount:number; present:number; absent:number}[]>([]);
  const [allSlots, setAllSlots] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [expRecs, setExpRecs] = useState<any[]>([]);
  const [expRecsDate, setExpRecsDate] = useState<string|null>(null);
  const [backfillBusy, setBackfillBusy] = useState<string|null>(null);
  const [sheetSlotId, setSheetSlotId] = useState<string|null>(null);

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

  useEffect(() => {
    if (!semesterId) return;
    (async () => {
      const { slots } = await api.get(`/slots?semesterId=${semesterId}`);
      setAllSlots(slots);
    })();
  }, [semesterId]);

  async function openDay(dateStr: string) {
    if (expanded === dateStr) { setExpanded(null); return; }
    setExpanded(dateStr);
    setExpRecsDate(null); // mark as "loading" so stale records from the previous day don't flash
    if (!semesterId) return;
    const { records } = await api.get(`/records/day?semesterId=${semesterId}&date=${dateStr}`);
    setExpRecs(records);
    setExpRecsDate(dateStr);
  }

  async function refreshDay(dateStr: string) {
    if (!semesterId) return;
    const [{ records }, { days: fetched }] = await Promise.all([
      api.get(`/records/day?semesterId=${semesterId}&date=${dateStr}`),
      api.get(`/records/calendar?semesterId=${semesterId}&year=${year}&month=${month}`),
    ]);
    setExpRecs(records);
    setExpRecsDate(dateStr);
    setDays(fetched);
  }

  async function backfillMark(slotId: string, status: Status, dateStr: string) {
    if (!semesterId) return;
    setBackfillBusy(slotId);
    try {
      await api.post("/records/mark", { slotId, date: dateStr, status });
      await refreshDay(dateStr);
    } catch (e) {
      console.error(e);
    } finally {
      setBackfillBusy(null);
    }
  }

  function slotsForDate(dateStr: string) {
    const weekday = (new Date(dateStr + "T12:00:00").getDay() + 6) % 7;
    let list = allSlots.filter((s:any) =>
      (!s.isExtra && s.day === weekday) ||
      (s.isExtra && s.extraDate && String(s.extraDate).slice(0,10) === dateStr)
    );
    const replaced = new Set(list.filter((s:any) => s.isExtra && s.replacesSlotId).map((s:any) => s.replacesSlotId));
    return list.filter((s:any) => !replaced.has(s.id)).sort((a:any,b:any) => a.startTime.localeCompare(b.startTime));
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

  const expLoading = expanded !== null && expRecsDate !== expanded;
  const expandedClasses = (expanded && !expLoading) ? slotsForDate(expanded).map(slot => ({
    slot, rec: expRecs.find((r:any) => r.slotId === slot.id) || null,
  })) : [];
  const canBackfill = expanded ? expanded <= todayStr : false;

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"52px 24px 0" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div className="ae0" style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
              <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
              <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>
                Attendance History
              </span>
            </div>
            <h2 className="ae1" style={{ fontFamily:F.serif, fontWeight:600, fontSize:26, color:T.inkH, letterSpacing:"-0.01em" }}>
              {monthLabel}
            </h2>
          </div>
          <div className="ae1" style={{ display:"flex", gap:8 }}>
            <button onClick={prevMonth} style={{
              width:34, height:34, borderRadius:11, background:T.card, border:`1px solid #EFEAF6`,
              display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
              boxShadow:"0 2px 6px rgba(27,21,48,0.05)",
            }}><ChevronLeft size={14} color={T.accent} strokeWidth={2.4} /></button>
            <button onClick={nextMonth} style={{
              width:34, height:34, borderRadius:11, background:T.card, border:`1px solid #EFEAF6`,
              display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
              boxShadow:"0 2px 6px rgba(27,21,48,0.05)",
            }}><ChevronRight size={14} color={T.accent} strokeWidth={2.4} /></button>
          </div>
        </div>
      </div>

      <div className="ae2" style={{ display:"flex", gap:8, padding:"16px 24px 4px", flexWrap:"wrap" }}>
        {[
          { c:"#2F7A5C", l:"All present" },
          { c:"#C9A24B", l:"Partial" },
          { c:"#B03A45", l:"Absent" },
          { c:"#BAB4C4", l:"Cancelled" },
        ].map(item => (
          <div key={item.l} style={{
            display:"flex", alignItems:"center", gap:6, padding:"5px 11px", borderRadius:20,
            background:T.card, border:"1px solid #EFEAF6",
          }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:item.c, flexShrink:0 }} />
            <span style={{ fontFamily:F.mono, fontSize:9, color:T.inkM, fontWeight:500 }}>{item.l}</span>
          </div>
        ))}
      </div>

      <div className="ae3" style={{ padding:"18px 20px 0" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:10 }}>
          {["M","T","W","T","F","S","S"].map((d,i) => (
            <span key={i} style={{
              textAlign:"center", fontFamily:F.mono, fontSize:10, fontWeight:600,
              color: i>=5 ? "#C9A24B" : T.inkL,
            }}>{d}</span>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", rowGap:6 }}>
          {Array.from({ length:firstWeekday }, (_,i) => <div key={`e${i}`} style={{ aspectRatio:"1", height:41 }} />)}
          {Array.from({ length:daysInMonth }, (_,i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const entry = dayMap.get(dateStr);
            const isToday = dateStr === todayStr;
            const isSel = expanded === dateStr;
            const { bg, fg } = entry ? entry.color : { bg: "transparent", fg: T.inkL };
            return (
              <button key={day}
                onClick={() => openDay(dateStr)}
                style={{
                  width:41, height:41, margin:"0 auto", borderRadius:13,
                  border: isToday && !isSel ? `2px solid ${T.accent}` : "none",
                  background: isSel ? T.accent : (bg || "rgba(110,79,145,0.028)"),
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer", outline:"none",
                  boxShadow: isSel ? "0 8px 18px rgba(110,79,145,0.4)" : "none",
                  transition:"transform 0.15s ease",
                }}
              >
                <span style={{
                  fontFamily:F.sans, fontWeight:600, fontSize:13.5,
                  color: isSel ? "#fff" : (isToday ? T.accent : fg),
                }}>{day}</span>
              </button>
            );
          })}
        </div>

        {expanded && (
          <div style={{
            margin:"22px 0 0", background:T.card, borderRadius:22, padding:"20px 20px 18px",
            boxShadow:"0 16px 36px rgba(27,21,48,0.12), 0 4px 12px rgba(27,21,48,0.06)",
            border:"1px solid #EFEAF6",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ fontFamily:F.mono, fontSize:10.5, letterSpacing:"0.1em", textTransform:"uppercase", color:T.accent, fontWeight:600 }}>
                  {new Date(expanded + "T12:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"long" })}
                </span>
                <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
              </div>
              <button onClick={() => setExpanded(null)} style={{
                width:26, height:26, borderRadius:8, border:"none", cursor:"pointer",
                background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center",
              }}><X size={12} color={T.accent} strokeWidth={2.3} /></button>
            </div>

            {expLoading ? (
              <p style={{ fontSize:13, color:T.inkL, fontStyle:"italic" }}>Loading...</p>
            ) : expandedClasses.length === 0 ? (
              <p style={{ fontSize:14, color:T.inkM, fontStyle:"italic" }}>No classes on this day.</p>
            ) : expandedClasses.map(({ slot, rec }, i) => (
              <div key={slot.id} style={{
                padding:"13px 0",
                borderTop: i>0 ? "1px solid #EFEAF6" : "none",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: rec ? 0 : 11 }}>
                  <div>
                    <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15, color:T.inkH }}>{slot.subject.name}</div>
                    <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, marginTop:2 }}>
                      {slot.startTime}–{slot.endTime}{slot.room ? ` · ${slot.room}` : ""}
                    </div>
                  </div>
                  {rec ? (
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{
                        padding:"5px 12px", borderRadius:100, fontFamily:F.sans, fontWeight:700, fontSize:11,
                        display:"inline-flex", alignItems:"center", gap:5,
                        background:statusMeta(rec.status).bg, color:statusMeta(rec.status).text,
                      }}>
                        {rec.status==="present" && <Check size={9} strokeWidth={3} />}
                        {statusMeta(rec.status).label}
                      </span>
                      <button
                        onClick={() => setSheetSlotId(slot.id)}
                        title="Edit"
                        aria-label="Edit"
                        style={{ width:26, height:26, borderRadius:8, flexShrink:0, border:"none", background:T.aFill, color:T.accent, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                      ><PenLine size={12.5} strokeWidth={2} /></button>
                    </div>
                  ) : canBackfill ? (
                    <button
                      onClick={() => setSheetSlotId(slot.id)}
                      title="Add note"
                      aria-label="Add note"
                      style={{ width:26, height:26, borderRadius:8, flexShrink:0, border:"none", background:T.aFill, color:T.accent, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                    ><PenLine size={12.5} strokeWidth={2} /></button>
                  ) : null}
                </div>

                {rec?.note && (
                  <p style={{ fontSize:11.5, color:T.inkM, fontStyle:"italic", margin:"3px 0 0" }}>“{rec.note}”</p>
                )}

                {!rec && (
                  canBackfill ? (
                    <>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:9 }}>
                        <span style={{ fontFamily:F.mono, fontSize:9, color:"#C9A24B", fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase" }}>
                          ⚠ not marked yet
                        </span>
                      </div>
                      <div style={{ display:"flex", gap:7 }}>
                        {(["present","absent"] as Status[]).map(s => {
                          const { text, bg, label } = statusMeta(s);
                          return (
                            <button key={s}
                              disabled={backfillBusy===slot.id}
                              onClick={() => backfillMark(slot.id, s, expanded!)}
                              style={{
                                flex:1, padding:"7px 6px", borderRadius:10,
                                border:`1.5px solid ${text}2e`, background:bg, color:text,
                                fontFamily:F.sans, fontWeight:600, fontSize:11.5, cursor:"pointer",
                                display:"flex", alignItems:"center", justifyContent:"center", gap:4,
                              }}
                            >
                              {s==="present" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                              {label}
                            </button>
                          );
                        })}
                        <button
                          disabled={backfillBusy===slot.id}
                          onClick={() => backfillMark(slot.id, "cancelled", expanded!)}
                          style={{
                            flex:1, padding:"7px 6px", borderRadius:10,
                            border:"1.5px solid rgba(138,129,148,0.12)", background:T.cancelFill, color:T.inkM,
                            fontFamily:F.sans, fontWeight:600, fontSize:11.5, cursor:"pointer",
                          }}
                        >Cancelled</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <p style={{ fontSize:12, color:T.inkL, fontStyle:"italic", margin:0 }}>Upcoming class</p>
                      <button onClick={() => setSheetSlotId(slot.id)} style={{ fontFamily:F.sans, fontSize:10.5, fontWeight:600, color:T.accent, background:"none", border:"none", cursor:"pointer" }}>
                        Plan ahead
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AttendanceSheet
        slotId={sheetSlotId}
        date={expanded || undefined}
        initialRecord={expRecs.find((r:any) => r.slotId === sheetSlotId) || null}
        onClose={() => setSheetSlotId(null)}
        onSaved={() => { setSheetSlotId(null); if (expanded) refreshDay(expanded); }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREEN 7 — SEMESTER MANAGEMENT
// ════════════════════════════════════════════════════════════════
function SemesterScreen({ onStartNew, onBack }: { onStartNew: () => void; onBack: () => void }) {
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
      const { overall, subjects } = await api.get(`/records/stats/overview?semesterId=${sem.id}`);
      setExpandStats(prev => ({ ...prev, [sem.id]: { overall, subjects } }));
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
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"56px 24px 0" }}>
        <button onClick={onBack} style={{
          width:34, height:34, borderRadius:11, background:T.card, border:`1px solid ${HAIR}`,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          boxShadow:"0 2px 6px rgba(27,21,48,0.05)", cursor:"pointer", padding:0,
        }}>
          <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
        </button>
        <span onClick={onBack} style={{ fontFamily:F.sans, fontWeight:600, fontSize:14, color:T.accent, cursor:"pointer" }}>Back</span>
      </div>
      <div style={{ padding:"18px 24px 20px" }}>
        <div style={{ marginBottom:9 }}><Eyebrow>SEMESTER MANAGEMENT</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Semesters</h2>
      </div>

      {current && (
        <div style={{ margin:"0 24px 28px" }}>
          <div style={{
            background:"linear-gradient(160deg,#8A66B4 0%,#5A3D78 60%,#3C2757 100%)",
            borderRadius:26, padding:"24px 22px",
            boxShadow:"0 20px 44px rgba(58,38,80,0.4), 0 6px 16px rgba(58,38,80,0.22), inset 0 1px 0 rgba(255,255,255,0.15)",
            position:"relative", overflow:"hidden",
          }}>
            <div style={{ position:"absolute", top:-40, right:-40, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.08)", pointerEvents:"none" }} />

            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", position:"relative" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:9 }}>
                  <div style={{ width:4, height:4, borderRadius:"50%", background:GOLD }} />
                  <span style={{ fontFamily:F.mono, fontSize:9.5, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(255,255,255,0.7)", fontWeight:500 }}>Current</span>
                </div>
                <h3 style={{ fontFamily:F.serif, fontWeight:600, fontSize:25, color:"#fff", lineHeight:1.1, letterSpacing:"-0.01em", margin:0 }}>{current.semester.name}</h3>
              </div>
              <Seal pct={Math.round(current.overall.percentage)} size={64} animate label="" />
            </div>

            <div style={{ display:"flex", gap:9, marginTop:20, position:"relative" }}>
              {[{l:"Subjects",v:current.subjectCount},{l:"Attended",v:current.overall.attended},{l:"Total",v:current.overall.held}].map(item => (
                <div key={item.l} style={{ flex:1, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:15, padding:"12px 8px", textAlign:"center" }}>
                  <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:19, color:"#fff" }}>{item.v}</div>
                  <div style={{ fontFamily:F.mono, fontSize:8, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", letterSpacing:"0.07em", marginTop:4, fontWeight:500 }}>{item.l}</div>
                </div>
              ))}
            </div>

            <button onClick={() => setConfirm(true)} style={{
              marginTop:14, width:"100%", padding:13, borderRadius:15, border:"1px solid rgba(255,255,255,0.18)",
              background:"rgba(255,255,255,0.14)", color:"#fff",
              fontFamily:F.sans, fontSize:13, fontWeight:700, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8, position:"relative",
            }}>
              <Archive size={14} /> Archive & start new semester
            </button>
          </div>
        </div>
      )}

      <div style={{ padding:"0 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
          <div style={{ width:4, height:4, borderRadius:"50%", background:GOLD }} />
          <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>Archived Semesters</span>
        </div>
        {archived.length === 0 && (
          <div style={{ padding:20, borderRadius:18, background:T.card, border:`1.5px dashed ${HAIR}`, textAlign:"center" }}>
            <span style={{ fontFamily:F.serif, fontStyle:"italic", fontWeight:500, fontSize:14, color:T.inkL }}>No archived semesters yet.</span>
          </div>
        )}
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
                    <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:24, color:stats.overall.percentage>=75?T.safe:T.danger }}>{Math.round(stats.overall.percentage)}%</div>
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
                      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
                        {[
                          { l:"Attended",  v:stats.overall.attended,  c:T.inkH },
                          { l:"Missed",    v:stats.overall.missed,    c:T.danger },
                          { l:"Cancelled", v:stats.overall.cancelled, c:T.inkM },
                          { l:"Total",     v:stats.overall.held,      c:T.inkH },
                        ].map(item=>(
                          <div key={item.l} style={{ flex:1, background:T.bg, borderRadius:13, padding:"10px 6px", textAlign:"center" }}>
                            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:17, color:item.c }}>{item.v}</div>
                            <div style={{ fontFamily:F.mono, fontSize:7, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.06em", marginTop:3 }}>{item.l}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginBottom:10 }}>
                        <span style={{ fontFamily:F.mono, fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:T.inkM, fontWeight:600 }}>Subject-wise</span>
                      </div>
                      {stats.subjects.length === 0 ? (
                        <p style={{ fontSize:12, color:T.inkL, fontStyle:"italic", marginBottom:12 }}>No subjects recorded.</p>
                      ) : stats.subjects.map(({ subject, stats: subjStats }: any) => (
                        <div key={subject.id} style={{
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"9px 10px", borderRadius:11, background:T.bg, marginBottom:6,
                        }}>
                          <span style={{ fontFamily:F.sans, fontSize:12.5, color:T.inkH, fontWeight:500 }}>{subject.name}</span>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontFamily:F.mono, fontSize:9.5, color:T.inkL }}>{subjStats.attended}/{subjStats.held}</span>
                            <span style={{
                              fontFamily:F.sans, fontSize:12, fontWeight:700,
                              color: subjStats.percentage >= 75 ? T.safe : T.danger,
                            }}>{Math.round(subjStats.percentage)}%</span>
                          </div>
                        </div>
                      ))}

                      <div style={{ marginTop:10, padding:"10px 14px", background:T.aFill, borderRadius:12, display:"flex", alignItems:"center", gap:8 }}>
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
          <div className="ae-backdrop" onClick={()=>!starting && setConfirm(false)} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.52)", backdropFilter:"blur(6px)", zIndex:50 }} />
          <div className="ae-modal" style={{
            position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:"calc(100% - 48px)", maxWidth:320,
            background:T.card, borderRadius:24, padding:"26px 24px 22px",
            boxShadow:"0 30px 70px rgba(15,8,28,0.4), 0 10px 24px rgba(15,8,28,0.2), inset 0 1px 0 #fff",
            zIndex:51,
          }}>
            <div style={{ width:48, height:48, borderRadius:15, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, boxShadow:"0 8px 18px rgba(110,79,145,0.18)" }}>
              <Archive size={21} color={T.accent} strokeWidth={2} />
            </div>
            <h3 style={{ fontFamily:F.serif, fontWeight:700, fontSize:21, color:T.inkH, letterSpacing:"-0.01em", marginBottom:9 }}>Archive this semester?</h3>
            <p style={{ fontSize:14, color:T.inkM, lineHeight:1.55, marginBottom:22 }}>
              <b style={{ color:T.inkB, fontWeight:600 }}>{current?.semester.name}</b> will be archived. All attendance records will be preserved in read-only mode.
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirm(false)} disabled={starting} style={{ flex:1, padding:14, borderRadius:14, border:"1.5px solid #EFEAF6", background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={confirmStartNew} disabled={starting} style={{
                flex:1, padding:14, borderRadius:14, border:"none", cursor:"pointer",
                background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
                fontFamily:F.sans, fontWeight:700, fontSize:14,
                boxShadow:"0 14px 28px rgba(94,63,138,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
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
  const [subjects, setSubjects] = useState<{id:string; name:string; color:string; hasLecture:boolean; hasTutorial:boolean; hasPractical:boolean; thresholdLecture:number; thresholdTutorial:number; thresholdPractical:number}[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTypes, setNewTypes] = useState<Record<ClassType, boolean>>({ lecture:false, tutorial:false, practical:false });
  const [newThresholds, setNewThresholds] = useState<Record<ClassType, string>>({ lecture:"75", tutorial:"75", practical:"75" });
  const [loading, setLoading] = useState(false);
  const [addError, setAddError] = useState<string|null>(null);
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

  function resetAddForm() {
    setNewName("");
    setNewTypes({ lecture:false, tutorial:false, practical:false });
    setNewThresholds({ lecture:"75", tutorial:"75", practical:"75" });
    setAddError(null);
  }

  async function addSubject() {
    setAddError(null);
    if (!newName.trim() || !semesterId) { setAddError("Subject name is required."); return; }
    const selected = TYPE_ORDER.filter(t => newTypes[t]);
    if (!selected.length) { setAddError("Select at least one class type."); return; }
    for (const t of selected) {
      const raw = newThresholds[t].trim();
      const n = parseInt(raw, 10);
      if (raw === "" || isNaN(n) || n < 0 || n > 100) {
        setAddError(`${t[0].toUpperCase()+t.slice(1)} threshold must be between 0–100%.`);
        return;
      }
    }
    setLoading(true);
    try {
      const color = PALETTE[subjects.length % PALETTE.length];
      const body: any = {
        semesterId, name: newName.trim(), color,
        hasLecture: selected.includes("lecture"),
        hasTutorial: selected.includes("tutorial"),
        hasPractical: selected.includes("practical"),
      };
      if (selected.includes("lecture"))   body.thresholdLecture   = parseInt(newThresholds.lecture, 10);
      if (selected.includes("tutorial"))  body.thresholdTutorial  = parseInt(newThresholds.tutorial, 10);
      if (selected.includes("practical")) body.thresholdPractical = parseInt(newThresholds.practical, 10);

      const { subject } = await api.post("/subjects", body);
      setSubjects(prev => [...prev, subject]);
      resetAddForm();
      setAdding(false);
    } catch (e: any) {
      setAddError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"56px 24px 0" }}>
        <button onClick={onBack} style={{
          width:34, height:34, borderRadius:11, background:T.card, border:`1px solid ${HAIR}`,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          boxShadow:"0 2px 6px rgba(27,21,48,0.05)", cursor:"pointer", padding:0,
        }}>
          <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
        </button>
        <span onClick={onBack} style={{ fontFamily:F.sans, fontWeight:600, fontSize:14, color:T.accent, cursor:"pointer" }}>Back</span>
      </div>
      <div style={{ padding:"18px 24px 20px" }}>
        <div style={{ marginBottom:9 }}><Eyebrow>SUBJECTS & TIMETABLE</Eyebrow></div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:27, color:T.inkH }}>Edit Timetable</h2>
      </div>

      <div style={{ padding:"0 24px" }}>
        {semesterId && subjects.map((s, i) => (
          <SubjectSlotRow
            key={s.id} subject={s} index={i} semesterId={semesterId}
            onRenamed={(id, newName) => setSubjects(prev => prev.map(sub => sub.id === id ? { ...sub, name: newName } : sub))}
            onDeleted={(id) => setSubjects(prev => prev.filter(sub => sub.id !== id))}
          />
        ))}

        {adding ? (
          <div style={{ padding:"18px", borderRadius:18, marginBottom:10, background:T.card, boxShadow:S.sm, border:`1px solid rgba(110,79,145,0.07)` }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)} placeholder="Subject name"
              style={{ width:"100%", padding:"12px 14px", borderRadius:12, marginBottom:14, border:`1.5px solid rgba(110,79,145,0.18)`, background:T.bg, fontFamily:F.sans, fontSize:14, color:T.inkH, outline:"none", boxSizing:"border-box" }}
            />

            <div style={{ fontFamily:F.mono, fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase", color:T.inkM, fontWeight:500, marginBottom:9, paddingLeft:2 }}>
              Class types
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:6 }}>
              {TYPE_ORDER.map(t => {
                const checked = newTypes[t];
                return (
                  <div key={t} style={{
                    borderRadius:13, border:`1.5px solid ${checked ? "rgba(110,79,145,0.3)" : HAIR}`,
                    background: checked ? T.aFill : T.bg, padding:"11px 13px", transition:"background 0.15s",
                  }}>
                    <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                      <input
                        type="checkbox" checked={checked}
                        onChange={e => setNewTypes(prev => ({ ...prev, [t]: e.target.checked }))}
                        style={{ width:17, height:17, accentColor:T.accent, cursor:"pointer", flexShrink:0 }}
                      />
                      <span style={{ fontFamily:F.sans, fontSize:14, fontWeight:600, color:T.inkH }}>{t[0].toUpperCase()+t.slice(1)}</span>
                    </label>
                    {checked && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:9, paddingLeft:27 }}>
                        <span style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM }}>Threshold</span>
                        <input
                          value={newThresholds[t]}
                          onChange={e => setNewThresholds(prev => ({ ...prev, [t]: e.target.value.replace(/\D/g, "") }))}
                          style={{ width:52, padding:"6px 8px", borderRadius:9, border:`1.5px solid rgba(110,79,145,0.25)`, background:"#fff", fontFamily:F.sans, fontSize:12.5, color:T.inkH, outline:"none", textAlign:"center" }}
                        />
                        <span style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM }}>%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {addError && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"10px 12px", borderRadius:12, background:T.dangerFill, marginTop:10 }}>
                <AlertTriangle size={13} color={T.danger} style={{ flexShrink:0, marginTop:1 }} />
                <span style={{ fontFamily:F.sans, fontSize:12, color:T.danger, fontWeight:600, lineHeight:1.4 }}>{addError}</span>
              </div>
            )}

            <div style={{ display:"flex", gap:9, marginTop:16 }}>
              <button onClick={() => { resetAddForm(); setAdding(false); }} style={{ flex:1, padding:13, borderRadius:13, border:`1.5px solid ${HAIR}`, background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:600, fontSize:13.5, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={addSubject} disabled={loading} style={{
                flex:1.6, padding:13, borderRadius:13, border:"none",
                background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
                fontFamily:F.sans, fontWeight:700, fontSize:13.5, cursor:"pointer",
                boxShadow:"0 10px 22px rgba(94,63,138,0.36), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
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
function SettingsScreen({ onSemesters, onEditTimetable, onLogout, onProfile }: {
  onSemesters:()=>void; onEditTimetable:()=>void; onLogout:()=>void; onProfile:()=>void;
}) {
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePct, setProfilePct] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setProfileName(user.name);
        setProfileEmail(user.email);
        const { semesters } = await api.get("/semesters");
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (active) {
          const { overall } = await api.get(`/records/stats/overview?semesterId=${active.id}`);
          setProfilePct(Math.round(overall?.percentage || 0));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [lowAlertsEnabled, setLowAlertsEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const prefs = await api.get("/push/preferences");
        setRemindersEnabled(prefs.remindersEnabled);
        setLowAlertsEnabled(prefs.lowAttendanceAlertsEnabled);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function toggleReminders(value: boolean) {
    try {
      if (value) {
        const ok = await subscribeToPush();
        if (!ok) { alert("Please allow notifications in your browser to enable this."); return; }
      }
      await api.patch("/push/preferences", { remindersEnabled: value });
      setRemindersEnabled(value);
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleLowAlerts(value: boolean) {
    try {
      if (value) {
        const ok = await subscribeToPush();
        if (!ok) { alert("Please allow notifications in your browser to enable this."); return; }
      }
      await api.patch("/push/preferences", { lowAttendanceAlertsEnabled: value });
      setLowAlertsEnabled(value);
    } catch (e) {
      console.error(e);
    }
  }

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

  const [thresholdSummary, setThresholdSummary] = useState("Loading...");

  useEffect(() => {
    (async () => {
      try {
        const { semesters } = await api.get("/semesters");
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (!active) { setThresholdSummary("No subjects yet"); return; }
        const { subjects } = await api.get(`/subjects?semesterId=${active.id}`);
        if (subjects.length === 0) { setThresholdSummary("No subjects yet"); return; }
        const thresholds = subjects.flatMap((s:any) => {
          const vals = [];
          if (s.hasLecture) vals.push(s.thresholdLecture);
          if (s.hasTutorial) vals.push(s.thresholdTutorial);
          if (s.hasPractical) vals.push(s.thresholdPractical);
          return vals;
        });
        if (thresholds.length === 0) { setThresholdSummary("No subjects yet"); return; }
        const min = Math.min(...thresholds), max = Math.max(...thresholds);
        setThresholdSummary(min === max ? `${min}% across ${subjects.length} subjects` : `${min}%–${max}% across ${subjects.length} subjects`);
      } catch (e) {
        setThresholdSummary("Tap to view");
      }
    })();
  }, []);

  const groups = [
    { title:"Subjects & Timetable", items:[
      { I:Edit2, l:"Subjects & Timetable", s:thresholdSummary === "Loading..." ? "Add subjects, weekly slots & thresholds" : `Thresholds ${thresholdSummary}`, c:T.accent, fn:onEditTimetable as (()=>void)|undefined },
    ]},
    { title:"Data & Export", items:[
      { I:Archive,  l:"Manage Semesters",   s:"View, archive & start new",  c:T.accent, fn:onSemesters },
      { I:Download, l:"Export PDF Report",  s:"Full attendance report",    c:"#8B6FBB", fn:downloadReport },
    ]},
  ];

  const eyebrow = (text: string) => (
    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
      <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
      <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>{text}</span>
    </div>
  );

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ padding:"52px 24px 0" }}>
        {eyebrow("Preferences")}
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:29, color:T.inkH, letterSpacing:"-0.01em", marginBottom:18 }}>Settings</h2>
      </div>

      {/* Profile card */}
      <button onClick={onProfile} style={{
        textAlign:"left", cursor:"pointer", margin:"0 24px 22px", background:T.card, borderRadius:22,
        padding:18, boxShadow:"0 14px 32px rgba(27,21,48,0.09), 0 2px 8px rgba(27,21,48,0.04)",
        border:"1px solid #EFEAF6", display:"flex", alignItems:"center", gap:13,
        boxSizing:"border-box", width:"calc(100% - 48px)",
      }}>
        <div style={{
          width:50, height:50, borderRadius:"50%", flexShrink:0,
          background:"radial-gradient(circle at 30% 25%, #A98CD1 0%, #6E4F91 55%, #4A2F6E 100%)",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:"0 8px 18px rgba(94,63,138,0.4), inset 0 2px 3px rgba(255,255,255,0.35)",
        }}>
          <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:19, color:"#fff" }}>{profileName ? profileName[0].toUpperCase() : "?"}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16, color:T.inkH, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{profileName || "..."}</div>
          <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{profileEmail}</div>
        </div>
        <Seal pct={profilePct} size={50} label="" />
      </button>

      {/* Notifications */}
      <div style={{ padding:"0 24px", marginBottom:22 }}>
        {eyebrow("Notifications")}
        <div style={{ background:T.card, borderRadius:20, boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6", overflow:"hidden" }}>
          <div style={{ padding:"16px 18px", display:"flex", alignItems:"center", gap:12, justifyContent:"space-between", borderBottom:"1px solid #EFEAF6" }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15.5, color:T.inkH, lineHeight:1.3 }}>Class Reminders</div>
              <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, marginTop:4 }}>15 min before class</div>
            </div>
            <Switch checked={remindersEnabled} onChange={toggleReminders} />
          </div>
          <div style={{ padding:"16px 18px", display:"flex", alignItems:"center", gap:12, justifyContent:"space-between" }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15.5, color:T.inkH, lineHeight:1.3 }}>Low Attendance Alerts</div>
              <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, marginTop:4 }}>Daily check at 8 AM</div>
            </div>
            <Switch checked={lowAlertsEnabled} onChange={toggleLowAlerts} />
          </div>
        </div>
      </div>

      {groups.map(grp => (
        <div key={grp.title} style={{ padding:"0 24px", marginBottom:22 }}>
          {eyebrow(grp.title)}
          <div style={{ background:T.card, borderRadius:20, overflow:"hidden", boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6" }}>
            {grp.items.map((item,idx) => (
              <button key={idx} onClick={item.fn} style={{
                width:"100%", padding:"16px 18px", border:"none", background:"transparent",
                display:"flex", alignItems:"center", gap:13, cursor:"pointer", textAlign:"left",
                borderBottom: idx<grp.items.length-1 ? "1px solid #EFEAF6" : "none",
                transition:"background 0.12s ease",
              }}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(110,79,145,0.03)")}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
              >
                <div style={{ width:38, height:38, borderRadius:12, background:T.aFill, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <item.I size={17} color={item.c} strokeWidth={2} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15, color:T.inkH }}>{item.l}</div>
                  <div style={{ fontFamily:F.mono, fontSize:10, color:T.inkM, marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.s}</div>
                </div>
                <ChevronRight size={16} color={T.inkL} style={{ flexShrink:0 }} />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Account — logout card */}
      <div style={{ padding:"0 24px", marginBottom:22 }}>
        {eyebrow("Account")}
        <div style={{
          background:"linear-gradient(155deg,#FCF1F2,#FBE7EA)", borderRadius:20, overflow:"hidden",
          border:"1px solid rgba(176,58,69,0.16)",
          boxShadow:"0 10px 26px rgba(176,58,69,0.1), 0 2px 8px rgba(176,58,69,0.05)",
        }}>
          <button onClick={() => setConfirmLogout(true)} style={{
            width:"100%", padding:"17px 18px", border:"none", background:"transparent",
            display:"flex", alignItems:"center", gap:13, cursor:"pointer", textAlign:"left",
          }}>
            <div style={{ width:38, height:38, borderRadius:12, background:"#F6DBDF", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 6px 14px rgba(176,58,69,0.16)" }}>
              <LogOut size={19} color="#A82F3D" strokeWidth={2.2} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:15, color:"#A82F3D" }}>Log Out</div>
              <div style={{ fontFamily:F.mono, fontSize:10, color:"#B85D68", marginTop:3 }}>You'll need to sign in again.</div>
            </div>
          </button>
        </div>
      </div>

      <div style={{ padding:"0 24px 8px", textAlign:"center" }}>
        <p style={{ fontFamily:F.mono, fontSize:10, color:T.inkL, letterSpacing:"0.1em" }}>ATTENDEASY v2.0 · MONSOON 2026</p>
      </div>

      {confirmLogout && (
        <>
          <div onClick={() => setConfirmLogout(false)} style={{ position:"fixed", inset:0, background:"rgba(27,21,48,0.52)", backdropFilter:"blur(6px)", zIndex:50 }} />
          <div style={{
            position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:"calc(100% - 48px)", maxWidth:300,
            background:T.card, borderRadius:22, padding:"24px 22px 20px", textAlign:"center",
            boxShadow:"0 26px 60px rgba(15,8,28,0.38), 0 8px 20px rgba(15,8,28,0.18), inset 0 1px 0 #fff",
            zIndex:51,
          }}>
            <div style={{ width:46, height:46, margin:"0 auto 14px", borderRadius:15, background:T.dangerFill, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 18px rgba(176,58,69,0.18)" }}>
              <LogOut size={21} color={T.danger} strokeWidth={2.2} />
            </div>
            <h3 style={{ fontFamily:F.serif, fontWeight:700, fontSize:19, color:T.inkH, letterSpacing:"-0.01em", marginBottom:8 }}>Log out of AttendEasy?</h3>
            <p style={{ fontSize:13, color:T.inkM, lineHeight:1.5, marginBottom:20 }}>
              You'll need to sign in again to access your subjects and attendance.
            </p>
            <div style={{ display:"flex", gap:9 }}>
              <button onClick={() => setConfirmLogout(false)} style={{ flex:1, padding:13, borderRadius:13, border:"1.5px solid #EFEAF6", background:"#fff", color:T.inkM, fontFamily:F.sans, fontWeight:700, fontSize:13.5, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={onLogout} style={{
                flex:1, padding:13, borderRadius:13, border:"none", cursor:"pointer",
                background:"linear-gradient(155deg,#C24A57,#B03A45 55%,#7A2530)", color:"#fff",
                fontFamily:F.sans, fontWeight:700, fontSize:13.5,
                boxShadow:"0 12px 24px rgba(176,58,69,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}>
                Log Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileScreen({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [course, setCourse] = useState("");
  const [editingAcademic, setEditingAcademic] = useState(false);
  const [collegeInput, setCollegeInput] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [createdAt, setCreatedAt] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [overallPct, setOverallPct] = useState(0);
  const [semesterId, setSemesterId] = useState<string|null>(null);
  const [semesterName, setSemesterName] = useState("");
  const [semesterEndDate, setSemesterEndDate] = useState("");
  const [editingSemester, setEditingSemester] = useState(false);
  const [semNameInput, setSemNameInput] = useState("");
  const [semEndDateInput, setSemEndDateInput] = useState("");
  const [savingSemester, setSavingSemester] = useState(false);
  const [subjectCount, setSubjectCount] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwError, setPwError] = useState<string|null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [focused, setFocused] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setName(user.name);
        setCollege(user.college || "");
        setCourse(user.course || "");
        setCollegeInput(user.college || "");
        setCourseInput(user.course || "");
        setEmail(user.email);
        setNameInput(user.name);
        setCreatedAt(user.createdAt);

        const { semesters } = await api.get("/semesters");
        const active = semesters.find((s:any) => s.isActive) || semesters[0];
        if (active) {
          setSemesterId(active.id);
          setSemesterName(active.name);
          setSemesterEndDate(active.endDate ? new Date(active.endDate).toISOString().slice(0, 10) : "");
          const [{ overall }, { subjects }] = await Promise.all([
            api.get(`/records/stats/overview?semesterId=${active.id}`),
            api.get(`/subjects?semesterId=${active.id}`),
          ]);
          setOverallPct(Math.round(overall.percentage));
          setSubjectCount(subjects.length);
          setTotalClasses(overall.held);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function saveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    try {
      await api.updateName(nameInput.trim());
      setName(nameInput.trim());
      setEditing(false);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 1800);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function saveSemester() {
    if (!semesterId || !semNameInput.trim()) return;
    setSavingSemester(true);
    try {
      await api.patch(`/semesters/${semesterId}`, { name: semNameInput.trim(), endDate: semEndDateInput || null });
      setSemesterName(semNameInput.trim());
      setSemesterEndDate(semEndDateInput);
      setEditingSemester(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSemester(false);
    }
  }

  async function submitChangePassword() {
    setPwError(null);
    if (!currentPw) { setPwError("Enter your current password."); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      await api.changePassword(currentPw, newPw);
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setPwSuccess(false); setChangingPw(false); }, 2200);
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      setPwSaving(false);
    }
  }

  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString("en-IN", { month:"long", year:"numeric" }) : "";

  const label = (text: string) => (
    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
      <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
      <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.13em", textTransform:"uppercase", color:T.accent, fontWeight:600 }}>{text}</span>
    </div>
  );

  const inputStyle = (name: string): React.CSSProperties => ({
    width:"100%", padding:"13px 15px", borderRadius:14,
    border: focused===name ? `1.5px solid ${T.accent}` : "1.5px solid #EFEAF6",
    background:"linear-gradient(180deg,#FFFFFF,#FCFAFE)",
    fontFamily:F.sans, fontSize:14.5, color:T.inkH, outline:"none",
    boxShadow: focused===name ? "0 0 0 4px rgba(110,79,145,0.12)" : "0 1px 2px rgba(27,21,48,0.03)",
    boxSizing:"border-box", marginBottom:12, transition:"border-color .15s, box-shadow .15s",
  });

  const cancelBtn: React.CSSProperties = {
    flex:1, padding:"12px", borderRadius:13, border:"1.5px solid #EFEAF6", background:"#fff",
    color:T.inkM, fontFamily:F.sans, fontWeight:600, fontSize:13.5, cursor:"pointer",
  };
  const saveBtn: React.CSSProperties = {
    flex:1.6, padding:"12px", borderRadius:13, border:"none",
    background:"linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266)", color:"#fff",
    fontFamily:F.sans, fontWeight:700, fontSize:13.5, cursor:"pointer",
    boxShadow:"0 10px 22px rgba(94,63,138,0.36)",
  };

  return (
    <div style={{ fontFamily:F.sans, background:T.bg, minHeight:"100%", paddingBottom:116 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"52px 24px 0" }}>
        <button onClick={onBack} style={{
          width:34, height:34, borderRadius:11, background:T.card, border:"1px solid #EFEAF6",
          display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
          boxShadow:"0 2px 6px rgba(27,21,48,0.05)",
        }}>
          <ChevronLeft size={14} color={T.accent} strokeWidth={2.4} />
        </button>
        <span style={{ fontFamily:F.sans, fontWeight:600, fontSize:14, color:T.accent }}>Back</span>
      </div>

      <div style={{ padding:"18px 24px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:9 }}>
          <span style={{ width:4, height:4, borderRadius:"50%", background:"#C9A24B", flexShrink:0 }} />
          <span style={{ fontFamily:F.mono, fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:T.accent, fontWeight:500 }}>Your Account</span>
        </div>
        <h2 style={{ fontFamily:F.serif, fontWeight:600, fontSize:29, color:T.inkH, letterSpacing:"-0.01em" }}>Profile</h2>
      </div>

      <div style={{ padding:"0 24px" }}>
        {/* Profile card */}
        <div style={{
          marginTop:20, background:T.card, borderRadius:22, padding:20,
          display:"flex", alignItems:"center", gap:14,
          boxShadow:"0 14px 32px rgba(27,21,48,0.09), 0 2px 8px rgba(27,21,48,0.04)", border:"1px solid #EFEAF6",
        }}>
          <div style={{
            width:56, height:56, borderRadius:"50%", flexShrink:0, position:"relative",
            display:"flex", alignItems:"center", justifyContent:"center",
            background:"radial-gradient(circle at 30% 25%, #A98CD1 0%, #6E4F91 55%, #4A2F6E 100%)",
            boxShadow:"0 8px 18px rgba(94,63,138,0.4), inset 0 2px 3px rgba(255,255,255,0.35)",
          }}>
            <span style={{ fontFamily:F.serif, fontWeight:600, fontSize:22, color:"#fff" }}>{name ? name[0].toUpperCase() : "?"}</span>
            <div style={{
              position:"absolute", bottom:-3, right:-3, width:22, height:22, borderRadius:"50%",
              background:T.card, border:`2px solid ${T.bg}`, display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 3px 8px rgba(27,21,48,0.18)",
            }}>
              <Edit2 size={10} color={T.accent} strokeWidth={2.6} />
            </div>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:17, color:T.inkH, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name || "..."}</div>
            <div style={{ fontFamily:F.mono, fontSize:10.5, color:T.inkM, marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{email}</div>
            {memberSince && <div style={{ fontFamily:F.sans, fontSize:10.5, color:T.inkL, marginTop:4 }}>Member since {memberSince}</div>}
          </div>
          <Seal pct={overallPct} size={56} label="" />
        </div>

        {/* Quick stats */}
        <div style={{ display:"flex", gap:10, marginTop:14 }}>
          <div style={{
            flex:1, background:T.card, borderRadius:18, padding:"15px 10px", textAlign:"center",
            boxShadow:"0 8px 20px rgba(27,21,48,0.07), 0 2px 6px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
          }}>
            <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16.5, color:T.inkH, lineHeight:1.15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{semesterName || "—"}</div>
            <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:5, fontWeight:500 }}>Current Semester</div>
          </div>
          {[
            { label:"Subjects", v: subjectCount },
            { label:"Classes Held", v: totalClasses },
          ].map(item => (
            <div key={item.label} style={{
              flex:1, background:T.card, borderRadius:18, padding:"15px 12px", textAlign:"center",
              boxShadow:"0 8px 20px rgba(27,21,48,0.07), 0 2px 6px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
            }}>
              <div style={{ fontFamily:F.serif, fontWeight:600, fontSize:16.5, color:T.inkH, lineHeight:1.15 }}>{item.v}</div>
              <div style={{ fontFamily:F.mono, fontSize:8, color:T.inkM, textTransform:"uppercase", letterSpacing:"0.07em", marginTop:5, fontWeight:500 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Display name */}
        <div style={{
          marginTop:18, background:T.card, borderRadius:22, padding:20,
          boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: editing ? 14 : 0 }}>
            {label("Display Name")}
            {!editing && (
              <button onClick={() => { setEditing(true); setNameInput(name); }} style={{
                background:"none", border:"none", cursor:"pointer", color:T.accent,
                display:"flex", alignItems:"center", gap:4, fontSize:13, fontWeight:600, marginBottom:14,
              }}>
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>
          {editing ? (
            <>
              <input
                value={nameInput}
                onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
                onChange={e => setNameInput(e.target.value)}
                style={inputStyle("name")}
              />
              <div style={{ display:"flex", gap:9, marginTop:4 }}>
                <button onClick={() => { setEditing(false); setNameInput(name); }} style={cancelBtn}>Cancel</button>
                <button onClick={saveName} disabled={saving} style={saveBtn}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:15, color:T.inkH }}>{name}</span>
              {nameSaved && <span style={{ fontSize:12, color:T.safe }}>Saved!</span>}
            </div>
          )}
        </div>

        <div style={{
          marginTop:18, background:T.card, borderRadius:22, padding:20,
          boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: editingAcademic ? 14 : 0 }}>
            {label("Academic Info")}
            {!editingAcademic && (
              <button onClick={() => { setEditingAcademic(true); setCollegeInput(college); setCourseInput(course); }} style={{
                background:"none", border:"none", cursor:"pointer", color:T.accent,
                display:"flex", alignItems:"center", gap:4, fontSize:13, fontWeight:600, marginBottom:14,
              }}>
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>
          {editingAcademic ? (
            <>
              <input
                value={collegeInput}
                onFocus={() => setFocused("college")} onBlur={() => setFocused(null)}
                onChange={e => setCollegeInput(e.target.value)}
                placeholder="College name"
                style={inputStyle("college")}
              />
              <input
                value={courseInput}
                onFocus={() => setFocused("course")} onBlur={() => setFocused(null)}
                onChange={e => setCourseInput(e.target.value)}
                placeholder="Course (e.g. B.Tech CSE)"
                style={{ ...inputStyle("course"), marginBottom:4 }}
              />
              <div style={{ display:"flex", gap:9, marginTop:4 }}>
                <button onClick={() => { setEditingAcademic(false); setCollegeInput(college); setCourseInput(course); }} style={cancelBtn}>Cancel</button>
                <button
                  onClick={async () => {
                    setSavingAcademic(true);
                    try {
                      await api.updateProfile({ college: collegeInput.trim(), course: courseInput.trim() });
                      setCollege(collegeInput.trim());
                      setCourse(courseInput.trim());
                      setEditingAcademic(false);
                    } catch (e) { console.error(e); } finally { setSavingAcademic(false); }
                  }}
                  disabled={savingAcademic}
                  style={saveBtn}
                >
                  {savingAcademic ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          ) : (
            <div>
              <div style={{ fontSize:15, color: college ? T.inkH : T.inkL, fontStyle: college ? "normal" : "italic", marginBottom:4 }}>{college || "No college set"}</div>
              <div style={{ fontSize:13, color: course ? T.inkM : T.inkL, fontStyle: course ? "normal" : "italic" }}>{course || "No course set"}</div>
            </div>
          )}
        </div>

        <div style={{
          marginTop:18, background:T.card, borderRadius:22, padding:20,
          boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: editingSemester ? 14 : 0 }}>
            {label("Semester")}
            {!editingSemester && semesterId && (
              <button onClick={() => { setEditingSemester(true); setSemNameInput(semesterName); setSemEndDateInput(semesterEndDate); }} style={{
                background:"none", border:"none", cursor:"pointer", color:T.accent,
                display:"flex", alignItems:"center", gap:4, fontSize:13, fontWeight:600, marginBottom:14,
              }}>
                <Edit2 size={13} /> Edit
              </button>
            )}
          </div>
          {editingSemester ? (
            <>
              <input
                value={semNameInput}
                onFocus={() => setFocused("semName")} onBlur={() => setFocused(null)}
                onChange={e => setSemNameInput(e.target.value)}
                placeholder="Semester name"
                style={inputStyle("semName")}
              />
              <input
                type="date"
                value={semEndDateInput}
                onFocus={() => setFocused("semEndDate")} onBlur={() => setFocused(null)}
                onChange={e => setSemEndDateInput(e.target.value)}
                style={{ ...inputStyle("semEndDate"), marginBottom:4 }}
              />
              <div style={{ display:"flex", gap:9, marginTop:4 }}>
                <button onClick={() => { setEditingSemester(false); setSemNameInput(semesterName); setSemEndDateInput(semesterEndDate); }} style={cancelBtn}>Cancel</button>
                <button onClick={saveSemester} disabled={savingSemester || !semNameInput.trim()} style={saveBtn}>{savingSemester ? "Saving..." : "Save"}</button>
              </div>
            </>
          ) : (
            <div>
              <div style={{ fontSize:15, color: semesterName ? T.inkH : T.inkL, fontStyle: semesterName ? "normal" : "italic", marginBottom:4 }}>{semesterName || "No active semester"}</div>
              <div style={{ fontSize:13, color: semesterEndDate ? T.inkM : T.inkL, fontStyle: semesterEndDate ? "normal" : "italic" }}>
                {semesterEndDate ? `Ends ${new Date(semesterEndDate).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}` : "No end date set"}
              </div>
            </div>
          )}
        </div>

        {/* Password */}
        <div style={{
          marginTop:18, background:T.card, borderRadius:22, padding:20,
          boxShadow:"0 10px 26px rgba(27,21,48,0.07), 0 2px 8px rgba(27,21,48,0.03)", border:"1px solid #EFEAF6",
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: changingPw ? 14 : 0 }}>
            {label("Password")}
            {!changingPw && (
              <button onClick={() => { setChangingPw(true); setPwSuccess(false); setPwError(null); }} style={{
                background:"none", border:"none", cursor:"pointer", color:T.accent,
                display:"flex", alignItems:"center", gap:4, fontSize:13, fontWeight:600, marginBottom:14,
              }}>
                <Edit2 size={13} /> Change
              </button>
            )}
          </div>
          {changingPw && (
            pwSuccess ? (
              <p style={{ fontSize:13, color:T.safe, marginBottom:4 }}>Password updated successfully.</p>
            ) : (
              <>
                <div style={{ position:"relative" }}>
                  <input type={showCurPw ? "text" : "password"} placeholder="Current password" value={currentPw}
                    onFocus={() => setFocused("cur")} onBlur={() => setFocused(null)}
                    onChange={e => setCurrentPw(e.target.value)} style={{ ...inputStyle("cur"), paddingRight:44 }} />
                  <button type="button" onClick={() => setShowCurPw(v => !v)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:T.inkM, padding:4, display:"flex" }}>
                    {showCurPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div style={{ position:"relative" }}>
                  <input type={showNewPw ? "text" : "password"} placeholder="New password" value={newPw}
                    onFocus={() => setFocused("new")} onBlur={() => setFocused(null)}
                    onChange={e => setNewPw(e.target.value)} style={{ ...inputStyle("new"), paddingRight:44 }} />
                  <button type="button" onClick={() => setShowNewPw(v => !v)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:T.inkM, padding:4, display:"flex" }}>
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div style={{ position:"relative", marginBottom:16 }}>
                  <input type={showConfPw ? "text" : "password"} placeholder="Confirm new password" value={confirmPw}
                    onFocus={() => setFocused("conf")} onBlur={() => setFocused(null)}
                    onChange={e => setConfirmPw(e.target.value)} style={{ ...inputStyle("conf"), paddingRight:44 }} />
                  <button type="button" onClick={() => setShowConfPw(v => !v)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:T.inkM, padding:4, display:"flex" }}>
                    {showConfPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwError && <p style={{ color:T.danger, fontSize:12, marginBottom:10 }}>{pwError}</p>}
                <div style={{ display:"flex", gap:9 }}>
                  <button onClick={() => { setChangingPw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(null); }} style={cancelBtn}>Cancel</button>
                  <button onClick={submitChangePassword} disabled={pwSaving} style={saveBtn}>{pwSaving ? "Saving..." : "Update"}</button>
                </div>
              </>
            )
          )}
        </div>

        <p style={{ fontSize:11, color:T.inkL, marginTop:14, textAlign:"center" }}>Email can't be changed right now.</p>
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
  const [subjInitialType, setSubjInitialType] = useState<string|null>(null);
  const [markSlot,setMarkSlot]= useState<string|null>(null);
  const [homeRefresh, setHomeRefresh] = useState(0);
  const [skipOnboardIntro, setSkipOnboardIntro] = useState(false);
  const [checkingOnboard, setCheckingOnboard] = useState(true);
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== "undefined" ? window.matchMedia("(orientation: landscape)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const handler = () => setIsLandscape(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    window.addEventListener("resize", handler);
    return () => { mq.removeEventListener("change", handler); window.removeEventListener("resize", handler); };
  }, []);

  // Runs once whenever the user becomes authenticated (fresh login,
  // signup, or an existing token found on page load). If they already
  // have a semester set up, skip straight to Home instead of showing
  // onboarding again.
  useEffect(() => {
    if (!authed) { setCheckingOnboard(false); return; }
    let cancelled = false;
    setCheckingOnboard(true);
    api.get("/semesters")
      .then(async (data) => {
        if (cancelled) return;
        const active = data.semesters?.find((s:any) => s.isActive) || data.semesters?.[0];
        if (!active) { setScreen("onboarding"); return; }

        const { subjects } = await api.get(`/subjects?semesterId=${active.id}`);
        if (cancelled) return;

        if (subjects && subjects.length > 0) {
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
        minHeight: "100%", background: T.bg, display: "flex",
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
        width:"100%", maxWidth: (screen==="timetable" && isLandscape) ? "none" : 390, margin:"0 auto",
        minHeight:"100%", background:T.bg, position:"relative",
        fontFamily:F.sans, overflow:"hidden",
      }}>
        <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ height:"100%", overflowY: (screen==="timetable" && isLandscape) ? "hidden" : "auto", overflowX:"hidden" }}
        >
          {screen==="onboarding" && (
            <OnboardingScreen
              skipIntro={skipOnboardIntro}
              onDone={() => { setSkipOnboardIntro(false); setScreen("home"); setTab("home"); }}
            />
          )}
          {screen==="home" && (
            <HomeScreen
              refreshKey={homeRefresh}
              onSubject={(id, type) => { setSubjId(id); setSubjInitialType(type ?? null); setScreen("subject"); }}
              onMark={id => setMarkSlot(id)}
            />
          )}
          {screen==="timetable" && (
            <TimetableScreen
              onMark={id => setMarkSlot(id)}
              isLandscape={isLandscape}
              onBack={() => goTab("home")}
              onEditTimetable={() => setScreen("edit-timetable")}
            />
          )}
          {screen==="subject" && subjId && (
            <SubjectDetailScreen
              subjectId={subjId}
              initialType={subjInitialType}
              onBack={() => { setScreen("home"); setTab("home"); setSubjId(null); setSubjInitialType(null); }}
              onMark={id => setMarkSlot(id)}
              onEditTimetable={() => setScreen("edit-timetable")}
            />
          )}
          {screen==="calendar"  && <CalendarScreen />}
          {screen==="semester"  && (
            <SemesterScreen
              onStartNew={() => { setSkipOnboardIntro(true); setScreen("onboarding"); setTab("home"); }}
              onBack={() => setScreen("settings")}
            />
          )}
          {screen==="settings"  && (
            <SettingsScreen
              onSemesters={() => setScreen("semester")}
              onEditTimetable={() => setScreen("edit-timetable")}
              onLogout={() => { clearToken(); window.location.href = "/"; }}
              onProfile={() => setScreen("profile")}
            />
          )}
          {screen==="edit-timetable" && (
            <EditTimetableScreen onBack={() => setScreen("settings")} />
          )}
          {screen==="profile" && (
            <ProfileScreen onBack={() => setScreen("settings")} />
          )}
        </motion.div>
        </AnimatePresence>

        {screen !== "onboarding" && !(screen==="timetable" && isLandscape) && (
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