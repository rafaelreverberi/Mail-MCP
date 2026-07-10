import { parseEnvironment } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";
import type { MailService } from "@/src/mail/types";
import type { ConfirmationService } from "@/src/security/confirmation";
import type { z } from "zod";
import type {
  confirmActionInputSchema, createDraftInputSchema, createMailboxInputSchema, markEmailInputSchema,
  moveEmailInputSchema, prepareDeleteEmailInputSchema, prepareSendEmailInputSchema,
} from "@/src/mcp/tools/schemas";

function enforceCompositionLimits(input: z.infer<typeof prepareSendEmailInputSchema>): void {
  const env = parseEnvironment();
  if (input.to.length + input.cc.length + input.bcc.length > env.MAX_SEND_RECIPIENTS) throw new SafeError("INVALID_INPUT", "The configured recipient limit was exceeded.");
  if (Array.from(input.text).length > env.MAX_SEND_BODY_CHARACTERS) throw new SafeError("INVALID_INPUT", "The configured message body limit was exceeded.");
}

export function markEmail(mailService: MailService, input: z.infer<typeof markEmailInputSchema>) {
  return mailService.markEmail({
    mailbox: input.mailbox,
    uids: input.uids,
    ...(input.read === undefined ? {} : { read: input.read }),
    ...(input.flagged === undefined ? {} : { flagged: input.flagged }),
  });
}
export function moveEmail(mailService: MailService, input: z.infer<typeof moveEmailInputSchema>) { return mailService.moveEmail(input); }
export function createMailbox(mailService: MailService, input: z.infer<typeof createMailboxInputSchema>) { return mailService.createMailbox(input.path); }
export function createDraft(mailService: MailService, input: z.infer<typeof createDraftInputSchema>) { enforceCompositionLimits(input); return mailService.createDraft(input); }

export async function prepareSendEmail(confirmations: ConfirmationService, userId: string, input: z.infer<typeof prepareSendEmailInputSchema>) {
  enforceCompositionLimits(input);
  const prepared = await confirmations.prepareSend(userId, input);
  return { preview: { action: "send_email" as const, recipients: [...input.to, ...input.cc, ...input.bcc], subject: input.subject, bodyPreview: Array.from(input.text).slice(0, 4000).join("") }, ...prepared };
}

export function confirmSendEmail(confirmations: ConfirmationService, userId: string, input: z.infer<typeof confirmActionInputSchema>) {
  return confirmations.confirmSend(userId, input.confirmationToken);
}

export async function prepareDeleteEmail(confirmations: ConfirmationService, userId: string, input: z.infer<typeof prepareDeleteEmailInputSchema>) {
  const prepared = await confirmations.prepareDelete(userId, input);
  return { preview: { action: "delete_email" as const, recipients: [], subject: `${input.uids.length} email(s) to Trash`, mailbox: input.mailbox, uids: input.uids }, ...prepared };
}

export function confirmDeleteEmail(confirmations: ConfirmationService, userId: string, input: z.infer<typeof confirmActionInputSchema>) {
  return confirmations.confirmDelete(userId, input.confirmationToken);
}
