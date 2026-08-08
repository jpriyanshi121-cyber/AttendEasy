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

module.exports = { computeStats, thresholdForType };