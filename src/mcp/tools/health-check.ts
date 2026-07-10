import type { MailService } from "@/src/mail/types";
import { isImapConfigured, parseEnvironment } from "@/src/config/env";

export async function healthCheck(mailService: MailService, checkImap: boolean) {
  const configured = isImapConfigured(parseEnvironment());
  let reachable: boolean | undefined;
  if (checkImap && configured) {
    try { reachable = await mailService.checkConnection(); } catch { reachable = false; }
  }
  const degraded = checkImap && (!configured || reachable !== true);
  return {
    status: degraded ? "degraded" as const : "ok" as const,
    serverTime: new Date().toISOString(),
    imapConfigured: configured,
    ...(checkImap ? { imapReachable: reachable ?? false } : {}),
  };
}
