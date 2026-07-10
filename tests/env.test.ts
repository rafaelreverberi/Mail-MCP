import { describe, expect, it } from "vitest";
import { getImapConfig, parseEnvironment, validateProductionSecurity } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";

describe("environment validation", () => {
  it("applies secure generic mail and local defaults", () => {
    expect(parseEnvironment({})).toMatchObject({
      IMAP_HOST: "imap.example.com", IMAP_PORT: 993, SMTP_HOST: "smtp.example.com", SMTP_PORT: 465,
      AUTH_MODE: "local", MCP_HOST: "127.0.0.1", WRITE_ACTIONS_ENABLED: false,
    });
  });

  it("does not require secrets for build and health", () => { expect(parseEnvironment({}).MAIL_ADDRESS).toBeUndefined(); });

  it("fails safely when mail credentials are missing", () => {
    expect(() => getImapConfig({})).toThrowError(SafeError);
    try { getImapConfig({}); } catch (error) { expect(error).toMatchObject({ code: "IMAP_NOT_CONFIGURED" }); }
  });

  it("requires a strong signing secret before writes can be enabled", () => {
    expect(() => parseEnvironment({ WRITE_ACTIONS_ENABLED: "true", CONFIRMATION_SIGNING_SECRET: "short" })).toThrowError(SafeError);
    expect(parseEnvironment({ WRITE_ACTIONS_ENABLED: "true", CONFIRMATION_SIGNING_SECRET: "x".repeat(32) }).WRITE_ACTIONS_ENABLED).toBe(true);
  });

  it("rejects non-loopback binding in local mode", () => { expect(() => parseEnvironment({ MCP_HOST: "0.0.0.0" })).toThrowError(SafeError); });

  it("requires OAuth, HTTPS, allowlist and Redis in production", () => {
    expect(() => validateProductionSecurity(parseEnvironment({ AUTH_MODE: "oauth" }))).toThrowError(SafeError);
    expect(() => validateProductionSecurity(parseEnvironment({
      AUTH_MODE: "oauth", APP_BASE_URL: "https://mail.example.test", OAUTH_ISSUER: "https://issuer.example.test",
      OAUTH_AUDIENCE: "mail-api", OAUTH_JWKS_URI: "https://issuer.example.test/jwks", OAUTH_AUTHORIZATION_SERVER: "https://issuer.example.test",
      OAUTH_ALLOWED_USERS: "user-1", UPSTASH_REDIS_REST_URL: "https://redis.example.test", UPSTASH_REDIS_REST_TOKEN: "secret",
    }))).not.toThrow();
  });
});
