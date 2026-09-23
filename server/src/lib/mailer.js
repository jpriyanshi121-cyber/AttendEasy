const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

function buildRawMessage({ to, from, subject, html }) {
  const messageParts = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ];
  const message = messageParts.join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendResetEmail(to, resetLink) {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#6E4F91;">Reset your password</h2>
      <p>We received a request to reset your AttendEasy password. Click below to choose a new one. This link expires in 15 minutes.</p>
      <a href="${resetLink}" style="display:inline-block; padding:12px 24px; background:#6E4F91; color:#fff; text-decoration:none; border-radius:10px; margin:16px 0;">Reset Password</a>
      <p style="color:#888; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const raw = buildRawMessage({
    to,
    from: `"AttendEasy" <${process.env.EMAIL_USER}>`,
    subject: "Reset your AttendEasy password",
    html,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

module.exports = { sendResetEmail };