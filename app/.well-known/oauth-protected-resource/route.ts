import { MAIL_SCOPES } from "@/src/security/auth";
import { parseEnvironment } from "@/src/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const env = parseEnvironment();
  if (env.AUTH_MODE !== "oauth" || !env.OAUTH_AUTHORIZATION_SERVER) return Response.json({ error: "OAuth is not enabled." }, { status: 404 });
  return Response.json({
    resource: new URL("/api/mcp", env.APP_BASE_URL).toString(),
    authorization_servers: [env.OAUTH_AUTHORIZATION_SERVER],
    scopes_supported: MAIL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: new URL("/", env.APP_BASE_URL).toString(),
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
