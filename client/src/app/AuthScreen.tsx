import { useState, type CSSProperties, type ReactNode } from "react";
import { T, F, S } from "./App";
import { api, setToken } from "../lib/api";
import { ArrowRight, Mail, ShieldCheck, Clock, GraduationCap, Eye, EyeOff } from "lucide-react";

type Mode = "login" | "signup" | "forgot";

export default function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === "signup" && !username.trim()) { setError("Please enter a username."); return; }
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    if (mode === "signup" && password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (mode === "signup" && password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const data = mode === "signup"
        ? await api.register(email, password, username)
        : await api.login(email, password);
      setToken(data.token);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async () => {
    setError(null);
    if (!forgotEmail.trim()) { setError("Please enter your email."); return; }
    setLoading(true);
    try {
      await api.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 6) s = 1;
    if (password.length >= 8 && /\d/.test(password)) s = 2;
    if (password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)) s = 3;
    return s;
  })();
  const strengthColors = [T.aFill, T.danger, T.warn, T.safe];

  // ── shared style helpers ──────────────────────────────────────
  const wrapStyle: CSSProperties = {
    minHeight: "100%", background: T.bg, display: "flex",
    flexDirection: "column", justifyContent: "center", padding: 24,
    fontFamily: F.sans, maxWidth: 390, margin: "0 auto", boxSizing: "border-box",
    overflowY: "auto",
  };

  const cardStyle: CSSProperties = {
    background: "linear-gradient(180deg, #FEFDFF 0%, #FBF8FE 55%, #F6F1FB 100%)",
    borderRadius: 28, padding: "28px 24px 24px", boxShadow: S.lg,
  };

  const label = (text: string) => (
    <label style={{
      display: "block", fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em",
      textTransform: "uppercase", color: T.inkM, marginBottom: 8, paddingLeft: 3, fontWeight: 500,
    }}>
      {text}
    </label>
  );

  const inputStyle = (name: string): CSSProperties => ({
    width: "100%", padding: "15px 16px", borderRadius: 15,
    border: focused === name ? `1px solid ${T.accent}` : "1px solid rgba(110,79,145,0.14)",
    background: "linear-gradient(180deg,#FFFFFF,#FCFAFE)",
    fontFamily: F.sans, fontSize: 15, color: T.inkH, outline: "none",
    boxShadow: focused === name ? "0 0 0 4px rgba(110,79,145,0.13)" : "0 1px 2px rgba(27,21,48,0.03)",
    boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s",
  });

  const buttonStyle: CSSProperties = {
    width: "100%", padding: "16px 0", borderRadius: 16, border: "none", cursor: "pointer",
    background: "linear-gradient(155deg, #8E6BB8 0%, #6E4F91 46%, #4A3266 100%)",
    color: "#fff", fontFamily: F.sans, fontWeight: 700, fontSize: 15.5,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    boxShadow: S.acc, marginTop: 6,
  };

  const eyebrow = (text: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: T.accent, fontWeight: 500 }}>{text}</span>
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#C9A24B" }} />
    </div>
  );

  const seal = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, margin: "8px auto 14px" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        background: "linear-gradient(140deg,#6E4F91 0%,#9B7FCC 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: S.acc,
      }}>
        <GraduationCap size={26} color="#fff" />
      </div>
      <span style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 22, color: T.inkH, letterSpacing: "-0.01em" }}>AttendEasy</span>
    </div>
  );

  // Heading: main text in Fraunces (no italic), the emphasized word gets
  // the accent purple colour instead of the odd italic treatment.
  const heading = (pre: string, accentWord: string, size = 30) => (
    <h1 style={{
      fontFamily: F.serif, fontWeight: 500, fontSize: size, color: T.inkH,
      textAlign: "center", letterSpacing: "-0.015em", margin: "0 0 8px", lineHeight: 1.15,
    }}>
      {pre} <span style={{ color: T.accent }}>{accentWord}</span>
    </h1>
  );

  const sub = (text: string) => (
    <p style={{
      textAlign: "center", color: T.inkM, fontSize: 13, margin: "0 0 18px",
      lineHeight: 1.5, maxWidth: 270, marginLeft: "auto", marginRight: "auto",
    }}>
      {text}
    </p>
  );

  const chip = (text: string, icon: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "center", margin: "20px 0 6px" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20,
        background: `linear-gradient(180deg, ${T.aFill}, #F4EEFA)`, border: "1px solid rgba(110,79,145,0.1)",
        fontFamily: F.mono, fontSize: 10, color: T.accent, fontWeight: 500,
      }}>
        {icon}{text}
      </div>
    </div>
  );

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        {mode === "forgot" ? (
          forgotSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, margin: "0 auto 20px", borderRadius: 20,
                background: `linear-gradient(160deg,#F5EEFB,${T.aFillDeep})`, display: "flex",
                alignItems: "center", justifyContent: "center",
                boxShadow: "inset 0 2px 4px rgba(255,255,255,0.7), 0 10px 24px rgba(110,79,145,0.18)",
              }}>
                <Mail size={26} color={T.accent} strokeWidth={1.6} />
              </div>
              {heading("Check your", "inbox", 24)}
              <p style={{ color: T.inkM, fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
                If <b style={{ color: T.inkB }}>{forgotEmail}</b> is registered, a reset link is on its way. Spam folder bhi check kar lena.
              </p>
              {chip("Link expires in 15 min", <Clock size={12} />)}
              <button onClick={() => { setMode("login"); setForgotSent(false); setForgotEmail(""); }} style={{ ...buttonStyle, marginTop: 24 }}>
                Back to login <ArrowRight size={16} />
              </button>
              <p onClick={submitForgot} style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: T.accent, fontWeight: 600, cursor: "pointer" }}>
                Resend email
              </p>
            </div>
          ) : (
            <>
              {eyebrow("Reset access")}
              {heading("Forgot your", "password?", 28)}
              {sub("Enter your registered email and we'll send you a reset link.")}
              {label("Email")}
              <input
                placeholder="you@college.edu" value={forgotEmail}
                onFocus={() => setFocused("forgotEmail")} onBlur={() => setFocused(null)}
                onChange={(e) => setForgotEmail(e.target.value)}
                style={{ ...inputStyle("forgotEmail"), marginBottom: 20 }}
              />
              {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button onClick={submitForgot} disabled={loading} style={buttonStyle}>
                {loading ? "Sending..." : "Send reset link"}
                {!loading && <ArrowRight size={16} />}
              </button>
              <p
                style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.accent, fontWeight: 600, cursor: "pointer" }}
                onClick={() => { setMode("login"); setError(null); }}
              >
                Back to login
              </p>
            </>
          )
        ) : (
          <>
            {mode === "login" && seal()}
            {eyebrow(mode === "login" ? "Welcome back" : "New semester")}
            {mode === "login" ? heading("Welcome", "back", 30) : heading("Create your", "account", 30)}
            {sub(mode === "login"
              ? "Sign in to see today's lecture line-up and where you stand."
              : "Set up your timetable once — track every lecture all semester.")}

            {mode === "signup" && (
              <div style={{ marginBottom: 12 }}>
                {label("Username")}
                <input
                  placeholder="e.g. priyanshi_23" value={username}
                  onFocus={() => setFocused("username")} onBlur={() => setFocused(null)}
                  onChange={(e) => setUsername(e.target.value)} style={inputStyle("username")}
                />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              {label("Email")}
              <input
                placeholder="you@college.edu" value={email}
                onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                onChange={(e) => setEmail(e.target.value)} style={inputStyle("email")}
              />
            </div>

            <div style={{ marginBottom: mode === "signup" ? 12 : 8 }}>
              {label("Password")}
              <div style={{ position: "relative" }}>
                <input
                  placeholder="••••••••" type={showPassword ? "text" : "password"} value={password}
                  onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                  onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle("password"), paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.inkM, padding: 4, display: "flex" }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {mode === "signup" && (
                <div style={{ display: "flex", gap: 5, marginTop: 8, paddingLeft: 3 }}>
                  {[1, 2, 3].map((i) => (
                    <i key={i} style={{
                      flex: 1, height: 3.5, borderRadius: 3, display: "block",
                      background: i <= strength ? strengthColors[strength] : T.aFill,
                    }} />
                  ))}
                </div>
              )}
            </div>

            {mode === "signup" && (
              <div style={{ marginBottom: 12 }}>
                {label("Confirm password")}
                <div style={{ position: "relative" }}>
                  <input
                    placeholder="••••••••" type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
                    onFocus={() => setFocused("confirmPassword")} onBlur={() => setFocused(null)}
                    onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle("confirmPassword"), paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.inkM, padding: 4, display: "flex" }}
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            )}

            {mode === "login" && (
              <div style={{ display: "flex", justifyContent: "flex-end", margin: "2px 3px 24px 0" }}>
                <span
                  onClick={() => { setMode("forgot"); setError(null); }}
                  style={{ fontFamily: F.sans, fontSize: 13, color: T.accent, fontWeight: 600, cursor: "pointer" }}
                >
                  Forgot password?
                </span>
              </div>
            )}

            {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button onClick={submit} disabled={loading} style={buttonStyle}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
              {!loading && <ArrowRight size={16} />}
            </button>

            {mode === "login" && chip("Your data stays on device", <ShieldCheck size={12} />)}

            <p style={{ textAlign: "center", marginTop: mode === "login" ? 8 : 8, fontSize: 13.5, color: T.inkM }}>
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <span
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                style={{ color: T.accent, fontWeight: 700, cursor: "pointer" }}
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}