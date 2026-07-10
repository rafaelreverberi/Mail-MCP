import "server-only";
import { z } from "zod";
import { SafeError } from "@/src/errors/safe-error";
import { LIMITS } from "@/src/security/limits";

const strictBoolean = z.enum(["true", "false"]).transform((value) => value === "true");
const port = z.coerce.number().int().min(1).max(65_535);
const host = z.string().trim().min(1).max(253).refine((value) => !/[\r\n\0]/u.test(value));
const optionalValue = z.string().trim().optional().or(z.literal(""));
const optionalUrl = z.string().trim().url().optional().or(z.literal(""));

const environmentSchema = z.object({
  MAIL_ADDRESS: z.string().trim().email().optional().or(z.literal("")),
  MAIL_PASSWORD: z.string().min(1).optional().or(z.literal("")),
  IMAP_HOST: host.default("imap.example.com"),
  IMAP_PORT: port.default(993),
  IMAP_SECURE: strictBoolean.default(true),
  SMTP_HOST: host.default("smtp.example.com"),
  SMTP_PORT: port.default(465),
  SMTP_SECURE: strictBoolean.default(true),
  MCP_HOST: host.default("127.0.0.1"),
  MCP_PORT: port.default(3000),
  MAX_EMAIL_SIZE_BYTES: z.coerce.number().int().min(1024).max(50_000_000).default(10_000_000),
  MAX_EMAIL_BODY_CHARACTERS: z.coerce.number().int().min(100).max(LIMITS.bodyCharactersAbsolute).default(30_000),
  MAX_SEARCH_RESULTS: z.coerce.number().int().min(1).max(LIMITS.searchResultsAbsolute).default(20),
  WRITE_ACTIONS_ENABLED: strictBoolean.default(false),
  CONFIRMATION_SIGNING_SECRET: optionalValue,
  CONFIRMATION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  MAX_SEND_RECIPIENTS: z.coerce.number().int().min(1).max(100).default(20),
  MAX_SEND_BODY_CHARACTERS: z.coerce.number().int().min(1000).max(500_000).default(100_000),
  AUTH_MODE: z.enum(["local", "oauth"]).default("local"),
  APP_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:3000,http://localhost:3000"),
  OAUTH_ISSUER: optionalUrl,
  OAUTH_AUDIENCE: optionalValue,
  OAUTH_JWKS_URI: optionalUrl,
  OAUTH_AUTHORIZATION_SERVER: optionalUrl,
  OAUTH_ALLOWED_USERS: optionalValue,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalValue,
  RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(60),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUDIT_RETENTION_SECONDS: z.coerce.number().int().min(3600).max(31_536_000).default(2_592_000),
}).superRefine((env, context) => {
  if (env.AUTH_MODE === "local" && !["127.0.0.1", "localhost", "::1", "[::1]"].includes(env.MCP_HOST)) {
    context.addIssue({ code: "custom", path: ["MCP_HOST"], message: "Local mode must bind to loopback." });
  }
  if (env.WRITE_ACTIONS_ENABLED && (!env.CONFIRMATION_SIGNING_SECRET || env.CONFIRMATION_SIGNING_SECRET.length < 32)) {
    context.addIssue({ code: "custom", path: ["CONFIRMATION_SIGNING_SECRET"], message: "Write actions require at least 32 secret characters." });
  }
});

export type AppEnv = z.infer<typeof environmentSchema>;
export type ImapConfig = Pick<AppEnv, "IMAP_HOST" | "IMAP_PORT" | "IMAP_SECURE" | "MAX_EMAIL_SIZE_BYTES" | "MAX_EMAIL_BODY_CHARACTERS" | "MAX_SEARCH_RESULTS"> & { MAIL_ADDRESS: string; MAIL_PASSWORD: string };
export type SmtpConfig = Pick<AppEnv, "SMTP_HOST" | "SMTP_PORT" | "SMTP_SECURE"> & { MAIL_ADDRESS: string; MAIL_PASSWORD: string };

function normalize(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

export function parseEnvironment(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppEnv {
  const result = environmentSchema.safeParse(normalize(source));
  if (!result.success) throw new SafeError("INVALID_INPUT", "Server configuration is invalid.");
  return result.data;
}

export function isImapConfigured(env = parseEnvironment()): boolean { return Boolean(env.MAIL_ADDRESS && env.MAIL_PASSWORD); }

function requireMailCredentials(env: AppEnv): asserts env is AppEnv & { MAIL_ADDRESS: string; MAIL_PASSWORD: string } {
  if (!env.MAIL_ADDRESS || !env.MAIL_PASSWORD) throw new SafeError("IMAP_NOT_CONFIGURED", "Mail credentials are not configured.");
}

export function getImapConfig(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ImapConfig {
  const env = parseEnvironment(source); requireMailCredentials(env);
  return { ...env, MAIL_ADDRESS: env.MAIL_ADDRESS, MAIL_PASSWORD: env.MAIL_PASSWORD };
}

export function getSmtpConfig(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): SmtpConfig {
  const env = parseEnvironment(source); requireMailCredentials(env);
  return { SMTP_HOST: env.SMTP_HOST, SMTP_PORT: env.SMTP_PORT, SMTP_SECURE: env.SMTP_SECURE, MAIL_ADDRESS: env.MAIL_ADDRESS, MAIL_PASSWORD: env.MAIL_PASSWORD };
}

export function allowedOrigins(env = parseEnvironment()): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean).map((value) => new URL(value).origin));
}

export function validateProductionSecurity(env = parseEnvironment()): void {
  if (env.AUTH_MODE !== "oauth") throw new SafeError("INVALID_INPUT", "Production requires OAuth mode.");
  if (!env.APP_BASE_URL.startsWith("https://")) throw new SafeError("INVALID_INPUT", "Production requires an HTTPS base URL.");
  if (!env.OAUTH_ISSUER || !env.OAUTH_AUDIENCE || !env.OAUTH_JWKS_URI || !env.OAUTH_AUTHORIZATION_SERVER || !env.OAUTH_ALLOWED_USERS) {
    throw new SafeError("INVALID_INPUT", "OAuth production configuration is incomplete.");
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new SafeError("INVALID_INPUT", "Production requires a durable Redis store.");
  }
}
