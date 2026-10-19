import { z } from "zod";
import {
  hasBidiFormatting,
  hasControlCharacters,
} from "@/validators/unsafe-characters";

const emailAddressSchema = z.string().email();

// RFC 5322 specials a display name may only carry inside double quotes.
// "." is a special too, but every mail client accepts it unquoted (as in
// "Example Inc. <noreply@example.com>"), so it is allowed.
const DISPLAY_NAME_SPECIALS = /[()[\]:;@,]/;

/**
 * Why `value` is not an acceptable sender, or null when it is. Accepts a bare
 *  address, or a display name followed by the address in angle brackets.
 */
function describeEmailSenderProblem(value: string): string | null {
  if (hasControlCharacters(value)) {
    return "Sender must not contain line breaks or control characters!";
  }
  if (hasBidiFormatting(value)) {
    return "Sender must not contain bidirectional formatting characters!";
  }
  if (emailAddressSchema.safeParse(value).success) return null;

  // Split on the last "<" rather than with a regex: one with optional spaces
  // around the split backtracks quadratically on long input. Any other angle
  // bracket is rejected below, so the bracketed address is the only one.
  const open = value.lastIndexOf("<");
  if (open < 0 || !value.endsWith(">") || value.trim() !== value) {
    return "Sender must be an email address (noreply@example.com) or a display name followed by an address in angle brackets (Example <noreply@example.com>)!";
  }
  const address = value.slice(open + 1, -1);
  const name = value.slice(0, open).trimEnd();
  if (!emailAddressSchema.safeParse(address).success) {
    return "Sender address in angle brackets must be a valid email address!";
  }

  const quoted = name.length >= 2 && name.startsWith('"') && name.endsWith('"');
  const text = quoted ? name.slice(1, -1) : name;
  if (text.trim().length === 0) {
    return "Sender display name must not be empty!";
  }
  if (/[<>"\\]/.test(text)) {
    return "Sender display name must not contain angle brackets, double quotes or backslashes!";
  }
  if (!quoted && DISPLAY_NAME_SPECIALS.test(text)) {
    return 'Sender display names containing ( ) [ ] : ; @ or , must be wrapped in double quotes (e.g. "Example, Inc." <noreply@example.com>)!';
  }
  return null;
}

/**
 * Who an email is from: a bare address ("noreply@example.com"), or a display
 *  name followed by the address in angle brackets
 *  ("Example <noreply@example.com>"). Unicode display names are allowed; one
 *  containing any of `( ) [ ] : ; @ ,` must be wrapped in double quotes
 *  ('"Example, Inc." <noreply@example.com>'). Control characters, bidi
 *  formatting characters, and angle brackets, double quotes or backslashes
 *  within the display name are rejected.
 */
export const emailSenderSchema = z.string().superRefine((value, ctx) => {
  const problem = describeEmailSenderProblem(value);
  if (problem !== null) {
    ctx.addIssue({ code: "custom", message: problem });
  }
});

export default emailSenderSchema;
