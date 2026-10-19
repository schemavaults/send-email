// C0, DEL and C1 controls.
export function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

// Bidirectional formatting characters (ALM, LRM, RLM, LRE through RLO, LRI
// through PDI) let a filename like "invoice<U+202E>fdp.exe" display as
// "invoiceexe.pdf". Listed as code points because the characters are
// invisible in source.
const BIDI_FORMATTING = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
  0x2067, 0x2068, 0x2069,
]);

export function hasBidiFormatting(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (BIDI_FORMATTING.has(value.charCodeAt(i))) return true;
  }
  return false;
}
