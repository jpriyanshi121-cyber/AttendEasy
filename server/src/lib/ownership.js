const prisma = require("../db");

// Confirms the semester exists and belongs to userId. Returns the
// semester or null. Every route that touches subjects/slots/records
// uses this first so one user can never read or write another
// user's data by guessing an id.
async function getOwnedSemester(semesterId, userId) {
  const semester = await prisma.semester.findFirst({
    where: { id: semesterId, userId },
  });
  return semester;
}

module.exports = { getOwnedSemester };
