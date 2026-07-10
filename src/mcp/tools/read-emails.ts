import { parseEnvironment } from "@/src/config/env";
import type { MailService } from "@/src/mail/types";
import type { z } from "zod";
import type { readEmailsInputSchema } from "@/src/mcp/tools/schemas";

export async function readEmails(mailService: MailService, input: z.infer<typeof readEmailsInputSchema>) {
  return mailService.readEmails(input.mailbox, input.uids, input.maxBodyCharacters ?? parseEnvironment().MAX_EMAIL_BODY_CHARACTERS);
}
