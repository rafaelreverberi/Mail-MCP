# Direct Hosting Checklist

This checklist applies only when Mail-MCP is exposed through a direct remote deployment. A local installation connected through OpenAI Secure MCP Tunnel does not require public hosting.

## Identity

- [ ] OAuth Authorization Server unterstützt Authorization Code + PKCE S256.
- [ ] Issuer, JWKS URI und Audience sind exakt und HTTPS-basiert.
- [ ] Redirect-URIs der MCP-Clients sind exakt allowlisted.
- [ ] Nur benötigte `mail.*`-Scopes werden ausgestellt.
- [ ] `OAUTH_ALLOWED_USERS` enthält ausschließlich freigegebene IDs/E-Mails.
- [ ] Kurze Access-Token-Laufzeiten, MFA und Token-Widerruf sind aktiviert.

## Secrets

- [ ] Test- und Produktionsumgebungen besitzen getrennte Variablen.
- [ ] Testumgebungen besitzen keine Produktions-Mail-Credentials.
- [ ] Signing Secret ist zufällig, mindestens 32 Zeichen und als Sensitive markiert.
- [ ] Redis-, Mail- und OAuth-Secrets sind nicht in Git oder Build-Logs.

## Data and abuse protection

- [ ] Upstash Redis ist gesetzt und nur für dieses Projekt zugänglich.
- [ ] Rate Limit ist lastgetestet.
- [ ] Audit-Aufbewahrung und Zugriff sind genehmigt.
- [ ] Firewall/WAF, Bot-Regeln und Kostenalarme des gewählten Hosters sind aktiv.
- [ ] Security Header wurden am Deployment gemessen.

## Functional validation

- [ ] `npm run verify` besteht.
- [ ] OAuth ohne Token ergibt 401 plus `WWW-Authenticate`.
- [ ] Falsche Audience, Issuer, Benutzer und Scopes werden abgelehnt.
- [ ] Prepare/Confirm funktioniert; Replay und abgelaufene Tokens werden abgelehnt.
- [ ] Delete verschiebt ausschließlich nach Trash.
- [ ] SMTP-Test wurde mit einer isolierten Testadresse durchgeführt.
- [ ] Logs und Audits enthalten keine personenbezogenen Maildaten.

## Release

- [ ] End-to-End-Test in der Testumgebung abgeschlossen.
- [ ] Incident- und Secret-Rotation-Runbook ist bekannt.
- [ ] Erst danach über die gewählte Hosting-Plattform veröffentlichen.
