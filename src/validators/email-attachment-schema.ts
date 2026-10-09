import { z } from "zod";

/**
 * Maximum number of attachments accepted on a single email.
 */
export const MAX_ATTACHMENTS_PER_EMAIL: number = 20;

/**
 * Maximum combined size, in decoded bytes, of every attachment on a single
 *  email (25 MiB). Most receiving mail systems reject whole messages larger
 *  than this, so bigger payloads would never be deliverable regardless of
 *  which transport the mail-server uses. The mail-server (and the platform
 *  it is hosted on) may enforce a lower limit of its own.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES: number = 25 * 1024 * 1024;

/**
 * Number of bytes a (padded, whitespace-free) base64 string decodes to,
 *  computed without actually decoding it.
 */
export function base64DecodedByteLength(base64: string): number {
  if (base64.length === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// C0, DEL and C1 controls.
function hasControlCharacters(value: string): boolean {
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

function hasBidiFormatting(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (BIDI_FORMATTING.has(value.charCodeAt(i))) return true;
  }
  return false;
}

/**
 * Name the recipient's mail client shows for the attached file. Unicode is
 *  allowed; path separators, control characters and bidirectional formatting
 *  characters are not.
 */
export const attachmentFilenameSchema = z
  .string()
  .min(1, "Attachment filename must be non-empty!")
  .max(255, "Attachment filename must be at most 255 characters!")
  .refine((name) => name !== "." && name !== "..", {
    message: "Attachment filename must not be '.' or '..'!",
  })
  .refine((name) => !name.includes("/") && !name.includes("\\"), {
    message: "Attachment filename must not contain path separators!",
  })
  .refine((name) => !hasControlCharacters(name), {
    message: "Attachment filename must not contain control characters!",
  })
  .refine((name) => !hasBidiFormatting(name), {
    message:
      "Attachment filename must not contain bidirectional formatting characters!",
  });

/**
 * The attached file's bytes, base64-encoded (standard alphabet, padded, no
 *  line breaks). Request bodies are JSON, so binary content has to travel
 *  as text.
 */
export const attachmentContentSchema = z
  .base64("Attachment content must be base64-encoded!")
  .min(1, "Attachment content must not be empty!");

const MIME_TOKEN = "[A-Za-z0-9!#$&^_.+-]+";
// Printable ASCII only, so no value can carry CR/LF or other controls out of
// its header. Quoted: anything printable but `"`. Unquoted: printable minus
// space, `"` and `;`.
const MIME_PARAM_VALUE =
  '(?:"[\\x20\\x21\\x23-\\x7E]*"|[\\x21\\x23-\\x3A\\x3C-\\x7E]+)';

/**
 * MIME type of the attachment, e.g. "application/pdf" or
 *  "text/csv; charset=utf-8". Printable ASCII only. When omitted, the
 *  mail-server's transport derives it from the filename's extension.
 */
export const attachmentContentTypeSchema = z
  .string()
  .min(1, "Attachment content type must be non-empty!")
  .max(255, "Attachment content type must be at most 255 characters!")
  .regex(
    // `[ \t]*`, not `\s*`: `\s` matches CR/LF.
    new RegExp(
      `^${MIME_TOKEN}\\/${MIME_TOKEN}(?:[ \\t]*;[ \\t]*${MIME_TOKEN}=${MIME_PARAM_VALUE})*$`,
    ),
    "Attachment content type must be a MIME type such as 'application/pdf'!",
  );

/**
 * Content-ID for inline attachments. Setting it marks the attachment as
 *  inline so the HTML body can reference it as `<img src="cid:<contentId>">`.
 *  Pass the bare identifier -- without the angle brackets. Content-ID is an
 *  ASCII header; anything else is emitted as an encoded-word that no longer
 *  matches the HTML's `cid:` reference.
 */
export const attachmentContentIdSchema = z
  .string()
  .min(1, "Attachment content ID must be non-empty!")
  .max(255, "Attachment content ID must be at most 255 characters!")
  .regex(
    /^[\x21-\x3B\x3D\x3F-\x7E]+$/,
    "Attachment content ID must be printable ASCII without spaces or angle brackets!",
  );

/**
 * A single file attached to an email, in the shape accepted by the
 *  `@schemavaults/mail-server` `/api/send` route.
 */
export const emailAttachmentSchema = z
  .object({
    filename: attachmentFilenameSchema,
    content: attachmentContentSchema,
    contentType: attachmentContentTypeSchema.optional(),
    contentId: attachmentContentIdSchema.optional(),
  })
  .required({
    filename: true,
    content: true,
  })
  .strict();

export type EmailAttachment = z.infer<typeof emailAttachmentSchema>;

/**
 * The full list of attachments on one email: between 1 and
 *  {@link MAX_ATTACHMENTS_PER_EMAIL} files whose decoded sizes add up to at
 *  most {@link MAX_TOTAL_ATTACHMENT_BYTES}.
 */
export const emailAttachmentsSchema = z
  .array(emailAttachmentSchema)
  .min(1, "Provide at least one attachment, or omit 'attachments' entirely!")
  .max(
    MAX_ATTACHMENTS_PER_EMAIL,
    `An email may have at most ${MAX_ATTACHMENTS_PER_EMAIL} attachments!`,
  )
  .superRefine((attachments, ctx) => {
    let totalBytes = 0;
    for (const attachment of attachments) {
      totalBytes += base64DecodedByteLength(attachment.content);
    }
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `Attachments must total at most ${MAX_TOTAL_ATTACHMENT_BYTES} bytes (${MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)} MiB) once decoded; received ${totalBytes} bytes.`,
      });
    }
  });

export default emailAttachmentSchema;
