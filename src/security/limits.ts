export const LIMITS = {
  searchResultsAbsolute: 50,
  readEmailCount: 10,
  bodyCharactersAbsolute: 50_000,
  searchTermCharacters: 500,
  mailboxCharacters: 255,
  uidMaximum: 4_294_967_295,
  writeUidCount: 100,
  recipientCountAbsolute: 100,
  subjectCharacters: 998,
  sendBodyCharactersAbsolute: 500_000,
  confirmationTokenCharacters: 4096,
  requestBodyBytes: 768 * 1024,
} as const;

export function truncateText(value: string, maximum: number): { text: string; truncated: boolean } {
  const characters = Array.from(value);
  if (characters.length <= maximum) return { text: value, truncated: false };
  return { text: characters.slice(0, maximum).join(""), truncated: true };
}
