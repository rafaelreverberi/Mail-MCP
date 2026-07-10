# Mail-MCP

Secure access to your mailbox from any MCP-compatible client.

Mail-MCP connects to a single mailbox using standard IMAP and SMTP settings. It is provider-agnostic: use it with any provider that offers IMAP and SMTP access with a username/password or app password. Hostpoint, Fastmail, mailbox.org, Zoho, many custom domains, and similar providers are typical fits.

Mail-MCP is designed to run locally. To use it in ChatGPT without exposing it publicly, connect it through [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

> [!IMPORTANT]
> This project does **not** support providers that require provider-specific OAuth for IMAP/SMTP unless they also offer a compatible password or app-password login. Check your provider's IMAP/SMTP documentation first.

## What it does

- Read mail safely: list folders, search messages, and read bounded, sanitized content.
- Organize mail: mark messages, move them, and create mailboxes or drafts.
- Send and delete deliberately: sending and trashing require a reviewed preview plus a short-lived, single-use confirmation token.
- Protect the server: local mode binds to loopback only; production mode uses OAuth/OIDC, scoped access, Redis-backed replay protection, rate limiting, and audit logging.
- Treat email as untrusted input: HTML is converted to text, attachments are metadata only, and message content can never authorize an action.

`delete` always moves a message to the IMAP provider's Trash folder. Permanent deletion and `EXPUNGE` are intentionally not implemented.

## Quick start

**Requirements:** Node.js 20.9+ and a mailbox with IMAP + SMTP credentials.

```bash
git clone https://github.com/YOUR-USERNAME/Mail-MCP.git
cd Mail-MCP
npm install
cp .env.example .env.local
```

Open `.env.local` and enter the values supplied by your mail provider:

```env
MAIL_ADDRESS=you@example.com
MAIL_PASSWORD=your-app-password

IMAP_HOST=imap.your-provider.com
IMAP_PORT=993
IMAP_SECURE=true

SMTP_HOST=smtp.your-provider.com
SMTP_PORT=465
SMTP_SECURE=true
```

Then start Mail-MCP:

```bash
npm run dev
```

Local endpoints:

| Endpoint | URL |
| --- | --- |
| Status | `http://127.0.0.1:3000/` |
| Health | `http://127.0.0.1:3000/api/health` |
| MCP (Streamable HTTP) | `http://127.0.0.1:3000/api/mcp` |

## Mail-provider settings

Mail-MCP uses the following variables, so it is not tied to a particular provider:

| Variable | Purpose |
| --- | --- |
| `MAIL_ADDRESS` / `MAIL_PASSWORD` | Mail login; use an app password if the provider requires one. |
| `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE` | Incoming-mail server. Port `993` with `true` is common. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Outgoing-mail server. Port `465` with `true` is common. |

For providers using STARTTLS, set `*_SECURE=false` and use the provider's STARTTLS port (often `587` for SMTP). Mail-MCP still requires TLS and certificate validation; it never accepts insecure plain-text connections.

`.env.example` documents every supported variable. It is safe to commit; `.env.local` is ignored by Git and must never be shared.

### Optional: Hostpoint example

```env
IMAP_HOST=imap.mail.hostpoint.ch
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=asmtp.mail.hostpoint.ch
SMTP_PORT=465
SMTP_SECURE=true
```

## Connect an MCP client

Run the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

Choose **Streamable HTTP**, set the URL to `http://127.0.0.1:3000/api/mcp`, then try:

1. `health_check` with `{ "checkImap": true }`
2. `list_mailboxes`
3. `search_emails` with `{ "mailbox": "INBOX", "limit": 5 }`
4. `read_emails` with a returned UID

## Available tools

| Category | Tools |
| --- | --- |
| Read-only | `health_check`, `list_mailboxes`, `search_emails`, `read_emails` |
| Mailbox changes | `mark_email`, `move_email`, `create_mailbox`, `create_draft` |
| Confirmed actions | `prepare_send_email` → `confirm_send_email`, `prepare_delete_email` → `confirm_delete_email` |

Write actions are disabled by default. To enable them locally, generate a secret and set the relevant values in `.env.local`:

```bash
openssl rand -base64 48
```

```env
WRITE_ACTIONS_ENABLED=true
CONFIRMATION_SIGNING_SECRET=paste-the-generated-secret-here
CONFIRMATION_TTL_SECONDS=300
```

Never commit, log, screenshot, or pass that secret in a visible command-line argument.

## Security model

- Local use is restricted to `127.0.0.1` (or another loopback address).
- Production requires OAuth/OIDC, explicit scopes, HTTPS, and Redis for atomic confirmation tokens and global rate limits.
- Send and Trash actions are previewed first and bound to a short-lived, one-time token.
- IMAP/SMTP always use TLS with certificate verification.
- Raw mail bodies, addresses, credentials, tokens, and complete message IDs are excluded from logs and audits.
- Attachments are never downloaded or opened; HTML is sanitized to text.

Read [SECURITY.md](SECURITY.md) before exposing the server beyond your own machine. The production checklist is in [docs/production-checklist.md](docs/production-checklist.md).

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Run everything locally:

```bash
npm run verify
```

An optional IMAP connectivity test is disabled by default and never loads email bodies or sends email:

```bash
npm run test:integration
```

The GitHub Actions workflow runs type checks, linting, tests, and a production build for pushes and pull requests to `main`.

## Use Mail-MCP in ChatGPT with OpenAI Secure MCP Tunnel

Secure MCP Tunnel keeps Mail-MCP on your machine or private network. The `tunnel-client` makes an outbound HTTPS connection to OpenAI; no public domain, inbound port, or cloud deployment is required.

### 1. Start Mail-MCP locally

```bash
npm run dev
```

The local HTTP MCP endpoint is `http://127.0.0.1:3000/api/mcp`.

### 2. Configure the OpenAI tunnel client

Create or select a tunnel in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels), download the current `tunnel-client`, then use the tunnel ID and runtime API key supplied by OpenAI. Keep the API key in your shell or secret manager — never in Git.

