import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { allowedOrigins, parseEnvironment } from "@/src/config/env";
import { publicError } from "@/src/errors/safe-error";
import { createPersistentAuditLogger } from "@/src/logging/logger";
import { createMcpServer } from "@/src/mcp/create-server";
import { actorHash, authenticateRequest } from "@/src/security/auth";
import { LIMITS } from "@/src/security/limits";
import { enforceRateLimit } from "@/src/security/rate-limit";
import { getSecurityStore } from "@/src/security/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function jsonError(status: number, code: string, message: string, request: Request) {
  const env = parseEnvironment();
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (status === 401 && env.AUTH_MODE === "oauth") {
    headers["WWW-Authenticate"] = `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource", request.url).toString()}"`;
  }
  return Response.json({ jsonrpc: "2.0", error: { code: -32_000, message, data: { code } }, id: null }, { status, headers });
}

function validateRequestBoundary(request: Request): Response | undefined {
  const env = parseEnvironment();
  const url = new URL(request.url);
  if (env.AUTH_MODE === "local" && !LOCAL_HOSTS.has(url.hostname)) return jsonError(403, "LOCAL_ACCESS_ONLY", "Local mode only accepts loopback requests.", request);
  if (env.AUTH_MODE === "oauth" && url.origin !== new URL(env.APP_BASE_URL).origin) return jsonError(403, "INVALID_HOST", "The request host is not allowed.", request);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (!allowedOrigins(env).has(new URL(origin).origin)) return jsonError(403, "INVALID_ORIGIN", "The request origin is not allowed.", request);
    } catch {
      return jsonError(403, "INVALID_ORIGIN", "The request origin is not allowed.", request);
    }
  }
  return undefined;
}

export async function POST(request: Request): Promise<Response> {
  const rejected = validateRequestBoundary(request);
  if (rejected) return rejected;
  try {
    const authInfo = await authenticateRequest(request);
    const store = getSecurityStore();
    const userId = typeof authInfo.extra?.userId === "string" ? authInfo.extra.userId : authInfo.clientId;
    await enforceRateLimit(store, actorHash(userId) ?? "anonymous");
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > LIMITS.requestBodyBytes) return jsonError(413, "INVALID_INPUT", "The request body is too large.", request);
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > LIMITS.requestBodyBytes) return jsonError(413, "INVALID_INPUT", "The request body is too large.", request);
    let parsedBody: unknown;
    try { parsedBody = JSON.parse(rawBody); } catch { return jsonError(400, "INVALID_INPUT", "The request body must be valid JSON.", request); }

    const server = createMcpServer(undefined, createPersistentAuditLogger(store));
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { parsedBody, authInfo });
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await server.close();
    }
  } catch (error) {
    const safe = publicError(error);
    const status = safe.code === "RATE_LIMITED" ? 429 : safe.code === "UNAUTHORIZED" ? 401 : safe.code === "FORBIDDEN" ? 403 : 500;
    return jsonError(status, safe.code, safe.message, request);
  }
}

export function GET(request: Request) { return jsonError(405, "METHOD_NOT_ALLOWED", "Stateless MCP accepts POST requests only.", request); }
export function DELETE(request: Request) { return jsonError(405, "METHOD_NOT_ALLOWED", "This stateless endpoint has no sessions to delete.", request); }
