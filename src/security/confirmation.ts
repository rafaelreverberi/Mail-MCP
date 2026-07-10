import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parseEnvironment } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";
import type { DeleteEmailInput, MailService, SendEmailInput } from "@/src/mail/types";
import type { SecurityStore } from "@/src/security/store";

type ConfirmationAction = "send_email" | "delete_email";
interface TokenPayload {
  version: 1; userId: string; action: ConfirmationAction; recipients: string[]; subject: string;
  contentHash: string; expiresAt: number; jti: string;
}
type PreparedAction = { action: "send_email"; input: SendEmailInput } | { action: "delete_email"; input: DeleteEmailInput };

function canonical(value: unknown): string { return JSON.stringify(value); }
function contentHash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function encode(value: string): string { return Buffer.from(value, "utf8").toString("base64url"); }
function decode(value: string): string { return Buffer.from(value, "base64url").toString("utf8"); }

function encryptPrepared(value: PreparedAction, secret: string): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(canonical(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptPrepared(value: string, secret: string): PreparedAction {
  const [ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue || extra) throw new SafeError("CONFIRMATION_INVALID", "The stored confirmation is invalid.");
  try {
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8")) as PreparedAction;
  } catch (error) {
    throw new SafeError("CONFIRMATION_INVALID", "The stored confirmation could not be authenticated.", { cause: error });
  }
}

export class ConfirmationService {
  constructor(private readonly store: SecurityStore, private readonly mailService: MailService) {}

  private config() {
    const env = parseEnvironment();
    if (!env.WRITE_ACTIONS_ENABLED) throw new SafeError("WRITES_DISABLED", "Write actions are disabled by server configuration.");
    if (!env.CONFIRMATION_SIGNING_SECRET || env.CONFIRMATION_SIGNING_SECRET.length < 32) throw new SafeError("WRITES_DISABLED", "Confirmation signing is not configured.");
    return env;
  }

  private sign(payload: TokenPayload, secret: string): string {
    const encoded = encode(canonical(payload));
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string, expectedUserId: string, expectedAction: ConfirmationAction): TokenPayload {
    const env = this.config();
    const [encoded, providedSignature, extra] = token.split(".");
    if (!encoded || !providedSignature || extra) throw new SafeError("CONFIRMATION_INVALID", "The confirmation token is invalid.");
    const expectedSignature = createHmac("sha256", env.CONFIRMATION_SIGNING_SECRET!).update(encoded).digest();
    let provided: Buffer;
    try { provided = Buffer.from(providedSignature, "base64url"); } catch { throw new SafeError("CONFIRMATION_INVALID", "The confirmation token is invalid."); }
    if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) throw new SafeError("CONFIRMATION_INVALID", "The confirmation token signature is invalid.");
    let payload: TokenPayload;
    try { payload = JSON.parse(decode(encoded)) as TokenPayload; } catch { throw new SafeError("CONFIRMATION_INVALID", "The confirmation token payload is invalid."); }
    if (payload.version !== 1 || payload.userId !== expectedUserId || payload.action !== expectedAction || !payload.jti) throw new SafeError("CONFIRMATION_INVALID", "The confirmation token does not match this action.");
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= Math.floor(Date.now() / 1000)) throw new SafeError("CONFIRMATION_EXPIRED", "The confirmation token has expired.");
    return payload;
  }

  private async prepare(userId: string, prepared: PreparedAction, recipients: string[], subject: string) {
    const env = this.config();
    const payload: TokenPayload = {
      version: 1, userId, action: prepared.action, recipients, subject,
      contentHash: contentHash(prepared.input), expiresAt: Math.floor(Date.now() / 1000) + env.CONFIRMATION_TTL_SECONDS, jti: randomUUID(),
    };
    const stored = await this.store.putOnce(`mcp:confirmation:${payload.jti}`, encryptPrepared(prepared, env.CONFIRMATION_SIGNING_SECRET!), env.CONFIRMATION_TTL_SECONDS);
    if (!stored) throw new SafeError("INTERNAL_ERROR", "A confirmation could not be created.");
    return { confirmationToken: this.sign(payload, env.CONFIRMATION_SIGNING_SECRET!), expiresAt: new Date(payload.expiresAt * 1000).toISOString() };
  }

  prepareSend(userId: string, input: SendEmailInput) {
    const recipients = [...input.to, ...input.cc, ...input.bcc];
    return this.prepare(userId, { action: "send_email", input }, recipients, input.subject);
  }

  prepareDelete(userId: string, input: DeleteEmailInput) {
    return this.prepare(userId, { action: "delete_email", input }, [], `${input.mailbox}:${input.uids.join(",")}`);
  }

  private async consume(token: string, userId: string, action: ConfirmationAction): Promise<PreparedAction> {
    const payload = this.verify(token, userId, action);
    const raw = await this.store.consume(`mcp:confirmation:${payload.jti}`);
    if (!raw) throw new SafeError("CONFIRMATION_REPLAYED", "The confirmation token was already used or is no longer available.");
    const prepared = decryptPrepared(raw, this.config().CONFIRMATION_SIGNING_SECRET!);
    if (prepared.action !== action || contentHash(prepared.input) !== payload.contentHash) throw new SafeError("CONFIRMATION_INVALID", "The prepared action has changed.");
    return prepared;
  }

  async confirmSend(userId: string, token: string) {
    const prepared = await this.consume(token, userId, "send_email");
    if (prepared.action !== "send_email") throw new SafeError("CONFIRMATION_INVALID", "The prepared action is invalid.");
    return this.mailService.sendEmail(prepared.input);
  }

  async confirmDelete(userId: string, token: string) {
    const prepared = await this.consume(token, userId, "delete_email");
    if (prepared.action !== "delete_email") throw new SafeError("CONFIRMATION_INVALID", "The prepared action is invalid.");
    return this.mailService.deleteEmail(prepared.input);
  }
}
