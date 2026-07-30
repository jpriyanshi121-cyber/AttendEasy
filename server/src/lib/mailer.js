const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendResetEmail(to, resetLink) {
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