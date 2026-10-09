// create-email-attachment-from-file.ts
//
// Node/Bun only: reads from the filesystem. Deliberately NOT re-exported from
// the package's main entry point, which must stay free of `node:` imports so
// it can be bundled for environments without a filesystem. Import it via the
// "@schemavaults/send-email/create-email-attachment-from-file" subpath.
// `src/browser-compatibility.test.ts` enforces this separation.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  createEmailAttachment,
  type EmailAttachmentInput,
} from "./create-email-attachment";
import type { EmailAttachment } from "@/validators/email-attachment-schema";

export type ICreateEmailAttachmentFromFileOpts = Partial<
  Pick<EmailAttachmentInput, "filename" | "contentType" | "contentId">
>;

/**
 * Read a file from disk and turn it into a validated {@link EmailAttachment}.
 *  The file's basename is used as the attachment filename unless overridden.
 */
export async function createEmailAttachmentFromFile(
  path: string,
  opts: ICreateEmailAttachmentFromFileOpts = {},
): Promise<EmailAttachment> {
  const bytes = await readFile(path);
  return createEmailAttachment({
    filename: opts.filename ?? basename(path),
    content: bytes,
    ...(opts.contentType !== undefined
      ? { contentType: opts.contentType }
      : {}),
    ...(opts.contentId !== undefined ? { contentId: opts.contentId } : {}),
  });
}

export default createEmailAttachmentFromFile;
