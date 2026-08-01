const cron = require("node-cron");
const prisma = require("../db");
const { sendPushToUser } = require("./push");
const { computeStats, thresholdForType } = require("./stats");

function startScheduler() {
  // Runs every minute: sends a push 15 minutes before each class starts.
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const target = new Date(now.getTime() + 15 * 60000);
      const targetTime = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
      const ourDay = (now.getDay() + 6) % 7;
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

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

        for (const slot of [...recurring, ...extras]) {
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

  // Runs daily at 8 AM: alerts if any subject/type has dropped below its threshold.
  cron.schedule("0 8 * * *", async () => {
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
  });
}

module.exports = { startScheduler };