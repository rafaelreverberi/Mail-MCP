export const SAFE_ERROR_CODES = [
  "IMAP_NOT_CONFIGURED",
  "IMAP_CONNECTION_FAILED",
  "AUTHENTICATION_FAILED",
  "MAILBOX_NOT_FOUND",
  "EMAIL_NOT_FOUND",
  "EMAIL_TOO_LARGE",
  "INVALID_INPUT",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "WRITES_DISABLED",
  "CONFIRMATION_INVALID",
  "CONFIRMATION_EXPIRED",
  "CONFIRMATION_REPLAYED",
  "SMTP_CONNECTION_FAILED",
  "SEND_FAILED",
  "INTERNAL_ERROR",
] as const;

export type SafeErrorCode = (typeof SAFE_ERROR_CODES)[number];

export class SafeError extends Error {
  constructor(public readonly code: SafeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SafeError";
  }
}

export function toSafeError(error: unknown): SafeError {
  if (error instanceof SafeError) return error;
  if (error instanceof Error) {
    const candidate = error as Error & { authenticationFailed?: boolean; code?: string; serverResponseCode?: string };
    if (candidate.authenticationFailed || candidate.code === "AUTHENTICATIONFAILED" || candidate.serverResponseCode === "AUTHENTICATIONFAILED") {
      return new SafeError("AUTHENTICATION_FAILED", "IMAP authentication failed.", { cause: error });
    }
    if (candidate.code === "NONEXISTENT" || candidate.code === "MailboxNotFound" || candidate.serverResponseCode === "NONEXISTENT") {
      return new SafeError("MAILBOX_NOT_FOUND", "The requested mailbox was not found.", { cause: error });
    }
  }
  return new SafeError("IMAP_CONNECTION_FAILED", "The IMAP operation failed.", { cause: error });
}

export function publicError(error: unknown): { code: SafeErrorCode; message: string } {
  const safe = error instanceof SafeError ? error : new SafeError("INTERNAL_ERROR", "An internal error occurred.");
  return { code: safe.code, message: safe.message };
}
