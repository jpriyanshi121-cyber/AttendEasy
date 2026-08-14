// Lightweight UI sound effects, synthesized with the Web Audio API — no
// audio files to fetch, host, or bundle, and they still work offline in
// the installed PWA. Every sound is short and soft on purpose: these are
// meant to read as understated confirmation, not a game's SFX.

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

// One soft, rounded tone — a sine wave with a quick attack and a gentle
// exponential decay, so nothing ever clicks or pops at the edges.
function tone(freq: number, startAt: number, duration: number, gain: number, ac: AudioContext, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
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

// Marking present — a brief, bright two-note rise (like a soft "ding").
export function playPresent() {
  play((ac, t) => {
    tone(783.99, t, 0.16, 0.05, ac);        // G5
    tone(1174.66, t + 0.07, 0.18, 0.045, ac); // D6
  });
}

// Marking absent — a single, low, muted tone. Acknowledging, not scolding.
export function playAbsent() {
  play((ac, t) => {
    tone(220, t, 0.16, 0.035, ac, "sine");
  });
}

// Cancelled / rescheduled — a neutral, short two-tone tick.
export function playNeutral() {
  play((ac, t) => {
    tone(440, t, 0.09, 0.035, ac);
    tone(392, t + 0.05, 0.1, 0.03, ac);
  });
}

// Crossing back above the attendance threshold — pairs with the confetti
// burst, so it gets a fuller three-note major arpeggio.
export function playCelebration() {
  play((ac, t) => {
    tone(523.25, t, 0.14, 0.05, ac);        // C5
    tone(659.25, t + 0.09, 0.14, 0.05, ac); // E5
    tone(783.99, t + 0.18, 0.26, 0.055, ac); // G5
  });
}

// Deleting something — a short, dry downward tick. Deliberately unshowy.
export function playDelete() {
  play((ac, t) => {
    tone(340, t, 0.07, 0.03, ac, "triangle");
    tone(230, t + 0.045, 0.08, 0.026, ac, "triangle");
  });
}

// Generic save/confirm — a single soft, quick blip for actions that
// don't already have a more specific sound (archiving a semester,
// saving a note, adding a subject, etc).
export function playConfirm() {
  play((ac, t) => {
    tone(660, t, 0.1, 0.04, ac);
  });
}