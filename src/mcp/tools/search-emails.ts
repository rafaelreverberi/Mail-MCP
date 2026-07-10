import { parseEnvironment } from "@/src/config/env";
import type { MailService } from "@/src/mail/types";
import type { z } from "zod";
import type { searchEmailsInputSchema } from "@/src/mcp/tools/schemas";

export async function searchEmails(mailService: MailService, input: z.infer<typeof searchEmailsInputSchema>) {
  const limit = input.limit ?? parseEnvironment().MAX_SEARCH_RESULTS;
  return { emails: await mailService.searchEmails({
    mailbox: input.mailbox,
    limit,
    ...(input.from === undefined ? {} : { from: input.from }),
    ...(input.to === undefined ? {} : { to: input.to }),
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.since === undefined ? {} : { since: input.since }),
    ...(input.before === undefined ? {} : { before: input.before }),
    ...(input.unread === undefined ? {} : { unread: input.unread }),
    ...(input.flagged === undefined ? {} : { flagged: input.flagged }),
  }) };
}
