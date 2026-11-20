import nodemailer from 'nodemailer';
import { env } from '../../common/config/env.js';

let transporter;

export function isEmailProviderConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
}

export async function sendEmail(message) {
  if (!isEmailProviderConfigured()) {
    throw new Error('SMTP is not configured; set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM');
  }

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });

  return transporter.sendMail({
    from: env.SMTP_FROM,
    ...message,
  });
}

export default { isEmailProviderConfigured, sendEmail };
