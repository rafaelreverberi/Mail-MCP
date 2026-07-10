import { NextResponse } from "next/server";
import { isImapConfigured, parseEnvironment } from "@/src/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const env = parseEnvironment();
  const response = NextResponse.json({
    status: "ok",
    serverTime: new Date().toISOString(),
    imapConfigured: isImapConfigured(env),
    mode: env.AUTH_MODE,
    writeActionsEnabled: env.WRITE_ACTIONS_ENABLED,
    durableStoreConfigured: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
