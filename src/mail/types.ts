import type { EMAIL_CONTENT_TRUST } from "@/src/security/untrusted-content";

export interface MailboxSummary { path: string; name: string; delimiter: string | null; specialUse: string | null; subscribed: boolean }
export interface EmailAddress { name: string; address: string }
export interface EmailSearchQuery {
  mailbox: string; from?: string; to?: string; subject?: string; text?: string; since?: Date; before?: Date;
  unread?: boolean; flagged?: boolean; limit: number;
}
export interface EmailSearchResult {
  uid: number; messageId: string | null; subject: string; from: EmailAddress[]; to: EmailAddress[];
  date: string | null; flags: string[]; size: number | null; hasAttachments: boolean | null;
}
export interface AttachmentMetadata { index: number; filename: string; contentType: string; size: number; contentId: string | null }
export interface ReadEmailResult {
  uid: number; messageId: string | null; subject: string; from: string; to: string; cc: string; date: string | null;
  flags: string[]; body: string; bodyTruncated: boolean; attachments: AttachmentMetadata[];
  contentTrust: typeof EMAIL_CONTENT_TRUST;
}
export interface ReadEmailsResult { mailbox: string; emails: ReadEmailResult[] }

export interface MarkEmailInput { mailbox: string; uids: number[]; read?: boolean; flagged?: boolean }
export interface MoveEmailInput { mailbox: string; uids: number[]; destination: string }
export interface DraftInput { to: string[]; cc: string[]; bcc: string[]; subject: string; text: string }
export type SendEmailInput = DraftInput;
export interface DeleteEmailInput { mailbox: string; uids: number[] }
export interface MutationResult { mailbox: string; uids: number[]; success: true }
export interface MoveResult extends MutationResult { destination: string }
export interface DraftResult { mailbox: string; uid: number | null; success: true }
export interface SendResult { accepted: string[]; rejected: string[]; messageId: string | null; success: true }

export interface MailService {
  checkConnection(): Promise<boolean>;
  listMailboxes(): Promise<MailboxSummary[]>;
  searchEmails(query: EmailSearchQuery): Promise<EmailSearchResult[]>;
  readEmails(mailbox: string, uids: number[], maxBodyCharacters: number): Promise<ReadEmailsResult>;
  markEmail(input: MarkEmailInput): Promise<MutationResult>;
  moveEmail(input: MoveEmailInput): Promise<MoveResult>;
  createMailbox(path: string): Promise<{ path: string; created: boolean }>;
  createDraft(input: DraftInput): Promise<DraftResult>;
  sendEmail(input: SendEmailInput): Promise<SendResult>;
  deleteEmail(input: DeleteEmailInput): Promise<MoveResult>;
}
