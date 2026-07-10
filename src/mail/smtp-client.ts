import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type StreamTransport from "nodemailer/lib/stream-transport";
import { getSmtpConfig } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";
import type { SendEmailInput, SendResult } from "@/src/mail/types";

function normalizeAddresses(values: unknown): string[] {
  return Array.isArray(values) ? values.map((value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "address" in value && typeof value.address === "string") return value.address;
    return "";
  }).filter(Boolean) : [];
}

export async function buildMimeMessage(input: SendEmailInput): Promise<Buffer> {
  const config = getSmtpConfig();
  const options: StreamTransport.Options = { streamTransport: true, buffer: true, newline: "unix" };
  const transport = nodemailer.createTransport(options);
  try {
    const info = await transport.sendMail({
      from: config.MAIL_ADDRESS, to: input.to, cc: input.cc, bcc: input.bcc,
      subject: input.subject, text: input.text,
      disableFileAccess: true, disableUrlAccess: true,
    });
    if (!Buffer.isBuffer(info.message)) throw new SafeError("INTERNAL_ERROR", "The draft message could not be created.");
    return info.message;
  } finally {
    transport.close();
  }
}

export async function sendSmtpEmail(input: SendEmailInput): Promise<SendResult> {
  const config = getSmtpConfig();
  const options: SMTPTransport.Options = {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: true,
    auth: { user: config.MAIL_ADDRESS, pass: config.MAIL_PASSWORD },
    tls: { rejectUnauthorized: true, servername: config.SMTP_HOST },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  };
  const transport = nodemailer.createTransport(options);
  try {
    const info = await transport.sendMail({
      from: config.MAIL_ADDRESS, to: input.to, cc: input.cc, bcc: input.bcc,
      subject: input.subject, text: input.text,
      disableFileAccess: true, disableUrlAccess: true,
    });
    return {
      accepted: normalizeAddresses(info.accepted),
      rejected: normalizeAddresses(info.rejected),
      messageId: typeof info.messageId === "string" ? info.messageId : null,
      success: true,
    };
  } catch (error) {
    throw new SafeError("SEND_FAILED", "The email could not be sent.", { cause: error });
  } finally {
    transport.close();
  }
}
