// Pure functions for attendance math — no DB calls here, just numbers.

function computeStats(records, threshold) {
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const cancelled = records.filter((r) => r.status === "cancelled").length;

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
    total: records.length,
    held,
    attended: present,
    missed: absent,
    cancelled,
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
function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// How many classes of a given type remain between today and the semester's
// end date (inclusive). Walks each day, checking recurring weekly slots
// (minus any that were rescheduled away that specific day) plus any
// already-scheduled one-off extra classes. Returns null if there's no
// end date set — meaning the horizon is unknown.
async function countRemainingClasses(prisma, { subjectId, semesterId, type, endDate }) {
  if (!endDate) return null;

  const from = startOfDayLocal(new Date());
  const to = startOfDayLocal(endDate);
  if (to < from) return 0;

  const [recurring, extras] = await Promise.all([
    prisma.slot.findMany({ where: { subjectId, semesterId, type, isExtra: false } }),
    prisma.slot.findMany({ where: { subjectId, semesterId, type, isExtra: true, extraDate: { gte: from, lte: to } } }),
  ]);

  const replacedKeys = new Set();
  for (const e of extras) {
    if (e.replacesSlotId) replacedKeys.add(`${e.replacesSlotId}|${e.extraDate.toISOString().slice(0, 10)}`);
  }

  let count = extras.length;
  const cursor = new Date(from);
  while (cursor <= to) {
    const dow = toOurDay(cursor.getDay());
    const dateKey = cursor.toISOString().slice(0, 10);
    for (const s of recurring) {
      if (s.day === dow && !replacedKeys.has(`${s.id}|${dateKey}`)) count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

module.exports = { computeStats, thresholdForType, countRemainingClasses };