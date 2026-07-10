import type { MailService } from "@/src/mail/types";

export async function listMailboxes(mailService: MailService) {
  return { mailboxes: await mailService.listMailboxes() };
}
