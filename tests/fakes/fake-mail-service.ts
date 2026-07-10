import type {
  DeleteEmailInput, EmailSearchQuery, MailService, MailboxSummary, EmailSearchResult,
  MarkEmailInput, MoveEmailInput, ReadEmailsResult, SendEmailInput,
} from "@/src/mail/types";
import { EMAIL_CONTENT_TRUST } from "@/src/security/untrusted-content";

export class FakeMailService implements MailService {
  lastSearch: EmailSearchQuery | undefined;
  lastRead: { mailbox: string; uids: number[]; maximum: number } | undefined;
  lastSent: SendEmailInput | undefined;
  lastDeleted: DeleteEmailInput | undefined;
  sendCount = 0;
  deleteCount = 0;
  reachable = true;

  async checkConnection() { return this.reachable; }
  async listMailboxes(): Promise<MailboxSummary[]> { return [{ path: "INBOX", name: "INBOX", delimiter: "/", specialUse: "\\Inbox", subscribed: true }]; }
  async searchEmails(query: EmailSearchQuery): Promise<EmailSearchResult[]> {
    this.lastSearch = query;
    return [{ uid: 42, messageId: null, subject: "Test", from: [], to: [], date: null, flags: [], size: 120, hasAttachments: false }];
  }
  async readEmails(mailbox: string, uids: number[], maximum: number): Promise<ReadEmailsResult> {
    this.lastRead = { mailbox, uids, maximum };
    return { mailbox, emails: uids.map((uid) => ({
      uid, messageId: null, subject: "", from: "", to: "", cc: "", date: null, flags: [], body: "safe text",
      bodyTruncated: false, attachments: [], contentTrust: EMAIL_CONTENT_TRUST,
    })) };
  }
  async markEmail(input: MarkEmailInput) { return { mailbox: input.mailbox, uids: input.uids, success: true as const }; }
  async moveEmail(input: MoveEmailInput) { return { mailbox: input.mailbox, destination: input.destination, uids: input.uids, success: true as const }; }
  async createMailbox(path: string) { return { path, created: true }; }
  async createDraft() { return { mailbox: "Drafts", uid: 501, success: true as const }; }
  async sendEmail(input: SendEmailInput) {
    this.lastSent = structuredClone(input); this.sendCount += 1;
    return { accepted: input.to, rejected: [], messageId: "synthetic-message-id", success: true as const };
  }
  async deleteEmail(input: DeleteEmailInput) {
    this.lastDeleted = structuredClone(input); this.deleteCount += 1;
    return { mailbox: input.mailbox, destination: "Trash", uids: input.uids, success: true as const };
  }
}
