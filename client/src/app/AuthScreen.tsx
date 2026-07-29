import { useState, type CSSProperties } from "react";
import { T, F, S } from "./App";
import { api, setToken } from "../lib/api";

export default function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = mode === "signup"
        ? await api.register(email, password, name)
        : await api.login(email, password);
      setToken(data.token);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle: CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid rgba(110,79,145,0.15)", marginBottom: 12,
    fontSize: 14, outline: "none", boxSizing: "border-box",
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
        <p style={{ color: T.inkM, fontSize: 14, marginBottom: 24 }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </p>

        {mode === "signup" && (
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
        )}
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />

        {error && <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 14,
            background: T.accent, color: "#fff", border: "none",
            fontWeight: 600, fontSize: 15, cursor: "pointer",
            boxShadow: S.acc, marginTop: 8,
          }}
        >
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
      </div>
    </div>
  );
}