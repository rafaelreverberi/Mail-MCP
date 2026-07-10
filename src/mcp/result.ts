import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { publicError } from "@/src/errors/safe-error";
import type { AuditLogger } from "@/src/logging/logger";

export function successResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function errorResult(error: unknown): CallToolResult {
  const safe = publicError(error);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: safe }) }],
  };
}

export async function runLoggedTool<T extends object>(
  logger: AuditLogger,
  tool: string,
  counts: { requestedUidCount?: number },
  actorHash: string | undefined,
  operation: () => Promise<T>,
): Promise<CallToolResult> {
  const started = performance.now();
  const requestId = randomUUID();
  try {
    const data = await operation();
    const record = data as Record<string, unknown>;
    const resultCount = Array.isArray(record.emails) ? record.emails.length : Array.isArray(record.mailboxes) ? record.mailboxes.length : undefined;
    try { await logger.write({
      timestamp: new Date().toISOString(), requestId, tool, durationMs: Math.round(performance.now() - started), success: true,
      ...(resultCount === undefined ? {} : { resultCount }), ...(actorHash === undefined ? {} : { actorHash }), ...counts,
    }); } catch { /* A post-action audit outage must not make a successful irreversible action look retryable. */ }
    return successResult(record);
  } catch (error) {
    const safe = publicError(error);
    try { await logger.write({
      timestamp: new Date().toISOString(), requestId, tool, durationMs: Math.round(performance.now() - started),
      success: false, errorCode: safe.code, ...(actorHash === undefined ? {} : { actorHash }), ...counts,
    }); } catch { /* Preserve the original safe error if the audit backend is unavailable. */ }
    return errorResult(error);
  }
}
