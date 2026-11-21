import nodemailer from 'nodemailer';
import { env } from './config/env.js';
import { ServiceError } from './errors.js';

let transporter;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) {
    throw new ServiceError(
      'Email delivery is not configured',
      503,
      'EMAIL_PROVIDER_NOT_CONFIGURED'
    );
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
  return transporter;
}

export async function sendEmail(message) {
  try {
    return await getTransporter().sendMail({
      from: env.SMTP_FROM,
      ...message,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    console.error('Notification Service email provider failed:', error);
    throw new ServiceError('Email provider failed to deliver the notification', 502, 'EMAIL_DELIVERY_FAILED');
  }
}

export default { sendEmail };
