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
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AttendEasy — Reset Password Email</title>
</head>
<body style="margin:0; padding:40px 20px; background:linear-gradient(160deg,#201730,#2E2044 45%,#1B1428); font-family:Arial,Helvetica,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#FCFBFE; border-radius:22px; box-shadow:0 24px 60px rgba(15,8,28,0.4);">
    <tr>
      <td style="padding:40px 40px 34px;">

        <!-- brand -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="width:38px; height:38px; border-radius:11px; background:linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266); text-align:center; vertical-align:middle; box-shadow:0 8px 18px rgba(94,63,138,0.35);">
              <span style="font-family:Georgia,'Times New Roman',serif; font-weight:bold; font-size:17px; color:#ffffff; line-height:38px;">A</span>
            </td>
            <td style="padding-left:11px; font-family:Georgia,'Times New Roman',serif; font-weight:bold; font-size:18px; color:#1B1530;">AttendEasy</td>
          </tr>
        </table>

        <div style="font-family:'Courier New',monospace; font-size:10.5px; letter-spacing:1.5px; text-transform:uppercase; color:#6E4F91; font-weight:bold; margin-bottom:10px;">Password Reset &nbsp;&bull;</div>

        <h1 style="font-family:Georgia,'Times New Roman',serif; font-weight:bold; font-size:26px; color:#1B1530; margin:0 0 16px; letter-spacing:-0.3px;">Reset your password</h1>

        <p style="font-family:Arial,Helvetica,sans-serif; font-size:14.5px; line-height:1.65; color:#5C5768; margin:0 0 28px;">
          We received a request to reset your AttendEasy password. Click below to choose a new one. This link expires in <strong style="color:#2A2140;">15 minutes</strong>.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius:14px; background:linear-gradient(155deg,#8E6BB8,#6E4F91 55%,#4A3266); box-shadow:0 14px 28px rgba(94,63,138,0.38);">
              <a href="${resetLink}" style="display:inline-block; padding:15px 32px; font-family:Arial,Helvetica,sans-serif; font-weight:bold; font-size:15px; color:#ffffff; text-decoration:none; border-radius:14px;">
                Reset Password &rarr;
              </a>
            </td>
          </tr>
        </table>

        <div style="height:1px; background:#EFEAF6; margin:32px 0 20px;"></div>

        <p style="font-family:Arial,Helvetica,sans-serif; font-size:12.5px; line-height:1.6; color:#ABA6BB; margin:0;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </td>
    </tr>
  </table>

  <div style="text-align:center; font-family:'Courier New',monospace; font-size:10px; letter-spacing:1px; color:#8877A3; text-transform:uppercase; margin-top:22px;">AttendEasy &middot; IGDTUW</div>

</body>
</html>
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