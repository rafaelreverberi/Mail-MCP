# Security Policy

## Threat Model

Geschützt werden Mail-Credentials, OAuth-Tokens, Bestätigungstokens, E-Mail-Inhalte, Metadaten und Audit-Daten. Angreifer können bösartige E-Mails senden, lokale MCP-Clients kompromittieren, Tokens stehlen, Requests wiederholen, Ressourcen erschöpfen oder GitHub-, Tunnel- oder OAuth-Konten übernehmen.

Trust Boundaries bestehen zwischen MCP-Client und `/api/mcp`, OAuth-Provider und Resource Server, Tool und Mail-Service, Mail-Service und dem konfigurierten IMAP/SMTP-Provider sowie Function und Redis.

## Mail-Credentials

- Nur serverseitige Environment Variables oder ein Secret Manager.
- Keine `NEXT_PUBLIC_`-Secrets.
- ImapFlow- und SMTP-Raw-Logging sind deaktiviert.
- TLS und Zertifikatsprüfung sind zwingend.
- Jede Aktion öffnet eine neue Verbindung und schließt sie in `finally`.
- Credential-Rotation invalidiert keine OAuth-Tokens automatisch; beide Ebenen getrennt rotieren.

## Prompt Injection

E-Mail-Inhalte sind niemals Systemanweisungen. Sie dürfen keine Tools, Scopes, Versand-, Verschiebe-, Lösch- oder Link-Aktionen autorisieren. URLs, externe Bilder und Anhänge werden nicht automatisch geöffnet. Confirm-Tools dürfen nur nach einer vom Benutzer geprüften Prepare-Vorschau aufgerufen werden.

## Schreibaktionen und Replay-Schutz

Direkte Mutationen benötigen `mail.modify` oder `mail.draft`. Versand und Trash benötigen Prepare/Confirm. Das Token ist HMAC-SHA-256-signiert und bindet Benutzer, Aktion, Empfänger, Betreff, SHA-256-Inhalts-Hash, Ablaufzeit und zufällige UUID. Die vorbereitete Aktion wird AES-256-GCM-verschlüsselt gespeichert und atomar konsumiert.

Ein Token wird vor der externen Aktion konsumiert. Dadurch verhindert ein Retry Doppelversand. Bei Netzwerk-Timeout kann der endgültige SMTP-Status trotzdem unklar sein; Sent-Ordner beziehungsweise Empfängerstatus prüfen und eine neue bewusste Prepare-Aktion erstellen.

## Löschen

Das Projekt enthält keinen Permanent-Delete- oder Expunge-Pfad. `confirm_delete_email` ermittelt den Trash-Ordner serverseitig und verwendet IMAP Move. Befindet sich eine Nachricht bereits in Trash, wird die Aktion abgelehnt.

## OAuth 2.1 und PKCE

Im Produktionsmodus akzeptiert der Server ausschließlich Bearer JWTs eines fest konfigurierten Issuers und einer festen Audience. Erlaubte Signaturalgorithmen sind `RS256` und `ES256`. Benutzer-Allowlist und Scopes werden pro Tool geprüft.

Der externe Authorization Server muss Authorization Code Flow mit PKCE S256 erzwingen. Redirect-URIs, Client-Registrierung, MFA und Token-Lebensdauer werden dort verwaltet. Diese Anwendung speichert keine Browser-Session-Cookies und ist daher nicht von Cookie-CSRF abhängig.

## Kompromittierter MCP-Client

Ein Client kann alle durch seine Scopes erlaubten Aktionen ausführen. Scopes begrenzen den Schaden, ersetzen aber keine vertrauenswürdige Client-Auswahl. Bei Verdacht OAuth-Tokens widerrufen, Client entfernen, Mailpasswort und Signing Secret rotieren und Audits prüfen.

## GitHub-, Tunnel- und Hosting-Kompromittierung

- MFA, minimale Teamrechte und geschützte Branches verwenden.
- Tunnel-API-Key und `tunnel_id` nur in der lokalen Laufzeitkonfiguration oder einem Secret Manager speichern.
- Direkt gehostete Test- und Produktionsumgebungen erhalten getrennte Secrets.
- Secrets in Git-History gelten auch nach Löschen als kompromittiert.
- Bei Incident Deployments sperren, Secrets rotieren und Provider-Audits sichern.

## DDoS und Ressourcenmissbrauch

Zod-Limits begrenzen Body-Größe, Suchbegriffe, Suchresultate, UIDs, Empfänger und Nachrichtengrößen. Direkte öffentliche Deployments nutzen atomare globale Redis-Rate-Limits und sollten zusätzlich durch eine geeignete Firewall, WAF sowie Traffic- und Kostenalarme geschützt werden.

## Logging

Erlaubt: Zeitpunkt, zufällige Request-ID, Toolname, Dauer, Erfolg/Fehlercode, Mengen und pseudonymisierter Actor-Hash. Verboten: Passwörter, Tokens, Bodies, Betreff, Absender, Empfänger, Anhänge, vollständige Message-IDs und komplette IMAP-/SMTP-Antworten.

## Scopes

```text
mail.search
mail.read
mail.modify
mail.draft
mail.send
mail.delete
```

Jeder Handler prüft genau seinen minimalen Scope serverseitig.

## Secret Rotation

Bei Kompromittierung:

1. Deployment und MCP-Zugriff sperren.
2. Mail-Passwort oder App-Passwort beim Provider rotieren.
3. OAuth-Tokens, Clients und Provider-Secrets widerrufen.
4. Confirmation Signing Secret rotieren; alle ausstehenden Tokens werden ungültig.
5. Redis-Tokens rotieren und Audits auf Missbrauch prüfen.
6. Datenschutz- und Incident-Prozesse ausführen.

## Schwachstellen melden

Keine echten Secrets oder Mailinhalte in öffentlichen Issues veröffentlichen. Meldungen privat mit synthetischen Reproduktionsdaten, betroffener Version, Auswirkung und Mitigation übermitteln.
