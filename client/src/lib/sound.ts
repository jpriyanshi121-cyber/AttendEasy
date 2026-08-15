// Lightweight UI sound effects, synthesized with the Web Audio API — no
// audio files to fetch, host, or bundle, and they still work offline in
// the installed PWA.
//
// Every melodic sound below is built from the same C-major-pentatonic
// scale (C D E G A across a couple of octaves). That's deliberate: pull
// every sound from one scale and they always sound like they belong to
// the same "instrument" and never clash against each other, even when
// two fire close together. Multi-note sounds overlap their notes
// slightly (each one starts before the last has fully decayed) instead
// of waiting for silence in between — that overlap is what reads as a
// flowing phrase instead of a string of separate beeps.

const STORAGE_KEY = "attendeasy_sound_enabled";

// C-major pentatonic, low to high.
const C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392.0, A4 = 440.0;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;
const C6 = 1046.5;

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // Browsers suspend a freshly-created AudioContext until it's resumed
  // from a real user gesture — every call site here runs from a click
  // or input handler, so this is always safe to call.
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

// A warm, rounded note: a sine fundamental layered with a quieter
// octave-up sine (adds body without turning it into a raw synth beep),
// through a gentle lowpass so nothing sounds thin or harsh. A soft
// attack and release on both ends so notes fade into each other rather
// than cutting off — that's most of what makes a run of notes feel like
// one flowing phrase instead of separate clicks.
function note(freq: number, startAt: number, duration: number, peak: number, ac: AudioContext) {
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
    g.gain.linearRampToValueAtTime(level, startAt + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(g);
    g.connect(filter);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.03);
  };
  mk(freq, peak);
  mk(freq * 2, peak * 0.2);
}

// A short phrase: notes from `scale`, each one starting before the
// previous has finished decaying (that's the `gap` vs `duration` gap —
// gap is shorter than duration) so they overlap into a legato run.
function phrase(scale: number[], startAt: number, gap: number, duration: number, peak: number, ac: AudioContext) {
  scale.forEach((f, i) => note(f, startAt + i * gap, duration, peak, ac));
}

// A short, soft percussive tick — filtered noise rather than a tone,
// used for clicks/taps/toggles where a musical note would be too much.
function tick(startAt: number, duration: number, peak: number, ac: AudioContext, freq: number, q: number, type: BiquadFilterType) {
  const bufferSize = Math.ceil(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
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

// Marking present — a quick three-note rise (E5→G5→C6), overlapping.
export function playPresent() {
  play((ac, t) => phrase([E5, G5, C6], t, 0.075, 0.24, 0.22, ac));
}

// Marking absent — a soft two-note fall (E4→C4). Acknowledging, not
// scolding — still musical, just resolving downward instead of up.
export function playAbsent() {
  play((ac, t) => phrase([E4, C4], t, 0.09, 0.26, 0.18, ac));
}

// Cancelled / rescheduled — a flat, neutral two-note (A4→A4), same note
// twice, so it reads as "noted" rather than good or bad.
export function playNeutral() {
  play((ac, t) => phrase([A4, A4], t, 0.1, 0.18, 0.16, ac));
}

// Crossing back above the attendance threshold — pairs with the confetti
// burst, so it gets the full run up the scale.
export function playCelebration() {
  play((ac, t) => phrase([C5, E5, G5, A5, C6], t, 0.085, 0.3, 0.22, ac));
}

// Deleting something — a dry tick plus a short low note falling away.
export function playDelete() {
  play((ac, t) => {
    tick(t, 0.045, 0.4, ac, 1600, 1.1, "bandpass");
    note(D4, t + 0.02, 0.16, 0.14, ac);
  });
}

// Generic save/confirm — a single clean note for actions without a more
// specific sound (archiving a semester, saving a note, adding a
// subject, turning a setting on, ...).
export function playConfirm() {
  play((ac, t) => note(G5, t, 0.2, 0.2, ac));
}

// A light tap — navigation-y taps that aren't a full "confirm": tab bar
// switches, back buttons, a segmented control (Theory/Lab), opening a
// subject card.
export function playTap() {
  play((ac, t) => tick(t, 0.03, 0.32, ac, 2200, 1.0, "bandpass"));
}

// Flipping a switch/toggle — a tiny click, pitched slightly differently
// for on vs off, like a physical rocker switch.
export function playToggle(on: boolean) {
  play((ac, t) => tick(t, 0.028, 0.36, ac, on ? 2400 : 1300, 1.0, "bandpass"));
}

// A near-silent base "click" fired globally on every button press across
// the app, even ones with no specific sound wired to them — the app-wide
// safety net so nothing feels mute. Deliberately much quieter/shorter
// than the sounds above, so it sits underneath a real action's sound
// rather than competing with it.
export function playClickBase() {
  play((ac, t) => tick(t, 0.012, 0.1, ac, 1900, 0.9, "bandpass"));
}

// A single keystroke, fired globally on every text input across the
// app. Distinct texture from clicks/taps on purpose — a soft, rounded
// "thock" (lowpass-filtered, not the bandpass "tick" everything else
// uses) so a run of typing reads as soft paper-tap rather than the same
// click sound repeated. Tiny and heavily throttled — this needs to
// survive a full sentence of typing without turning into noise.
let lastKeyTickAt = 0;
export function playKeyTick() {
  if (!isSoundEnabled()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastKeyTickAt < 55) return;
  lastKeyTickAt = now;
  play((ac, t) => tick(t, 0.018, 0.16, ac, 950, 0.7, "lowpass"));
}