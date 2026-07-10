import "server-only";
import { ImapFlow, type MailboxLockObject } from "imapflow";
import { getImapConfig, type ImapConfig } from "@/src/config/env";
import { toSafeError } from "@/src/errors/safe-error";

export interface ImapConnectionOptions { mailbox?: string; readOnly?: boolean }

export async function withImapConnection<T>(
  operation: (client: ImapFlow) => Promise<T>,
  options: ImapConnectionOptions = {},
  config: ImapConfig = getImapConfig(),
): Promise<T> {
  const client = new ImapFlow({
    host: config.IMAP_HOST,
    port: config.IMAP_PORT,
    secure: config.IMAP_SECURE,
    ...(config.IMAP_SECURE ? {} : { doSTARTTLS: true }),
    tls: { rejectUnauthorized: true, servername: config.IMAP_HOST },
    auth: { user: config.MAIL_ADDRESS, pass: config.MAIL_PASSWORD },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    maxLineLength: 1024 * 1024,
    maxLiteralSize: config.MAX_EMAIL_SIZE_BYTES + 1024,
  });
  let lock: MailboxLockObject | undefined;
  try {
    await client.connect();
    if (options.mailbox) {
      lock = await client.getMailboxLock(options.mailbox, {
        readOnly: options.readOnly ?? true,
        acquireTimeout: 10_000,
        maxLockHoldTime: 30_000,
      });
    }
    return await operation(client);
  } catch (error) {
    throw toSafeError(error);
  } finally {
    lock?.release();
    if (client.usable && client.authenticated) {
      try { await client.logout(); } catch { client.close(); }
    } else {
      client.close();
    }
  }
}
