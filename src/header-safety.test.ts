import { describe, expect, test } from "bun:test";
import { createSendEmailRequestBodySchema } from "./send-email-request-body-schema";
import {
  attachmentContentIdSchema,
  attachmentContentTypeSchema,
  attachmentFilenameSchema,
} from "@/validators/email-attachment-schema";

/**
 * These fields end up in MIME headers. Each must reject anything that could
 *  break out of its header (CR/LF and other controls), corrupt it, or
 *  disguise what the recipient sees, while still accepting every value a
 *  correct client sends.
 */

const RLO = String.fromCharCode(0x202e); // right-to-left override
const NEL = String.fromCharCode(0x85); // a C1 control
const subjectSchema = createSendEmailRequestBodySchema().shape.subject;

const cases = {
  contentType: {
    schema: attachmentContentTypeSchema,
    valid: [
      "application/pdf",
      "text/csv; charset=utf-8",
      "text/plain;charset=us-ascii",
      'multipart/mixed; boundary="----=_Part_0_123.456"',
      'text/plain; name="report (final).txt"',
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/svg+xml",
    ],
    invalid: [
      'text/plain; name="x\r\nBcc: v@example.com"', // header injection
      "text/plain;\r\n\r\nname=x", // premature end of headers
      'text/plain; name="x\x00y"', // NUL in a quoted value
      "text/plain; name=x\x00y", // NUL in an unquoted value
      'text/plain; name="x\ty"', // tab in a quoted value
      'text/plain; name="café"', // non-ASCII; belongs in the filename
    ],
  },
  contentId: {
    schema: attachmentContentIdSchema,
    valid: ["logo", "image001.png@01D9A1B2.C3D4E5F0", "part1.2.3@example.com"],
    invalid: ["a\x00b", "a\x7fb", "café", "a b", "<logo>"],
  },
  filename: {
    schema: attachmentFilenameSchema,
    valid: ["résumé.pdf", "报告.pdf", "report (final).csv", "emoji 😀.txt"],
    invalid: [
      `invoice${RLO}fdp.exe`, // displays as "invoiceexe.pdf"
      `a${NEL}b.txt`,
      "a\r\nb.txt",
    ],
  },
  subject: {
    schema: subjectSchema,
    valid: ["Welcome!", "Ünïcödé ✓ 😀", "Tab\tseparated"],
    invalid: ["Hi\r\nBcc: v@example.com", "Hi\nthere", "Hi\x00"],
  },
};

for (const [field, { schema, valid, invalid }] of Object.entries(cases)) {
  describe(`${field} header safety`, () => {
    test.each(valid)("accepts %j", (value: string) => {
      expect(schema.safeParse(value).success).toBeTrue();
    });

    test.each(invalid)("rejects %j", (value: string) => {
      expect(schema.safeParse(value).success).toBeFalse();
    });
  });
}
