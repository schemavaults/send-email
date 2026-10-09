// create-email-attachment.ts

import {
  type EmailAttachment,
  emailAttachmentSchema,
} from "@/validators/email-attachment-schema";

/**
 * Input accepted by {@link createEmailAttachment}. A ready-made
 *  {@link EmailAttachment} is also valid input (its `content` is base64,
 *  which is the default string interpretation), so the two can be mixed
 *  freely in `ISendEmailOpts.attachments`.
 */
export interface EmailAttachmentInput {
  /** Name the recipient's mail client shows for the file. */
  filename: string;
  /**
   * The file's bytes. Binary data may be passed as a `Uint8Array` (Node's
   *  `Buffer` included) or an `ArrayBuffer`. A string is treated as
   *  base64-encoded bytes -- the request body's wire format -- unless
   *  `encoding` is set to "utf8", in which case the string itself is the
   *  file's (plain-text) content.
   */
  content: string | Uint8Array | ArrayBuffer;
  /**
   * How to interpret a string `content`. Ignored for binary content.
   *  - "base64" (default): `content` is already base64-encoded.
   *  - "utf8": `content` is the file's text and will be encoded here.
   */
  encoding?: "base64" | "utf8";
  /** MIME type; derived from the filename's extension when omitted. */
  contentType?: string;
  /** Content-ID for inline use via `cid:` references in the HTML body. */
  contentId?: string;
}

/**
 * Base64-encode raw bytes, with the standard alphabet and padding. Uses
 *  `Buffer` where available (Node, Bun) and falls back to `btoa` elsewhere.
 */
export function encodeBytesAsBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Build a validated {@link EmailAttachment} for `body.attachments`, taking
 *  care of base64-encoding binary or plain-text content.
 *
 * @throws TypeError when the resulting attachment fails validation (bad
 *  filename, malformed base64, unsupported content type, ...).
 */
export function createEmailAttachment(
  input: EmailAttachmentInput,
): EmailAttachment {
  let content: string;
  if (typeof input.content === "string") {
    content =
      input.encoding === "utf8"
        ? encodeBytesAsBase64(new TextEncoder().encode(input.content))
        : input.content;
  } else if (input.content instanceof Uint8Array) {
    content = encodeBytesAsBase64(input.content);
  } else if (input.content instanceof ArrayBuffer) {
    content = encodeBytesAsBase64(new Uint8Array(input.content));
  } else {
    throw new TypeError(
      "Expected attachment 'content' to be a string, Uint8Array or ArrayBuffer!",
      { cause: `Received type '${typeof input.content}'` },
    );
  }

  const candidate: EmailAttachment = {
    filename: input.filename,
    content,
    ...(input.contentType !== undefined
      ? { contentType: input.contentType }
      : {}),
    ...(input.contentId !== undefined ? { contentId: input.contentId } : {}),
  };

  const parsed = emailAttachmentSchema.safeParse(candidate);
  if (!parsed.success) {
    const reasons = parsed.error.issues.map((issue) => issue.message);
    throw new TypeError(
      `Invalid email attachment '${String(input.filename)}': ${reasons.join(" ")}`,
    );
  }
  return parsed.data;
}

export default createEmailAttachment;
