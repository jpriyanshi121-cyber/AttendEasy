import { useState } from "react";
import { T, F, S } from "./App";
import { api } from "../lib/api";

export default function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const fieldStyle = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid rgba(110,79,145,0.15)", marginBottom: 12,
    fontSize: 14, outline: "none", boxSizing: "border-box" as const,
  };

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

  return (
    <div style={{
      minHeight: "100dvh", background: T.bg, display: "flex",
      flexDirection: "column", justifyContent: "center", padding: 24,
      fontFamily: F.sans, maxWidth: 390, margin: "0 auto", boxSizing: "border-box",
    }}>
      <div style={{ background: T.card, borderRadius: 20, padding: 28, boxShadow: S.md }}>
        {done ? (
          <>
            <h1 style={{ fontFamily: F.serif, fontSize: 22, color: T.inkH, marginBottom: 10 }}>Password updated</h1>
            <p style={{ color: T.inkM, fontSize: 14, marginBottom: 20 }}>You can now log in with your new password.</p>
            <button onClick={onDone} style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: T.accent, color: "#fff", border: "none", fontWeight: 600, fontSize: 15, cursor: "pointer", boxShadow: S.acc }}>
              Back to login
            </button>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: F.serif, fontSize: 22, color: T.inkH, marginBottom: 4 }}>Set a new password</h1>
            <p style={{ color: T.inkM, fontSize: 14, marginBottom: 20 }}>Choose a new password for your account.</p>
            <input placeholder="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={fieldStyle} />
            <input placeholder="Confirm new password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={fieldStyle} />
            {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: T.accent, color: "#fff", border: "none", fontWeight: 600, fontSize: 15, cursor: "pointer", boxShadow: S.acc }}>
              {loading ? "Please wait..." : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}