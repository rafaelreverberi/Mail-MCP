import "server-only";
import type { FetchMessageObject, ImapFlow, MessageAddressObject, SearchObject } from "imapflow";
import { getImapConfig, parseEnvironment } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";
import { withImapConnection } from "@/src/mail/imap-client";
import { findSpecialMailbox, hasAttachments, inferSpecialUse } from "@/src/mail/mailbox-utils";
import { parseEmailSource } from "@/src/mail/mail-parser";
import { buildMimeMessage, sendSmtpEmail } from "@/src/mail/smtp-client";
import type { DeleteEmailInput, DraftInput, EmailAddress, EmailSearchQuery, EmailSearchResult, MailService, MarkEmailInput, MoveEmailInput, ReadEmailsResult, SendEmailInput } from "@/src/mail/types";

function addresses(values?: MessageAddressObject[]): EmailAddress[] {
  return (values ?? []).map((value) => ({ name: value.name ?? "", address: value.address ?? "" }));
}

function isoDate(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSearchResult(message: FetchMessageObject): EmailSearchResult {
  return {
    uid: message.uid,
    messageId: message.envelope?.messageId ?? null,
    subject: message.envelope?.subject ?? "",
    from: addresses(message.envelope?.from),
    to: addresses(message.envelope?.to),
    date: isoDate(message.envelope?.date),
    flags: [...(message.flags ?? [])].sort(),
    size: message.size ?? null,
    hasAttachments: hasAttachments(message.bodyStructure),
  };
}

function toImapSearch(query: EmailSearchQuery): SearchObject {
  return {
    all: true,
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    ...(query.subject === undefined ? {} : { subject: query.subject }),
    ...(query.text === undefined ? {} : { text: query.text }),
    ...(query.since === undefined ? {} : { since: query.since }),
    ...(query.before === undefined ? {} : { before: query.before }),
    ...(query.unread === undefined ? {} : { seen: !query.unread }),
    ...(query.flagged === undefined ? {} : { flagged: query.flagged }),
  };
}

async function ensureUidsExist(client: ImapFlow, uids: number[]): Promise<void> {
  const messages = await client.fetchAll(uids, { uid: true }, { uid: true });
  const found = new Set(messages.map((message) => message.uid));
  if (uids.some((uid) => !found.has(uid))) throw new SafeError("EMAIL_NOT_FOUND", "At least one requested email UID was not found.");
}

export class ImapMailService implements MailService {
  private ensureWritesEnabled(): void {
    if (!parseEnvironment().WRITE_ACTIONS_ENABLED) throw new SafeError("WRITES_DISABLED", "Write actions are disabled by server configuration.");
  }

  async checkConnection(): Promise<boolean> {
    return withImapConnection(async () => true);
  }

  async listMailboxes() {
    return withImapConnection(async (client) => {
      const mailboxes = await client.list();
      return mailboxes.map((mailbox) => ({
        path: mailbox.path,
        name: mailbox.name,
        delimiter: mailbox.delimiter || null,
        specialUse: inferSpecialUse(mailbox.path, mailbox.specialUse),
        subscribed: mailbox.subscribed,
      }));
    });
  }

  async searchEmails(query: EmailSearchQuery): Promise<EmailSearchResult[]> {
    return withImapConnection(async (client) => {
      const matches = await client.search(toImapSearch(query), { uid: true });
      if (!matches) return [];
      const selected = matches.sort((a, b) => b - a).slice(0, query.limit);
      if (selected.length === 0) return [];
      const messages = await client.fetchAll(selected, {
        uid: true, envelope: true, flags: true, size: true, bodyStructure: true,
      }, { uid: true });
      return messages.map(toSearchResult).sort((a, b) => b.uid - a.uid);
    }, { mailbox: query.mailbox, readOnly: true });
  }

  async readEmails(mailbox: string, uids: number[], maxBodyCharacters: number): Promise<ReadEmailsResult> {
    const config = getImapConfig();
    return withImapConnection(async (client) => {
      const metadata = await client.fetchAll(uids, { uid: true, size: true, flags: true }, { uid: true });
      const byUid = new Map(metadata.map((message) => [message.uid, message]));
      for (const uid of uids) {
        const message = byUid.get(uid);
        if (!message) throw new SafeError("EMAIL_NOT_FOUND", `Email UID ${uid} was not found.`);
        if (message.size !== undefined && message.size > config.MAX_EMAIL_SIZE_BYTES) {
          throw new SafeError("EMAIL_TOO_LARGE", `Email UID ${uid} exceeds the configured size limit.`);
        }
      }
      const sources = await client.fetchAll(uids, {
        uid: true,
        source: { start: 0, maxLength: config.MAX_EMAIL_SIZE_BYTES + 1 },
      }, { uid: true });
      const sourceByUid = new Map(sources.map((message) => [message.uid, message.source]));
      const emails = [];
      for (const uid of uids) {
        const source = sourceByUid.get(uid);
        if (!source) throw new SafeError("EMAIL_NOT_FOUND", `Email UID ${uid} was not found.`);
        if (source.length > config.MAX_EMAIL_SIZE_BYTES) {
          throw new SafeError("EMAIL_TOO_LARGE", `Email UID ${uid} exceeds the configured size limit.`);
        }
        const flags = [...(byUid.get(uid)?.flags ?? [])].sort();
        emails.push(await parseEmailSource(source, uid, flags, maxBodyCharacters));
      }
      return { mailbox, emails };
    }, { mailbox, readOnly: true }, config);
  }

  async markEmail(input: MarkEmailInput) {
    this.ensureWritesEnabled();
    return withImapConnection(async (client) => {
      await ensureUidsExist(client, input.uids);
      if (input.read !== undefined) {
        const success = input.read
          ? await client.messageFlagsAdd(input.uids, ["\\Seen"], { uid: true, silent: true })
          : await client.messageFlagsRemove(input.uids, ["\\Seen"], { uid: true, silent: true });
        if (!success) throw new SafeError("EMAIL_NOT_FOUND", "No matching emails could be marked.");
      }
      if (input.flagged !== undefined) {
        const success = input.flagged
          ? await client.messageFlagsAdd(input.uids, ["\\Flagged"], { uid: true, silent: true })
          : await client.messageFlagsRemove(input.uids, ["\\Flagged"], { uid: true, silent: true });
        if (!success) throw new SafeError("EMAIL_NOT_FOUND", "No matching emails could be marked.");
      }
      return { mailbox: input.mailbox, uids: input.uids, success: true as const };
    }, { mailbox: input.mailbox, readOnly: false });
  }

  async moveEmail(input: MoveEmailInput) {
    this.ensureWritesEnabled();
    return withImapConnection(async (client) => {
      await ensureUidsExist(client, input.uids);
      const mailboxes = await client.list();
      if (!mailboxes.some((mailbox) => mailbox.path === input.destination)) throw new SafeError("MAILBOX_NOT_FOUND", "The destination mailbox was not found.");
      const result = await client.messageMove(input.uids, input.destination, { uid: true });
      if (!result) throw new SafeError("EMAIL_NOT_FOUND", "No matching emails could be moved.");
      return { mailbox: input.mailbox, destination: input.destination, uids: input.uids, success: true as const };
    }, { mailbox: input.mailbox, readOnly: false });
  }

  async createMailbox(path: string) {
    this.ensureWritesEnabled();
    return withImapConnection(async (client) => {
      const result = await client.mailboxCreate(path);
      return { path: result.path, created: result.created };
    });
  }

  async createDraft(input: DraftInput) {
    this.ensureWritesEnabled();
    const raw = await buildMimeMessage(input);
    return withImapConnection(async (client) => {
      const mailboxes = await client.list();
      const drafts = findSpecialMailbox(mailboxes, "\\Drafts");
      if (!drafts) throw new SafeError("MAILBOX_NOT_FOUND", "A drafts mailbox could not be identified.");
      const result = await client.append(drafts, raw, ["\\Draft"]);
      if (!result) throw new SafeError("IMAP_CONNECTION_FAILED", "The draft could not be stored.");
      return { mailbox: drafts, uid: result.uid ?? null, success: true as const };
    });
  }

  async sendEmail(input: SendEmailInput) {
    this.ensureWritesEnabled();
    return sendSmtpEmail(input);
  }

  async deleteEmail(input: DeleteEmailInput) {
    this.ensureWritesEnabled();
    return withImapConnection(async (client) => {
      const mailboxes = await client.list();
      const trash = findSpecialMailbox(mailboxes, "\\Trash");
      if (!trash) throw new SafeError("MAILBOX_NOT_FOUND", "A trash mailbox could not be identified.");
      if (trash === input.mailbox) throw new SafeError("INVALID_INPUT", "Emails already in Trash cannot be permanently deleted.");
      await ensureUidsExist(client, input.uids);
      const result = await client.messageMove(input.uids, trash, { uid: true });
      if (!result) throw new SafeError("EMAIL_NOT_FOUND", "No matching emails could be moved to Trash.");
      return { mailbox: input.mailbox, destination: trash, uids: input.uids, success: true as const };
    }, { mailbox: input.mailbox, readOnly: false });
  }
}
