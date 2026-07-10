import { describe, expect, it } from "vitest";
import { findSpecialMailbox } from "@/src/mail/mailbox-utils";

describe("special mailbox resolution", () => {
  it("prefers server special-use metadata", () => { expect(findSpecialMailbox([{ path: "Bin", specialUse: "\\Trash" }], "\\Trash")).toBe("Bin"); });
  it("uses conservative localized fallbacks", () => { expect(findSpecialMailbox([{ path: "Entwürfe", name: "Entwürfe" }], "\\Drafts")).toBe("Entwürfe"); });
  it("does not invent missing Trash folders", () => { expect(findSpecialMailbox([{ path: "INBOX" }], "\\Trash")).toBeNull(); });
});
