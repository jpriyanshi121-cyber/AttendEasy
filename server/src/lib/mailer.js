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
    <div style="background:#FCFBFE; padding:32px 16px; font-family: Inter, -apple-system, 'Segoe UI', sans-serif;">
      <div style="max-width:480px; margin:0 auto; background:#FFFFFF; border:1px solid rgba(110,79,145,0.1); border-radius:14px; padding:32px;">
        <div style="display:inline-block; padding:6px 14px; background:#EFE7F9; color:#6E4F91; font-size:12px; font-weight:600; letter-spacing:0.02em; border-radius:999px; margin-bottom:20px;">AttendEasy</div>
        <h2 style="color:#2A2140; font-size:20px; font-weight:500; margin:0 0 12px;">Reset your password</h2>
        <p style="color:#2A2140; font-size:15px; line-height:1.6; margin:0 0 24px;">We received a request to reset your AttendEasy password. Click below to choose a new one. This link expires in 15 minutes.</p>
        <a href="${resetLink}" style="display:inline-block; padding:12px 28px; background:#6E4F91; color:#FFFFFF; text-decoration:none; font-weight:500; font-size:15px; border-radius:12px;">Reset Password</a>
        <p style="color:#8A8194; font-size:13px; line-height:1.5; margin:28px 0 0; padding-top:20px; border-top:1px solid rgba(110,79,145,0.1);">If you didn't request this, you can safely ignore this email.</p>
      </div>
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