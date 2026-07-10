import { z } from "zod";
import { LIMITS } from "@/src/security/limits";

const noControlCharacters = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);
const mailbox = z.string().trim().min(1).max(LIMITS.mailboxCharacters).refine(noControlCharacters, "Control characters are not allowed.");
const searchTerm = z.string().trim().min(1).max(LIMITS.searchTermCharacters).refine(noControlCharacters, "Control characters are not allowed.");
const strictDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));
const uid = z.number().int().positive().max(LIMITS.uidMaximum);
const writeUids = z.array(uid).min(1).max(LIMITS.writeUidCount).refine((values) => new Set(values).size === values.length, "UIDs must be unique.");
const email = z.string().trim().email().max(320);
const recipients = z.array(email).max(LIMITS.recipientCountAbsolute).default([]);
const subject = z.string().max(LIMITS.subjectCharacters).refine(noControlCharacters, "Subject control characters are not allowed.");
const messageBody = z.string().min(1).max(LIMITS.sendBodyCharactersAbsolute);
const confirmationToken = z.string().min(40).max(LIMITS.confirmationTokenCharacters).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const healthCheckInputSchema = z.object({ checkImap: z.boolean().optional().default(false) }).strict();

export const searchEmailsInputSchema = z.object({
  mailbox: mailbox.optional().default("INBOX"),
  from: searchTerm.optional(),
  to: searchTerm.optional(),
  subject: searchTerm.optional(),
  text: searchTerm.optional(),
  since: strictDate.optional(),
  before: strictDate.optional(),
  unread: z.boolean().optional(),
  flagged: z.boolean().optional(),
  limit: z.number().int().min(1).max(LIMITS.searchResultsAbsolute).optional(),
}).strict().refine((value) => !value.since || !value.before || value.since < value.before, {
  message: "since must be earlier than before.", path: ["before"],
});

export const readEmailsInputSchema = z.object({
  mailbox: mailbox.optional().default("INBOX"),
  uids: z.array(uid).min(1).max(LIMITS.readEmailCount).refine((values) => new Set(values).size === values.length, "UIDs must be unique."),
  maxBodyCharacters: z.number().int().min(100).max(LIMITS.bodyCharactersAbsolute).optional(),
}).strict();

export const listMailboxesInputSchema = z.object({}).strict();

export const markEmailInputSchema = z.object({
  mailbox: mailbox.optional().default("INBOX"), uids: writeUids, read: z.boolean().optional(), flagged: z.boolean().optional(),
}).strict().refine((value) => value.read !== undefined || value.flagged !== undefined, "At least one mark operation is required.");
export const moveEmailInputSchema = z.object({ mailbox: mailbox.optional().default("INBOX"), uids: writeUids, destination: mailbox }).strict();
export const createMailboxInputSchema = z.object({ path: mailbox }).strict();
export const emailCompositionInputSchema = z.object({
  to: recipients, cc: recipients, bcc: recipients, subject, text: messageBody,
}).strict().refine((value) => value.to.length + value.cc.length + value.bcc.length > 0, "At least one recipient is required.")
  .refine((value) => value.to.length + value.cc.length + value.bcc.length <= LIMITS.recipientCountAbsolute, "Too many recipients.")
  .refine((value) => {
    const all = [...value.to, ...value.cc, ...value.bcc].map((address) => address.toLowerCase());
    return new Set(all).size === all.length;
  }, "Recipients must be unique.");
export const createDraftInputSchema = emailCompositionInputSchema;
export const prepareSendEmailInputSchema = emailCompositionInputSchema;
export const confirmActionInputSchema = z.object({ confirmationToken }).strict();
export const prepareDeleteEmailInputSchema = z.object({ mailbox: mailbox.optional().default("INBOX"), uids: writeUids }).strict();

const nullableString = z.string().nullable();
const emailAddressOutputSchema = z.object({ name: z.string(), address: z.string() }).strict();
const attachmentOutputSchema = z.object({
  index: z.number().int().nonnegative(), filename: z.string(), contentType: z.string(), size: z.number().int().nonnegative(), contentId: nullableString,
}).strict();

export const healthCheckOutputSchema = z.object({
  status: z.enum(["ok", "degraded"]), serverTime: z.iso.datetime(), imapConfigured: z.boolean(), imapReachable: z.boolean().optional(),
}).strict();

export const listMailboxesOutputSchema = z.object({ mailboxes: z.array(z.object({
  path: z.string(), name: z.string(), delimiter: nullableString, specialUse: nullableString, subscribed: z.boolean(),
}).strict()) }).strict();

export const searchEmailsOutputSchema = z.object({ emails: z.array(z.object({
  uid, messageId: nullableString, subject: z.string(), from: z.array(emailAddressOutputSchema), to: z.array(emailAddressOutputSchema),
  date: nullableString, flags: z.array(z.string()), size: z.number().int().nonnegative().nullable(), hasAttachments: z.boolean().nullable(),
}).strict()).max(LIMITS.searchResultsAbsolute) }).strict();

export const readEmailsOutputSchema = z.object({
  mailbox: z.string(),
  emails: z.array(z.object({
    uid, messageId: nullableString, subject: z.string(), from: z.string(), to: z.string(), cc: z.string(), date: nullableString,
    flags: z.array(z.string()), body: z.string(), bodyTruncated: z.boolean(), attachments: z.array(attachmentOutputSchema),
    contentTrust: z.literal("untrusted_email_content"),
  }).strict()).max(LIMITS.readEmailCount),
}).strict();

export const mutationOutputSchema = z.object({ mailbox: z.string(), uids: z.array(uid), success: z.literal(true) }).strict();
export const moveOutputSchema = mutationOutputSchema.extend({ destination: z.string() }).strict();
export const createMailboxOutputSchema = z.object({ path: z.string(), created: z.boolean() }).strict();
export const draftOutputSchema = z.object({ mailbox: z.string(), uid: uid.nullable(), success: z.literal(true) }).strict();
export const confirmationOutputSchema = z.object({
  preview: z.object({ action: z.enum(["send_email", "delete_email"]), recipients: z.array(z.string()), subject: z.string(), bodyPreview: z.string().optional(), mailbox: z.string().optional(), uids: z.array(uid).optional() }).strict(),
  confirmationToken: z.string(), expiresAt: z.iso.datetime(),
}).strict();
export const sendOutputSchema = z.object({ accepted: z.array(z.string()), rejected: z.array(z.string()), messageId: nullableString, success: z.literal(true) }).strict();
