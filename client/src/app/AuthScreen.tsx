import { useState, type CSSProperties } from "react";
import { T, F, S } from "./App";
import { api, setToken } from "../lib/api";

export default function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fieldStyle: CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid rgba(110,79,145,0.15)", marginBottom: 12,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const buttonStyle: CSSProperties = {
    width: "100%", padding: "14px 0", borderRadius: 14,
    background: T.accent, color: "#fff", border: "none",
    fontWeight: 600, fontSize: 15, cursor: "pointer",
    boxShadow: S.acc, marginTop: 8,
  };

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

  return (
    <div style={{
      minHeight: "100dvh", background: T.bg, display: "flex",
      flexDirection: "column", justifyContent: "center", padding: 24,
      fontFamily: F.sans, maxWidth: 390, margin: "0 auto", boxSizing: "border-box",
    }}>
      <div style={{ background: T.card, borderRadius: 20, padding: 28, boxShadow: S.md }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 28, color: T.inkH, marginBottom: 4 }}>
          AttendEasy
        </h1>

        {mode === "forgot" ? (
          forgotSent ? (
            <>
              <p style={{ color: T.inkM, fontSize: 14, margin: "16px 0 20px", lineHeight: 1.6 }}>
                If that email is registered, we've sent a password reset link. Check your inbox (and spam folder).
              </p>
              <button onClick={() => { setMode("login"); setForgotSent(false); setForgotEmail(""); }} style={buttonStyle}>
                Back to login
              </button>
            </>
          ) : (
            <>
              <p style={{ color: T.inkM, fontSize: 14, marginBottom: 20 }}>Enter your email to get a reset link.</p>
              <input placeholder="Email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} style={fieldStyle} />
              {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button onClick={submitForgot} disabled={loading} style={buttonStyle}>
                {loading ? "Sending..." : "Send reset link"}
              </button>
              <p style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.accent, fontWeight: 600, cursor: "pointer" }}
                 onClick={() => { setMode("login"); setError(null); }}>
                Back to login
              </p>
            </>
          )
        ) : (
          <>
            <p style={{ color: T.inkM, fontSize: 14, marginBottom: 24 }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </p>

            {mode === "signup" && (
              <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={fieldStyle} />
            )}
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
            <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />
            {mode === "signup" && (
              <input placeholder="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={fieldStyle} />
            )}

            {mode === "login" && (
              <p style={{ textAlign: "right", fontSize: 12, color: T.accent, marginTop: -6, marginBottom: 14, cursor: "pointer", fontWeight: 500 }}
                 onClick={() => { setMode("forgot"); setError(null); }}>
                Forgot password?
              </p>
            )}

            {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button onClick={submit} disabled={loading} style={buttonStyle}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
            </button>

            <p style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: T.inkM }}>
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <span
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                style={{ color: T.accent, fontWeight: 600, cursor: "pointer" }}
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