```bash
export CONTROL_PLANE_API_KEY="sk-..."
export CONTROL_PLANE_TUNNEL_ID="tunnel_..."

tunnel-client doctor \
  --control-plane.tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
  --mcp.server-url http://127.0.0.1:3000/api/mcp \
  --explain

tunnel-client run \
  --control-plane.tunnel-id "$CONTROL_PLANE_TUNNEL_ID" \
  --mcp.server-url http://127.0.0.1:3000/api/mcp
```

Keep `tunnel-client run` running while using Mail-MCP. Its loopback-only admin UI shows the client health and tunnel connection status.

### 3. Add the tunnel in ChatGPT

In ChatGPT, open **Settings → Plugins**, use the plus button to create a developer-mode app, choose **Tunnel** as the connection type, then select your tunnel or paste its `tunnel_id`. Scan the tools and create the app.

The tunnel must be associated with the target ChatGPT workspace. If it is not listed, check the workspace association and ensure the app creator has **Tunnels Read + Use** permission.

## Start script

After installing `tunnel-client`, Mail-MCP includes a start script that loads `.env.local`, starts the server, waits for `/api/health`, then starts the tunnel.

Add the two tunnel values at the end of `.env.local`:

```env
CONTROL_PLANE_API_KEY=your-openai-runtime-api-key
CONTROL_PLANE_TUNNEL_ID=tunnel_your_tunnel_id
```

Then start everything with:

```bash
npm run start:tunnel
```

Set `ENV_FILE=/path/to/your.env` before the command if your environment file is not `.env.local`. Stop both processes with `Ctrl+C`.

### Raspberry Pi autostart

Mail-MCP supports Raspberry Pi OS systems that use `systemd`. Install Node.js 20.9+ and the ARM-compatible OpenAI `tunnel-client`, then run this once from the project root:

```bash
npm run autostart:setup
```

It asks for `sudo` only to install and enable `mail-mcp.service`. The service runs as your normal Pi user, waits for the network, loads the existing `.env.local`, and restarts automatically if Mail-MCP or the tunnel exits.

```bash
# Check configured / enabled / active status
npm run autostart:detect

# Stop and remove the systemd service
npm run autostart:remove
```

If Node.js, npm, or `tunnel-client` live outside the standard system path on the Pi, set `NODE_BIN`, `NPM_BIN`, or `TUNNEL_CLIENT_BIN` in `.env.local` as shown in `.env.example`.

For a direct remote deployment, use any platform you trust. Configure HTTPS, OAuth/OIDC, a strict user allowlist, and a durable Redis store; never expose `AUTH_MODE=local` to the public internet.

## License

[MIT](LICENSE)
