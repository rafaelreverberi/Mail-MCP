import { isImapConfigured, parseEnvironment } from "@/src/config/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const env = parseEnvironment();
  const configured = isImapConfigured(env);
  return (
    <main>
      <section aria-labelledby="title">
        <div className="eyebrow"><span className="status-dot" /> {env.AUTH_MODE === "local" ? "Local" : "OAuth"} · Secure mail control</div>
        <h1 id="title">Mail-MCP</h1>
        <p className="lede">MCP-Server für sicheren IMAP/SMTP-Mailzugriff mit Scopes, begrenzten Schreibaktionen und bestätigungspflichtigem Versand und Löschen.</p>
        <dl>
          <div><dt>MCP endpoint</dt><dd><code>/api/mcp</code></dd></div>
          <div><dt>Health endpoint</dt><dd><code>/api/health</code></dd></div>
          <div><dt>IMAP configuration</dt><dd className={configured ? "ready" : "pending"}>{configured ? "Configured" : "Missing credentials"}</dd></div>
          <div><dt>Write actions</dt><dd className={env.WRITE_ACTIONS_ENABLED ? "ready" : "pending"}>{env.WRITE_ACTIONS_ENABLED ? "Enabled" : "Disabled by default"}</dd></div>
          <div><dt>Authentication</dt><dd>{env.AUTH_MODE === "oauth" ? "OAuth/OIDC" : "Loopback only"}</dd></div>
        </dl>
        <p className="note">Keine Zugangsdaten oder Postfachinhalte werden auf dieser Seite angezeigt.</p>
      </section>
    </main>
  );
}
