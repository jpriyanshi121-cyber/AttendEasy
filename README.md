# AttendEasy

A mobile-first attendance management app for college students — track classes, manage subjects and timetables, and import your academic calendar with AI.

**Live demo:** https://attend-easy-blond.vercel.app/

## Features

- **Attendance tracking** — mark Present / Absent / Cancelled / Rescheduled per class, with notes and cancellation reasons. Records are unique per `(slot, date)` to prevent duplicates.
- **Subjects** — name, code, color, icon; per-type support for Lecture, Tutorial, and Practical, each with its own attendance threshold (default 75%). Subjects can be archived.
- **Timetable** — recurring weekly slots (day, time, subject, type, room, professor) plus one-off extra/rescheduled classes linked back to the original slot.
- **Semesters** — group subjects, slots, records, and holidays per semester, with active/archive status.
- **AI schedule import** — upload a PDF/image of your academic calendar or timetable (PDF, JPEG, PNG, WEBP, HEIC/HEIF, up to 15MB); Gemini extracts semester dates, holidays, subjects, and class slots, streamed to the frontend as it processes.
- **Push notifications** — browser push for attendance reminders and low-attendance alerts, with per-user preferences.
- **Auth & security** — JWT auth, bcrypt password hashing, per-user rate limiting, Helmet headers, CORS restricted to `FRONTEND_URL`.

## Tech Stack

**Client:** React 18 + Vite 6, TypeScript, Tailwind CSS 4, Motion (animations), Lucide icons, Canvas Confetti

**Server:** Node.js + Express, Prisma + PostgreSQL, JWT, bcryptjs, Multer, Nodemailer, Web Push, Node Cron, PDFKit, Helmet, express-validator, express-rate-limit

**AI:** Google Gemini API (streaming generation, with a non-streaming fallback) for structured calendar/timetable extraction

## Project Structure

```
AttendEasy/
├── client/                  React + Vite frontend
│   └── src/
│       ├── app/             App.tsx, AuthScreen, ResetPasswordScreen, SmartImportScreen
│       ├── lib/              api.ts, push.ts, sound.ts
│       └── styles/
└── server/                  Node + Express backend
    ├── prisma/               schema.prisma + migrations
    └── src/
        ├── routes/           auth, semesters, subjects, slots, records, holidays, push, ai
        ├── middleware/        auth.js
        └── lib/               mailer, push, scheduler, stats, ownership
```

## Data Model

```
User ──< PushSubscription
     └─< Semester ──< Subject ──< Slot
                   ├─< Slot
                   ├─< AttendanceRecord
                   └─< Holiday
```

Defined in `server/prisma/schema.prisma`.

## Getting Started

**Prerequisites:** Node.js, npm, a PostgreSQL database, and (for AI import) a Google Gemini API key.

```bash
git clone https://github.com/jpriyanshi121-cyber/AttendEasy.git
cd AttendEasy

# frontend
cd client && npm install

# backend (new terminal)
cd server && npm install
```

### Environment variables

Copy `server/.env.example` to `server/.env` and fill in:

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
DIRECT_URL=postgresql://user:pass@direct-host/db?sslmode=require
JWT_SECRET=replace-with-a-long-random-string
FRONTEND_URL=https://your-deployed-frontend-url.com
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-16-char-gmail-app-password
VAPID_SUBJECT=mailto:your-email@gmail.com
VAPID_PUBLIC_KEY=generate-with-npx-web-push-generate-vapid-keys
VAPID_PRIVATE_KEY=generate-with-npx-web-push-generate-vapid-keys
GEMINI_API_KEY=your-gemini-api-key
PORT=4000
NODE_ENV=development
```

### Database

```bash
cd server
npx prisma generate
npx prisma migrate dev      # local dev
npx prisma studio           # optional: browse data
```

### Run

```bash
# backend — http://localhost:4000
cd server && npm run dev

# frontend
cd client && npm run dev
```

## Backend Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend with Nodemon |
| `npm start` | Start backend normally |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Create/apply dev migrations |
| `npm run migrate:deploy` | Apply production migrations |
| `npm run prisma:studio` | Open Prisma Studio |

## Author

**Priyanshi Jain** — CSE student, building AttendEasy to make attendance management easier for students.

## License

Not yet specified. Consider adding an MIT license if you plan to open-source this.
