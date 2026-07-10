import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { parseEnvironment, validateProductionSecurity } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";

export const MAIL_SCOPES = ["mail.search", "mail.read", "mail.modify", "mail.draft", "mail.send", "mail.delete"] as const;
export type MailScope = (typeof MAIL_SCOPES)[number];

let cachedJwks: { uri: string; value: ReturnType<typeof createRemoteJWKSet> } | undefined;

function getJwks(uri: string) {
  if (!cachedJwks || cachedJwks.uri !== uri) cachedJwks = { uri, value: createRemoteJWKSet(new URL(uri)) };
  return cachedJwks.value;
}

function claimScopes(payload: JWTPayload): string[] {
  const scope = typeof payload.scope === "string" ? payload.scope.split(/\s+/u) : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.filter((value): value is string => typeof value === "string") : [];
  return [...new Set([...scope, ...permissions])];
}

function actorFromPayload(payload: JWTPayload): string {
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!payload.sub) throw new SafeError("UNAUTHORIZED", "The access token has no subject.");
  const env = parseEnvironment();
  const allowed = new Set((env.OAUTH_ALLOWED_USERS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (allowed.size === 0 || (!allowed.has(payload.sub.toLowerCase()) && (!email || !allowed.has(email.toLowerCase())))) {
    throw new SafeError("FORBIDDEN", "This user is not allowed to access the mail account.");
  }
  return payload.sub;
}

export async function authenticateRequest(request: Request): Promise<AuthInfo> {
  const env = parseEnvironment();
  if (env.AUTH_MODE === "local") {
    return { token: "local-session", clientId: "local-mcp-client", scopes: [...MAIL_SCOPES], resource: new URL(env.APP_BASE_URL), extra: { userId: "local-user" } };
  }
  validateProductionSecurity(env);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192) throw new SafeError("UNAUTHORIZED", "A valid bearer token is required.");
  const token = authorization.slice(7);
  const jwks = getJwks(env.OAUTH_JWKS_URI!);
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: env.OAUTH_ISSUER!, audience: env.OAUTH_AUDIENCE!, algorithms: ["RS256", "ES256"] }));
  } catch (error) {
    throw new SafeError("UNAUTHORIZED", "The access token is invalid or expired.", { cause: error });
  }
  const userId = actorFromPayload(payload);
  return {
    token,
    clientId: typeof payload.client_id === "string" ? payload.client_id : typeof payload.azp === "string" ? payload.azp : "oauth-client",
    scopes: claimScopes(payload),
    ...(typeof payload.exp === "number" ? { expiresAt: payload.exp } : {}),
    resource: new URL(env.APP_BASE_URL),
    extra: { userId },
  };
}

export function requireScope(authInfo: AuthInfo | undefined, scope: MailScope): string {
  if (!authInfo && parseEnvironment().AUTH_MODE === "local") return "local-user";
  if (!authInfo) throw new SafeError("UNAUTHORIZED", "Authentication is required.");
  if (!authInfo.scopes.includes(scope)) throw new SafeError("FORBIDDEN", `The ${scope} scope is required.`);
  const userId = authInfo.extra?.userId;
  if (typeof userId !== "string" || userId.length === 0) throw new SafeError("UNAUTHORIZED", "The authenticated user is invalid.");
  return userId;
}

export function actorHash(userId: string | undefined): string | undefined {
  return userId ? createHash("sha256").update(userId).digest("hex").slice(0, 24) : undefined;
}
