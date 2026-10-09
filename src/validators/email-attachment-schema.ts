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

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Name the recipient's mail client shows for the attached file. Unicode is
 *  allowed; path separators and control characters are not.
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

/**
 * MIME type of the attachment, e.g. "application/pdf" or
 *  "text/csv; charset=utf-8". When omitted, the mail-server's transport
 *  derives it from the filename's extension.
 */
export const attachmentContentTypeSchema = z
  .string()
  .min(1, "Attachment content type must be non-empty!")
  .max(255, "Attachment content type must be at most 255 characters!")
  .regex(
    new RegExp(
      `^${MIME_TOKEN}\\/${MIME_TOKEN}(?:\\s*;\\s*${MIME_TOKEN}=(?:"[^"]*"|[^\\s;"]+))*$`,
    ),
    "Attachment content type must be a MIME type such as 'application/pdf'!",
  );

/**
 * Content-ID for inline attachments. Setting it marks the attachment as
 *  inline so the HTML body can reference it as `<img src="cid:<contentId>">`.
 *  Pass the bare identifier -- without the angle brackets.
 */
export const attachmentContentIdSchema = z
  .string()
  .min(1, "Attachment content ID must be non-empty!")
  .max(255, "Attachment content ID must be at most 255 characters!")
  .regex(
    /^[^\s<>]+$/,
    "Attachment content ID must not contain whitespace or angle brackets!",
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
