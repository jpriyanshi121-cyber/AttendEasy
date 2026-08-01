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
    const numerator = thresholdFraction * held - present;
    const denominator = 1 - thresholdFraction;
    needToAttend = Math.max(0, Math.ceil(numerator / denominator));
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
  };
}

function thresholdForType(subject, type) {
  if (type === "tutorial") return subject.thresholdTutorial;
  if (type === "practical") return subject.thresholdPractical;
  return subject.thresholdLecture;
}

module.exports = { computeStats, thresholdForType };