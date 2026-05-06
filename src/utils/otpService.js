function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const otpStore = {};

const OTP_EXPIRES_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function saveOtp(email, otp) {
  const normalizedEmail = normalizeEmail(email);

  otpStore[normalizedEmail] = {
    otp,
    expiresAt: Date.now() + OTP_EXPIRES_MS,
    lastSentAt: Date.now(),
  };
}

function verifyOtp(email, otp) {
  const normalizedEmail = normalizeEmail(email);
  const record = otpStore[normalizedEmail];

  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    delete otpStore[normalizedEmail];
    return false;
  }

  const isValid = record.otp === String(otp).trim();

  if (isValid) {
    delete otpStore[normalizedEmail];
  }

  return isValid;
}

function getOtpCooldown(email) {
  const normalizedEmail = normalizeEmail(email);
  const record = otpStore[normalizedEmail];

  if (!record || !record.lastSentAt) return 0;

  const elapsed = Date.now() - record.lastSentAt;
  const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;

  if (remaining <= 0) return 0;

  return Math.ceil(remaining / 1000);
}

function clearOtp(email) {
  const normalizedEmail = normalizeEmail(email);
  delete otpStore[normalizedEmail];
}

module.exports = {
  generateOtp,
  saveOtp,
  verifyOtp,
  getOtpCooldown,
  clearOtp,
};