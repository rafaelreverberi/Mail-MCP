import { convert } from "html-to-text";
import { truncateText } from "@/src/security/limits";

export function htmlToSafeText(html: string): string {
  return convert(html, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: "script", format: "skip" }, { selector: "style", format: "skip" },
      { selector: "form", format: "skip" }, { selector: "iframe", format: "skip" },
      { selector: "frame", format: "skip" }, { selector: "object", format: "skip" },
      { selector: "embed", format: "skip" }, { selector: "img", format: "skip" },
      { selector: "svg", format: "skip" }, { selector: "link", format: "skip" },
      { selector: "meta", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
    ],
  }).replace(/\n{3,}/gu, "\n\n").trim();
}
export function sanitizeBody(text: string | undefined, html: string | false | undefined, maximum: number) {
  const safe = text?.trim() || (typeof html === "string" ? htmlToSafeText(html) : "");
  return truncateText(safe, maximum);
}
