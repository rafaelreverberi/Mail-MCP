import type { MessageStructureObject } from "imapflow";

const KNOWN_SPECIAL_USE = new Map<string, string>([
  ["inbox", "\\Inbox"], ["sent", "\\Sent"], ["sent items", "\\Sent"], ["drafts", "\\Drafts"],
  ["trash", "\\Trash"], ["deleted items", "\\Trash"], ["junk", "\\Junk"], ["spam", "\\Junk"], ["archive", "\\Archive"],
]);

export function inferSpecialUse(path: string, explicit?: string): string | null {
  if (explicit) return explicit;
  return KNOWN_SPECIAL_USE.get(path.toLocaleLowerCase("en-US")) ?? null;
}

export function hasAttachments(structure?: MessageStructureObject): boolean | null {
  if (!structure) return null;
  const nodes = [structure];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (!node) continue;
    if (node.childNodes) nodes.push(...node.childNodes);
    const disposition = node.disposition?.toLowerCase();
    const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
    if (disposition === "attachment" || Boolean(filename)) return true;
  }
  return false;
}

export function findSpecialMailbox(
  mailboxes: Array<{ path: string; specialUse?: string; name?: string }>,
  specialUse: "\\Drafts" | "\\Trash",
): string | null {
  const exact = mailboxes.find((mailbox) => mailbox.specialUse?.toLowerCase() === specialUse.toLowerCase());
  if (exact) return exact.path;
  const fallbackNames = specialUse === "\\Drafts" ? new Set(["drafts", "entwürfe", "entwuerfe"]) : new Set(["trash", "deleted items", "papierkorb", "gelöscht"]);
  return mailboxes.find((mailbox) => fallbackNames.has((mailbox.name ?? mailbox.path).toLocaleLowerCase("de-CH")))?.path ?? null;
}
