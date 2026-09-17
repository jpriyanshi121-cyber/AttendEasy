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

        // Declared holiday for today (confirmed = definitely no classes) —
        // skip every slot for this user without even checking them.
        const holiday = await prisma.holiday.findUnique({
          where: { semesterId_date: { semesterId: semester.id, date: todayStart } },
        });
        if (holiday && holiday.confirmed) continue;

        const recurring = await prisma.slot.findMany({
          where: { semesterId: semester.id, day: ourDay, isExtra: false, startTime: targetTime, retiredAt: null },
          include: { subject: true },
        });
        const extras = await prisma.slot.findMany({
          where: { semesterId: semester.id, isExtra: true, extraDate: todayStart, startTime: targetTime, retiredAt: null },
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

        const candidates = [...activeRecurring, ...extras];
        if (candidates.length === 0) continue;

        // A specific class can also be cancelled individually (prof absent,
        // exam, etc.) without a semester-wide holiday — that's recorded as
        // an AttendanceRecord with status "cancelled"/"rescheduled" for this
        // exact slot+date. Skip the reminder for those too.
        const cancelledRecords = await prisma.attendanceRecord.findMany({
          where: {
            slotId: { in: candidates.map((s) => s.id) },
            date: todayStart,
            status: { in: ["cancelled", "rescheduled"] },
          },
          select: { slotId: true },
        });
        const cancelledSlotIds = new Set(cancelledRecords.map((r) => r.slotId));

        for (const slot of candidates) {
          if (cancelledSlotIds.has(slot.id)) continue;
          const typeSuffix = slot.type === "practical" ? " (Lab)" : slot.type === "tutorial" ? " (Tutorial)" : "";
          await sendPushToUser(prisma, user.id, {
            title: `${slot.subject.name}${typeSuffix} in 15 minutes`,
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

// Render's free tier spins the whole service down after ~15 minutes with
// no incoming request, which then takes 30-60s to cold-start back up on
// the next real visit — this is very likely what "app load ho rahe waqt
// time lag raha hai" was actually seeing. Pinging our own public
// /api/ping well under that 15-minute window keeps the service counted
// as "active" so it never spins down in the first place. Deliberately
// NOT /api/health here — that one queries Postgres, and doing that every
// 10 minutes would keep a Neon-style free-tier database's compute
// endpoint awake around the clock, burning through its monthly
// compute-hour budget in days rather than letting it idle-suspend
// between real requests like it's meant to. RENDER_EXTERNAL_URL is set
// automatically by Render for every web service; this is a no-op
// anywhere else (local dev, or a host that doesn't set it), since
// there's nothing to keep warm without a real deployed URL to hit.
function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (!selfUrl) return;

  const ping = async () => {
    try {
      const res = await fetch(`${selfUrl.replace(/\/$/, "")}/api/ping`);
      if (!res.ok) console.error("Keep-alive ping got a non-OK response:", res.status);
    } catch (e) {
      console.error("Keep-alive ping failed:", e.message);
    }
  };

  ping(); // once immediately, then every 10 minutes (safely under the 15-min idle timeout)
  setInterval(ping, 10 * 60 * 1000);
}

module.exports = { startScheduler, startKeepAlive };