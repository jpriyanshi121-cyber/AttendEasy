const cron = require("node-cron");
const prisma = require("../db");
const { sendPushToUser } = require("./push");
const { computeStats, thresholdForType } = require("./stats");

// Render (and most hosts) run the Node process in UTC, not the student's
// local timezone. Reading now.getHours()/getDay() directly would compare
// against UTC clock time while every class time in the DB was entered in
// IST — off by 5:30 hours, so reminders would either never fire at the
// right moment or fire at a confusing time. This formats any Date as its
// IST wall-clock time/day, which is what all comparisons here should use.
function toIST(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some environments format midnight as "24" with hour12:false
  const minute = Number(get("minute"));
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    day: weekdayMap[get("weekday")],
    dateStr: `${get("year")}-${get("month")}-${get("day")}`, // matches how dates are stored elsewhere (bare "YYYY-MM-DD" -> UTC midnight)
  };
}

function startScheduler() {
  // Runs every minute: sends a push 15 minutes before each class starts (IST).
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const target = new Date(now.getTime() + 15 * 60000);
      const { hhmm: targetTime, day: ourDay } = toIST(target);
      const todayStart = new Date(toIST(now).dateStr);

      const users = await prisma.user.findMany({ where: { remindersEnabled: true } });

      for (const user of users) {
        const semester = await prisma.semester.findFirst({ where: { userId: user.id, isActive: true } });
        if (!semester) continue;

                const recurring = await prisma.slot.findMany({
          where: { semesterId: semester.id, day: ourDay, isExtra: false, startTime: targetTime },
          include: { subject: true },
        });
        const extras = await prisma.slot.findMany({
          where: { semesterId: semester.id, isExtra: true, extraDate: todayStart, startTime: targetTime },
          include: { subject: true },
        });

        // If today's occurrence of a recurring slot was rescheduled (an
        // extra "replaces" it for this exact date), skip the reminder for
        // its original time — that class isn't actually happening then.
        const allExtrasToday = await prisma.slot.findMany({
          where: { semesterId: semester.id, isExtra: true, extraDate: todayStart, replacesSlotId: { not: null } },
        });
        const replacedIds = new Set(allExtrasToday.map((e) => e.replacesSlotId));
        const activeRecurring = recurring.filter((s) => !replacedIds.has(s.id));

        for (const slot of [...activeRecurring, ...extras]) {
          await sendPushToUser(prisma, user.id, {
            title: `${slot.subject.name} in 15 minutes`,
            body: `${slot.startTime}–${slot.endTime}${slot.room ? " · " + slot.room : ""}`,
          });
        }
      }
    } catch (e) {
      console.error("Reminder scheduler error:", e.message);
    }
  });

  // Runs daily at 8 AM IST: alerts if any subject/type has dropped below its threshold.
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        const users = await prisma.user.findMany({ where: { lowAttendanceAlertsEnabled: true } });

        for (const user of users) {
          const semester = await prisma.semester.findFirst({ where: { userId: user.id, isActive: true } });
          if (!semester) continue;

          const subjects = await prisma.subject.findMany({ where: { semesterId: semester.id, archived: false } });

          for (const subject of subjects) {
            const records = await prisma.attendanceRecord.findMany({
              where: { subjectId: subject.id },
              include: { slot: true },
            });
            const byType = { lecture: [], tutorial: [], practical: [] };
            for (const r of records) {
              const t = r.slot?.type || "lecture";
              if (byType[t]) byType[t].push(r);
            }

            for (const type of ["lecture", "tutorial", "practical"]) {
              if (byType[type].length === 0) continue;
              const threshold = thresholdForType(subject, type);
              const stats = computeStats(byType[type], threshold);
              if (stats.percentage < threshold) {
                await sendPushToUser(prisma, user.id, {
                  title: `${subject.name} attendance is low`,
                  body: `${type} attendance is at ${Math.round(stats.percentage)}%, below your ${threshold}% goal.`,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Low attendance scheduler error:", e.message);
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}

module.exports = { startScheduler };