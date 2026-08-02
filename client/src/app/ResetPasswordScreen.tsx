import { useState, type CSSProperties } from "react";
import { T, F, S } from "./App";
import { api } from "../lib/api";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

export default function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!password || password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
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

  const iconCircle = (children: React.ReactNode) => (
    <div style={{
      width: 68, height: 68, margin: "0 auto 20px", borderRadius: "50%",
      background: "radial-gradient(circle at 30% 25%, #A98CD1 0%, #6E4F91 48%, #3C2757 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 14px 34px rgba(94,63,138,0.4), inset 0 2px 4px rgba(255,255,255,0.35)",
    }}>
      {children}
    </div>
  );

  return (
    <div style={{
      minHeight: "100%", background: T.bg, display: "flex",
      flexDirection: "column", justifyContent: "center", padding: 24,
      fontFamily: F.sans, maxWidth: 390, margin: "0 auto", boxSizing: "border-box",
    }}>
      <div style={{
        background: "linear-gradient(180deg, #FEFDFF 0%, #FBF8FE 55%, #F6F1FB 100%)",
        borderRadius: 32, padding: "36px 28px 32px", boxShadow: S.lg,
      }}>
        {done ? (
          <div style={{ textAlign: "center" }}>
            {iconCircle(<Check size={28} color="#fff" strokeWidth={2.5} />)}
            <h1 style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 24, color: T.inkH, marginBottom: 8 }}>
              Password <span style={{ color: T.accent }}>updated</span>
            </h1>
            <p style={{ color: T.inkM, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              You can now log in with your new password.
            </p>
            <button onClick={onDone} style={buttonStyle}>
              Back to login <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            {iconCircle(<ShieldCheck size={26} color="#fff" strokeWidth={1.8} />)}
            <h1 style={{ fontFamily: F.serif, fontWeight: 500, fontSize: 25, color: T.inkH, textAlign: "center", margin: "0 0 8px" }}>
              Set a new <span style={{ color: T.accent }}>password</span>
            </h1>
            <p style={{ textAlign: "center", color: T.inkM, fontSize: 14, marginBottom: 28 }}>
              Make it something you'll actually remember this time.
            </p>

            <div style={{ marginBottom: 16 }}>
              {label("New password")}
              <input
                placeholder="••••••••" type="password" value={password}
                onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                onChange={(e) => setPassword(e.target.value)} style={inputStyle("password")}
              />
              <div style={{ display: "flex", gap: 5, marginTop: 10, paddingLeft: 3 }}>
                {[1, 2, 3].map((i) => (
                  <i key={i} style={{
                    flex: 1, height: 3.5, borderRadius: 3, display: "block",
                    background: i <= strength ? strengthColors[strength] : T.aFill,
                  }} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              {label("Confirm new password")}
              <input
                placeholder="••••••••" type="password" value={confirmPassword}
                onFocus={() => setFocused("confirmPassword")} onBlur={() => setFocused(null)}
                onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle("confirmPassword")}
              />
            </div>

            {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button onClick={submit} disabled={loading} style={buttonStyle}>
              {loading ? "Please wait..." : "Update password"}
              {!loading && <Check size={16} />}
            </button>

            <p style={{ textAlign: "center", fontFamily: F.mono, fontSize: 9.5, color: T.inkL, letterSpacing: "0.1em", marginTop: 20 }}>
              ATTENDEASY · SECURE RESET
            </p>
          </>
        )}
      </div>
    </div>
  );
}
