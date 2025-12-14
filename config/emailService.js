const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // must be false for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// verify once at server start (optional but recommended)
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP error:", error);
  } else {
    console.log("SMTP server is ready to send emails");
  }
});

exports.sendBulkEmail = async ({ to, subject, text }) => {
  return transporter.sendMail({
    from: `"Hourlee Admin" <${process.env.SMTP_USER}>`,
    to,                    // comma-separated emails
    subject,
    text
  });
};
