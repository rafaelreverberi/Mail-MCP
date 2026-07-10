import { redact } from "@/src/security/redaction";
import { parseEnvironment } from "@/src/config/env";
import type { SecurityStore } from "@/src/security/store";

export interface AuditEvent {
  timestamp: string;
  requestId: string;
  tool: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  resultCount?: number;
  requestedUidCount?: number;
  actorHash?: string;
}

export interface AuditLogger {
  write(event: AuditEvent): void | Promise<void>;
}

export const consoleAuditLogger: AuditLogger = {
  write(event) {
    const line = JSON.stringify(redact(event));
    if (event.success) console.info(line);
    else console.error(line);
  },
};

export function createPersistentAuditLogger(store: SecurityStore): AuditLogger {
  return {
    async write(event) {
      consoleAuditLogger.write(event);
      await store.appendAudit(event, parseEnvironment().AUDIT_RETENTION_SECONDS);
    },
  };
}
