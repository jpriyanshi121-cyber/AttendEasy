// Pure functions for attendance math — no DB calls here, just numbers.

// A class's weight in the attendance math is its duration in hours, not "1
// per mark" — a 1-hour lecture is 1 attendance unit, a 3-hour lab is 3.
// Falls back to 1 if slot data wasn't included in the query (shouldn't
// normally happen — every caller of computeStats includes `slot`).
function slotHours(slot) {
  if (!slot || !slot.startTime || !slot.endTime) return 1;
  const [sh, sm] = slot.startTime.split(":").map(Number);
  const [eh, em] = slot.endTime.split(":").map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  return minutes > 0 ? minutes / 60 : 1;
}

function computeStats(records, threshold) {
  const presentRecords = records.filter((r) => r.status === "present");
  const absentRecords = records.filter((r) => r.status === "absent");
  const cancelledRecords = records.filter((r) => r.status === "cancelled");

  const present = presentRecords.reduce((sum, r) => sum + slotHours(r.slot), 0);
  const absent = absentRecords.reduce((sum, r) => sum + slotHours(r.slot), 0);
  const cancelled = cancelledRecords.reduce((sum, r) => sum + slotHours(r.slot), 0);
  const total = records.reduce((sum, r) => sum + slotHours(r.slot), 0);

  const held = present + absent;
  const percentage = held === 0 ? 100 : (present / held) * 100;
  const thresholdFraction = threshold / 100;

  let canMissMore = 0;
  let needToAttend = 0;

  if (held === 0) {
    canMissMore = 0;
    needToAttend = 0;
  } else if (percentage >= threshold) {
    const maxHeld = Math.floor(present / thresholdFraction);
    canMissMore = Math.max(0, maxHeld - held);
  } else {
    const denominator = 1 - thresholdFraction;
    if (denominator <= 0) {
      // Threshold is 100% and at least one class was missed — mathematically
      // impossible to ever recover to 100% again, no matter how many more
      // classes are attended.
      needToAttend = null;
    } else {
      const numerator = thresholdFraction * held - present;
      needToAttend = Math.max(0, Math.ceil(numerator / denominator));
    }
  }

  return {
    total: Math.round(total * 100) / 100,
    held: Math.round(held * 100) / 100,
    attended: Math.round(present * 100) / 100,
    missed: Math.round(absent * 100) / 100,
    cancelled: Math.round(cancelled * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
    threshold,
    canMissMore,
    needToAttend,
    impossible: needToAttend === null,
  };
}

function thresholdForType(subject, type) {
  if (type === "tutorial") return subject.thresholdTutorial;
  if (type === "practical") return subject.thresholdPractical;
  return subject.thresholdLecture;
}

function toOurDay(jsDay) { return (jsDay + 6) % 7; }

// "Today" has to be computed in IST, not the server's own clock — Render
// (and most hosts) run the process in UTC, so during roughly midnight to
// 5:30 AM IST every day, the UTC calendar date is still "yesterday". Using
// the server's raw clock here would make the recovery-plan projection
// below silently think it has one extra day to go for exactly that
// window each night. See the identical fix in scheduler.js's toIST().
function todayISTDateStr() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function startOfDayLocal(date) {
  const d = new Date(date);
  // UTC-explicit — see the identical note in slots.js's startOfDay().
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// How many attendance-hours remain between today and the semester's end
// date (inclusive) for a given class type — not a session count, since a
// 1-hour and a 3-hour class don't count the same. Walks each day, checking
// recurring weekly slots (minus any that were rescheduled away that specific
// day, or that fall on a declared Holiday) plus any already-scheduled
// one-off extra classes. Returns null if there's no end date set — meaning
// the horizon is unknown.
async function countRemainingClasses(prisma, { subjectId, semesterId, type, endDate }) {
  if (!endDate) return null;

  const from = startOfDayLocal(todayISTDateStr());
  const to = startOfDayLocal(endDate);
  if (to < from) return 0;

  const [recurring, extras, holidays] = await Promise.all([
    prisma.slot.findMany({ where: { subjectId, semesterId, type, isExtra: false } }),
    prisma.slot.findMany({ where: { subjectId, semesterId, type, isExtra: true, extraDate: { gte: from, lte: to } } }),
    prisma.holiday.findMany({ where: { semesterId, confirmed: true, date: { gte: from, lte: to } } }),
  ]);

  const holidayKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  const replacedKeys = new Set();
  for (const e of extras) {
    if (e.replacesSlotId) replacedKeys.add(`${e.replacesSlotId}|${e.extraDate.toISOString().slice(0, 10)}`);
  }

  // Extra (one-off) classes still count even on a declared holiday — if
  // someone explicitly scheduled a makeup class that day, that's deliberate.
  let hours = extras.reduce((sum, e) => sum + slotHours(e), 0);
  const cursor = new Date(from);
  while (cursor <= to) {
    const dow = toOurDay(cursor.getUTCDay());
    const dateKey = cursor.toISOString().slice(0, 10);
    if (!holidayKeys.has(dateKey)) {
      for (const s of recurring) {
        if (s.day === dow && !replacedKeys.has(`${s.id}|${dateKey}`)) hours += slotHours(s);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round(hours * 100) / 100;
}

module.exports = { computeStats, thresholdForType, countRemainingClasses, slotHours };