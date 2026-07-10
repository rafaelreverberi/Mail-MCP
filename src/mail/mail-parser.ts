import { simpleParser } from "mailparser";
import { sanitizeBody } from "@/src/mail/mail-sanitizer";
import { EMAIL_CONTENT_TRUST } from "@/src/security/untrusted-content";
import type { ReadEmailResult } from "@/src/mail/types";

function formatAddress(value: { text?: string } | Array<{ text?: string }> | undefined): string {
  if (Array.isArray(value)) return value.map((entry) => entry.text ?? "").filter(Boolean).join(", ");
  return value?.text ?? "";
}
export async function parseEmailSource(source: Buffer, uid: number, flags: string[], maximum: number): Promise<ReadEmailResult> {
  const parsed = await simpleParser(source, {
    skipHtmlToText: true,
    skipImageLinks: true,
    maxHtmlLengthToParse: source.length,
  });
  const body = sanitizeBody(parsed.text, parsed.html, maximum);
  return {
    uid,
    messageId: parsed.messageId ?? null,
    subject: parsed.subject ?? "",
    from: formatAddress(parsed.from),
    to: formatAddress(parsed.to),
    cc: formatAddress(parsed.cc),
    date: parsed.date?.toISOString() ?? null,
    flags,
    body: body.text,
    bodyTruncated: body.truncated,
    attachments: parsed.attachments.map((attachment, index) => ({
      index,
      filename: attachment.filename ?? "unnamed-attachment",
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.contentId ?? null,
    })),
    contentTrust: EMAIL_CONTENT_TRUST,
  };
}
