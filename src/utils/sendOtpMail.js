const nodemailer = require("nodemailer");
require("dotenv").config();

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
const smtpUser = process.env.SMTP_USER || process.env.GMAIL;
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

async function sendOtpMail(to, otp) {
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP chưa được cấu hình");
  }

  const from = process.env.EMAIL_FROM || `"Matewear" <${smtpUser}>`;

  const mailOptions = {
    from,
    to,
    subject: "Mã OTP đặt lại mật khẩu Matewear",
    text: `Mã OTP đặt lại mật khẩu của bạn là: ${otp}. Mã này hết hạn sau 5 phút.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin-bottom: 8px;">Đặt lại mật khẩu Matewear</h2>
        <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Matewear.</p>
        <p>Mã OTP của bạn là:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">
          ${otp}
        </div>
        <p>Mã này hết hạn sau <strong>5 phút</strong>.</p>
        <p>Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("Đã gửi OTP đặt lại mật khẩu:", info.messageId);
  return info;
}

module.exports = sendOtpMail;