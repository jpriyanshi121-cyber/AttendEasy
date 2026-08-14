// Lightweight UI sound effects, synthesized with the Web Audio API — no
// audio files to fetch, host, or bundle, and they still work offline in
// the installed PWA.

const STORAGE_KEY = "attendeasy_sound_enabled";

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // Browsers suspend a freshly-created AudioContext until it's resumed
  // from a real user gesture — every call site here runs from a click
  // handler, so this is always safe to call.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === "1";
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
}

// A warm, rounded tone: a sine fundamental layered with a quieter
// octave-up sine (adds body without turning it into a raw synth beep),
// run through a gentle lowpass so nothing sounds thin or harsh, with a
// fast attack and a smooth exponential decay so there's no click at
// either end.
function tone(freq: number, startAt: number, duration: number, peak: number, ac: AudioContext) {
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(freq * 4, 6000);
  filter.connect(ac.destination);

  const mk = (f: number, level: number) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, startAt);
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(level, startAt + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(g);
    g.connect(filter);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  };
  mk(freq, peak);
  mk(freq * 2, peak * 0.22);
}

// A short, dry percussive tick (for taps/navigation) — filtered noise
// burst rather than a tone, like a soft mechanical-keyboard click.
function tick(startAt: number, duration: number, peak: number, ac: AudioContext, freq = 1500) {
  const bufferSize = Math.ceil(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.9;
  const g = ac.createGain();
  g.gain.setValueAtTime(peak, startAt);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  noise.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  noise.start(startAt);
  noise.stop(startAt + duration + 0.01);
}

function play(fn: (ac: AudioContext, now: number) => void) {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    fn(ac, ac.currentTime);
  } catch {
    // Sound is a nicety, never worth surfacing an error over.
  }
}

// Marking present — a bright, cheerful two-note rise.
export function playPresent() {
  play((ac, t) => {
    tone(783.99, t, 0.22, 0.24, ac);         // G5
    tone(1174.66, t + 0.08, 0.26, 0.22, ac); // D6
  });
}

// Marking absent — a single, low, soft tone. Acknowledging, not scolding.
export function playAbsent() {
  play((ac, t) => {
    tone(261.63, t, 0.24, 0.2, ac); // C4
  });
}

// Cancelled / rescheduled — a neutral two-note tick-tock.
export function playNeutral() {
  play((ac, t) => {
    tone(440, t, 0.14, 0.18, ac);
    tone(392, t + 0.07, 0.16, 0.16, ac);
  });
}

// Crossing back above the attendance threshold — pairs with the confetti
// burst, so it gets a fuller four-note major run.
export function playCelebration() {
  play((ac, t) => {
    tone(523.25, t, 0.18, 0.22, ac);         // C5
    tone(659.25, t + 0.09, 0.18, 0.22, ac);  // E5
    tone(783.99, t + 0.18, 0.18, 0.22, ac);  // G5
    tone(1046.5, t + 0.27, 0.32, 0.24, ac);  // C6
  });
}

// Deleting something — a short, dry downward tick.
export function playDelete() {
  play((ac, t) => {
    tick(t, 0.05, 0.5, ac, 1800);
    tone(220, t + 0.02, 0.12, 0.14, ac);
  });
}

// Generic save/confirm — a single soft, quick blip for actions that
// don't already have a more specific sound (archiving a semester,
// saving a note, adding a subject, turning a setting on, etc).
export function playConfirm() {
  play((ac, t) => {
    tone(660, t, 0.15, 0.2, ac);
  });
}

// A light tap — for navigation-y taps that aren't a full "confirm": tab
// bar switches, back buttons, a segmented control (Theory/Lab), opening
// a subject card. Meant to be felt more than heard.
export function playTap() {
  play((ac, t) => {
    tick(t, 0.035, 0.35, ac, 2400);
  });
}

// Flipping a switch/toggle — a tiny click, pitched slightly differently
// for on vs off, like a physical rocker switch.
export function playToggle(on: boolean) {
  play((ac, t) => {
    tick(t, 0.03, 0.4, ac, on ? 2600 : 1400);
  });
}

// A near-silent base "click" fired globally on every button press across
// the app, even ones with no specific sound wired to them — the app-wide
// safety net so nothing feels mute. Deliberately much quieter/shorter
// than every sound above it, so it sits underneath a real action's sound
// (present/delete/toggle/etc.) rather than competing with it.
export function playClickBase() {
  play((ac, t) => {
    tick(t, 0.014, 0.12, ac, 2000);
  });
}

// A single keystroke, fired globally on every text input across the app.
// Also intentionally tiny — this needs to survive someone typing a full
// sentence without turning into noise, not announce itself.
let lastKeyTickAt = 0;
export function playKeyTick() {
  if (!isSoundEnabled()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastKeyTickAt < 32) return; // fast typing shouldn't turn into a wall of clicks
  lastKeyTickAt = now;
  play((ac, t) => {
    tick(t, 0.01, 0.1, ac, 3400);
  });
}