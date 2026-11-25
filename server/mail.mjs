// Outgoing email. With no SMTP_HOST configured (development), the message is printed to the server console instead.
const { SMTP_HOST, SMTP_PORT = 587, SMTP_USER, SMTP_PASS, MAIL_FROM = 'Gondo Motors <no-reply@gondomotors.com>' } = process.env;
let transport;

export async function sendMail({ to, subject, text }) {
  if (!SMTP_HOST) {
    console.log(`\n--- Email not sent (SMTP not configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n--------------------------------------------\n`);
    return;
  }
  if (!transport) {
    const { createTransport } = await import('nodemailer');
    transport = createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: +SMTP_PORT === 465, auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined });
  }
  await transport.sendMail({ from: MAIL_FROM, to, subject, text });
}
