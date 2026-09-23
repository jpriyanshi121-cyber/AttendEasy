const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

async function getTransporter() {
  const accessToken = await oauth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

async function sendResetEmail(to, resetLink) {
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: `"AttendEasy" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Reset your AttendEasy password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#6E4F91;">Reset your password</h2>
        <p>We received a request to reset your AttendEasy password. Click below to choose a new one. This link expires in 15 minutes.</p>
        <a href="${resetLink}" style="display:inline-block; padding:12px 24px; background:#6E4F91; color:#fff; text-decoration:none; border-radius:10px; margin:16px 0;">Reset Password</a>
        <p style="color:#888; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendResetEmail };