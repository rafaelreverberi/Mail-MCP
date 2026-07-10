import { describe, expect, it } from "vitest";
import { htmlToSafeText, sanitizeBody } from "@/src/mail/mail-sanitizer";

describe("email HTML sanitization", () => {
  it("removes active content, forms, frames and external images", () => {
    const result = htmlToSafeText(`<style>.x{}</style><script>alert(1)</script><p>Hello <b>world</b></p><form>steal</form><iframe src="https://evil.test"></iframe><img src="https://tracker.test/pixel"><a href="https://evil.test">label</a>`);
    expect(result).toContain("Hello world"); expect(result).toContain("label"); expect(result).not.toMatch(/alert|steal|tracker|evil\.test/u);
  });
  it("prefers text and enforces limits", () => { expect(sanitizeBody("abcdef", "<p>ignored</p>", 4)).toEqual({ text: "abcd", truncated: true }); });
});
