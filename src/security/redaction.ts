const SENSITIVE_KEY = /(pass(word)?|secret|token|cookie|authorization|credential)/iu;

function replaceKnownSecrets(value: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret.length > 0).reduce((result, secret) => result.split(secret).join("[REDACTED]"), value);
}
export function redact(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") return replaceKnownSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item, secrets)]),
    );
  }
  return value;
}
