import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type EmailAttachment,
  type SendEmailRequestBody,
  sendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
import {
  MAX_ATTACHMENTS_PER_EMAIL,
  MAX_TOTAL_ATTACHMENT_BYTES,
  base64DecodedByteLength,
  emailAttachmentSchema,
  emailAttachmentsSchema,
} from "@/validators/email-attachment-schema";
import { createEmailAttachment } from "./create-email-attachment";
import { createEmailAttachmentFromFile } from "./create-email-attachment-from-file";
import { sendEmail } from "./send-email";
import { sendEmailToMailingList } from "./send-email-to-mailing-list";

const baseBody = {
  to: "support@schemavaults.com",
  subject: "Hello World!",
  message: {
    html: "<html><body><h1>Hello World!</h1></body></html>",
    text: "Hello World!",
  },
} satisfies SendEmailRequestBody;

// "Hello World!" as base64
const HELLO_WORLD_B64 = "SGVsbG8gV29ybGQh";

const pdfAttachment = {
  filename: "report.pdf",
  content: HELLO_WORLD_B64,
  contentType: "application/pdf",
} satisfies EmailAttachment;

/**
 * A valid base64 string that decodes to exactly `bytes` bytes. Requires
 *  `bytes` to be a multiple of 3 so no padding is needed.
 */
function base64OfSize(bytes: number): string {
  if (bytes % 3 !== 0) throw new Error("bytes must be a multiple of 3");
  return "A".repeat((bytes / 3) * 4);
}

describe("Attachments", () => {
  describe("request body schema", () => {
    test("are optional", () => {
      const parsed = sendEmailRequestBodySchema.safeParse(baseBody);
      expect(parsed.success).toBeTrue();
      if (parsed.success) {
        expect(parsed.data.attachments).toBeUndefined();
      }
    });

    test("can parse a message with a single attachment", () => {
      const parsed = sendEmailRequestBodySchema.safeParse({
        ...baseBody,
        attachments: [pdfAttachment],
      } satisfies SendEmailRequestBody);
      expect(parsed.success).toBeTrue();
      if (parsed.success) {
        expect(parsed.data.attachments).toEqual([pdfAttachment]);
      }
    });

    test("can parse a message with several attachments, including an inline one", () => {
      const parsed = sendEmailRequestBodySchema.safeParse({
        ...baseBody,
        message: {
          text: "See the attached logo.",
          html: '<p>See the attached logo:</p><img src="cid:logo@schemavaults" />',
        },
        attachments: [
          pdfAttachment,
          { filename: "notes.txt", content: HELLO_WORLD_B64 },
          {
            filename: "logo.png",
            content: HELLO_WORLD_B64,
            contentType: "image/png",
            contentId: "logo@schemavaults",
          },
        ],
      } satisfies SendEmailRequestBody);
      expect(parsed.success).toBeTrue();
    });

    test("can parse attachments alongside a template message", () => {
      const parsed = sendEmailRequestBodySchema.safeParse({
        ...baseBody,
        message: {
          template_id: "payment-receipt",
          template_props: { amount: "$10.00" },
        },
        attachments: [pdfAttachment],
      } satisfies SendEmailRequestBody);
      expect(parsed.success).toBeTrue();
    });

    test("rejects an empty attachments array", () => {
      const parsed = sendEmailRequestBodySchema.safeParse({
        ...baseBody,
        attachments: [],
      } satisfies SendEmailRequestBody);
      expect(parsed.success).toBeFalse();
    });

    test("rejects a non-array attachments value", () => {
      const parsed = sendEmailRequestBodySchema.safeParse({
        ...baseBody,
        attachments: pdfAttachment,
      });
      expect(parsed.success).toBeFalse();
    });

    test(`rejects more than ${MAX_ATTACHMENTS_PER_EMAIL} attachments`, () => {
      const attachments = Array.from(
        { length: MAX_ATTACHMENTS_PER_EMAIL + 1 },
        (_, i) => ({ filename: `file-${i}.txt`, content: HELLO_WORLD_B64 }),
      );
      expect(
        emailAttachmentsSchema.safeParse(attachments.slice(0, -1)).success,
      ).toBeTrue();
      expect(emailAttachmentsSchema.safeParse(attachments).success).toBeFalse();
    });

    test("enforces the total decoded size limit across all attachments", () => {
      // MAX_TOTAL_ATTACHMENT_BYTES is 25 MiB; 26214399 and 26214402 are the
      // nearest multiples of 3 just under and just over it.
      const atLimit = 26214399;
      const overLimit = 26214402;
      expect(atLimit).toBeLessThanOrEqual(MAX_TOTAL_ATTACHMENT_BYTES);
      expect(overLimit).toBeGreaterThan(MAX_TOTAL_ATTACHMENT_BYTES);

      expect(
        emailAttachmentsSchema.safeParse([
          { filename: "big.bin", content: base64OfSize(atLimit) },
        ]).success,
      ).toBeTrue();

      expect(
        emailAttachmentsSchema.safeParse([
          { filename: "big.bin", content: base64OfSize(overLimit) },
        ]).success,
      ).toBeFalse();

      // Two files that are each fine on their own but too big together.
      const half = 13107201; // multiple of 3, just over 12.5 MiB
      const overTogether = emailAttachmentsSchema.safeParse([
        { filename: "a.bin", content: base64OfSize(half) },
        { filename: "b.bin", content: base64OfSize(half) },
      ]);
      expect(overTogether.success).toBeFalse();
      if (!overTogether.success) {
        expect(overTogether.error.issues[0]?.message).toContain(
          "Attachments must total at most",
        );
      }
    });
  });

  describe("emailAttachmentSchema", () => {
    test("accepts the minimal shape", () => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "notes.txt",
          content: HELLO_WORLD_B64,
        }).success,
      ).toBeTrue();
    });

    test("accepts unicode filenames", () => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "Rapport annuel — été 2026.pdf",
          content: HELLO_WORLD_B64,
        }).success,
      ).toBeTrue();
    });

    test.each([
      "", // empty
      ".", // current dir
      "..", // parent dir
      "../secrets.txt", // path traversal
      "dir/file.txt", // forward slash
      "dir\\file.txt", // backslash
      "bad\nname.txt", // control character
      "bad\u0000name.txt", // NUL
      "a".repeat(256), // too long
    ])("rejects filename %j", (filename: string) => {
      expect(
        emailAttachmentSchema.safeParse({ filename, content: HELLO_WORLD_B64 })
          .success,
      ).toBeFalse();
    });

    test.each([
      "", // empty
      "not base64!", // invalid characters
      "SGVsbG8", // missing padding
      "SGVs bG8=", // whitespace
      "SGVsbG8=\n", // trailing newline
    ])("rejects content %j", (content: string) => {
      expect(
        emailAttachmentSchema.safeParse({ filename: "x.bin", content }).success,
      ).toBeFalse();
    });

    test("rejects non-string content", () => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "x.bin",
          content: new Uint8Array([1, 2, 3]),
        }).success,
      ).toBeFalse();
    });

    test.each([
      "application/pdf",
      "text/csv; charset=utf-8",
      "image/svg+xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      'text/plain; charset="utf-8"',
    ])("accepts contentType '%s'", (contentType: string) => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "x",
          content: HELLO_WORLD_B64,
          contentType,
        }).success,
      ).toBeTrue();
    });

    test.each([
      "", // empty
      "pdf", // no subtype
      "application/", // empty subtype
      "application/pdf/extra", // too many parts
      "application pdf", // whitespace
      "application/pdf;", // dangling parameter separator
    ])("rejects contentType %j", (contentType: string) => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "x",
          content: HELLO_WORLD_B64,
          contentType,
        }).success,
      ).toBeFalse();
    });

    test.each(["logo", "logo@schemavaults", "img-1.png"])(
      "accepts contentId '%s'",
      (contentId: string) => {
        expect(
          emailAttachmentSchema.safeParse({
            filename: "x",
            content: HELLO_WORLD_B64,
            contentId,
          }).success,
        ).toBeTrue();
      },
    );

    test.each([
      "", // empty
      "<logo@schemavaults>", // angle brackets belong to the transport
      "has space",
    ])("rejects contentId %j", (contentId: string) => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "x",
          content: HELLO_WORLD_B64,
          contentId,
        }).success,
      ).toBeFalse();
    });

    test("rejects unknown keys such as nodemailer's 'path'", () => {
      expect(
        emailAttachmentSchema.safeParse({
          filename: "x.pdf",
          content: HELLO_WORLD_B64,
          path: "/etc/passwd",
        }).success,
      ).toBeFalse();
    });
  });

  describe("base64DecodedByteLength", () => {
    test.each([
      ["", 0],
      ["QQ==", 1],
      ["QUI=", 2],
      ["QUJD", 3],
      [HELLO_WORLD_B64, 12],
    ])("'%s' decodes to %i bytes", (base64: string, bytes: number) => {
      expect(base64DecodedByteLength(base64)).toBe(bytes);
    });
  });

  describe("createEmailAttachment", () => {
    test("base64-encodes Uint8Array content", () => {
      const attachment = createEmailAttachment({
        filename: "hello.txt",
        content: new TextEncoder().encode("Hello World!"),
      });
      expect(attachment).toEqual({
        filename: "hello.txt",
        content: HELLO_WORLD_B64,
      });
    });

    test("base64-encodes Buffer content", () => {
      const attachment = createEmailAttachment({
        filename: "hello.txt",
        content: Buffer.from("Hello World!", "utf8"),
      });
      expect(attachment.content).toBe(HELLO_WORLD_B64);
    });

    test("base64-encodes ArrayBuffer content", () => {
      const bytes = new TextEncoder().encode("Hello World!");
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const attachment = createEmailAttachment({
        filename: "hello.txt",
        content: arrayBuffer,
      });
      expect(attachment.content).toBe(HELLO_WORLD_B64);
    });

    test("round-trips arbitrary binary content", () => {
      const bytes = new Uint8Array(1024);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919) % 256;
      const attachment = createEmailAttachment({
        filename: "noise.bin",
        content: bytes,
      });
      expect(new Uint8Array(Buffer.from(attachment.content, "base64"))).toEqual(
        bytes,
      );
    });

    test("treats string content as base64 by default", () => {
      const attachment = createEmailAttachment({
        filename: "hello.txt",
        content: HELLO_WORLD_B64,
      });
      expect(attachment.content).toBe(HELLO_WORLD_B64);
    });

    test("encodes string content as UTF-8 text when asked", () => {
      const attachment = createEmailAttachment({
        filename: "hello.txt",
        content: "Hello World!",
        encoding: "utf8",
      });
      expect(attachment.content).toBe(HELLO_WORLD_B64);

      const unicode = createEmailAttachment({
        filename: "hello.txt",
        content: "héllo wörld ✓",
        encoding: "utf8",
      });
      expect(Buffer.from(unicode.content, "base64").toString("utf8")).toBe(
        "héllo wörld ✓",
      );
    });

    test("passes an existing EmailAttachment through unchanged", () => {
      const attachment = createEmailAttachment({
        ...pdfAttachment,
        contentId: "report",
      });
      expect(attachment).toEqual({ ...pdfAttachment, contentId: "report" });
    });

    test("only includes contentType / contentId when provided", () => {
      const attachment = createEmailAttachment({
        filename: "x.bin",
        content: HELLO_WORLD_B64,
      });
      expect("contentType" in attachment).toBeFalse();
      expect("contentId" in attachment).toBeFalse();
    });

    test("throws a TypeError for a string that is not valid base64", () => {
      expect(() =>
        createEmailAttachment({ filename: "notes.txt", content: "Hello World!" }),
      ).toThrow(TypeError);
      expect(() =>
        createEmailAttachment({ filename: "notes.txt", content: "Hello World!" }),
      ).toThrow(/base64/);
    });

    test("throws a TypeError for an invalid filename", () => {
      expect(() =>
        createEmailAttachment({
          filename: "../escape.txt",
          content: HELLO_WORLD_B64,
        }),
      ).toThrow(/path separators/);
    });

    test("throws a TypeError for empty content", () => {
      expect(() =>
        createEmailAttachment({ filename: "empty.bin", content: new Uint8Array(0) }),
      ).toThrow(/must not be empty/);
    });

    test("throws a TypeError for unsupported content types", () => {
      expect(() =>
        createEmailAttachment({
          filename: "x.bin",
          // @ts-expect-error -- deliberately wrong at runtime
          content: 42,
        }),
      ).toThrow(TypeError);
    });
  });

  describe("createEmailAttachmentFromFile", () => {
    let dir: string | undefined;

    afterEach(async () => {
      if (dir) {
        await rm(dir, { recursive: true, force: true });
        dir = undefined;
      }
    });

    test("reads the file and uses its basename as the filename", async () => {
      dir = await mkdtemp(join(tmpdir(), "send-email-attachments-"));
      const path = join(dir, "hello.txt");
      await writeFile(path, "Hello World!", "utf8");

      const attachment = await createEmailAttachmentFromFile(path);
      expect(attachment).toEqual({
        filename: "hello.txt",
        content: HELLO_WORLD_B64,
      });
    });

    test("honours filename, contentType and contentId overrides", async () => {
      dir = await mkdtemp(join(tmpdir(), "send-email-attachments-"));
      const path = join(dir, "hello.txt");
      await writeFile(path, "Hello World!", "utf8");

      const attachment = await createEmailAttachmentFromFile(path, {
        filename: "greeting.txt",
        contentType: "text/plain; charset=utf-8",
        contentId: "greeting",
      });
      expect(attachment).toEqual({
        filename: "greeting.txt",
        content: HELLO_WORLD_B64,
        contentType: "text/plain; charset=utf-8",
        contentId: "greeting",
      });
    });

    test("rejects when the file does not exist", async () => {
      dir = await mkdtemp(join(tmpdir(), "send-email-attachments-"));
      await expect(
        createEmailAttachmentFromFile(join(dir, "missing.txt")),
      ).rejects.toThrow();
    });
  });

  describe("sendEmail()", () => {
    const originalFetch = globalThis.fetch;
    let requests: Array<{ url: string; init: RequestInit | undefined }> = [];

    function mockFetch(): void {
      requests = [];
      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;
    }

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function sentBody(): SendEmailRequestBody {
      expect(requests).toHaveLength(1);
      return JSON.parse(String(requests[0]!.init?.body)) as SendEmailRequestBody;
    }

    const connection = {
      bearerToken: "svlts_mail_pk_test",
      mailServerUrl: "https://mail.example.test",
    };

    test("sends body.attachments through verbatim", async () => {
      mockFetch();
      await sendEmail({
        ...connection,
        body: { ...baseBody, attachments: [pdfAttachment] },
      });
      expect(requests[0]!.url).toBe("https://mail.example.test/api/send");
      expect(sentBody().attachments).toEqual([pdfAttachment]);
    });

    test("encodes opts.attachments and appends them after body.attachments", async () => {
      mockFetch();
      await sendEmail({
        ...connection,
        body: { ...baseBody, attachments: [pdfAttachment] },
        attachments: [
          {
            filename: "hello.txt",
            content: new TextEncoder().encode("Hello World!"),
            contentType: "text/plain",
          },
          { filename: "readme.txt", content: "Hello World!", encoding: "utf8" },
        ],
      });
      expect(sentBody().attachments).toEqual([
        pdfAttachment,
        {
          filename: "hello.txt",
          content: HELLO_WORLD_B64,
          contentType: "text/plain",
        },
        { filename: "readme.txt", content: HELLO_WORLD_B64 },
      ]);
    });

    test("omits 'attachments' from the request when there are none", async () => {
      mockFetch();
      await sendEmail({ ...connection, body: baseBody, attachments: [] });
      expect("attachments" in sentBody()).toBeFalse();
    });

    test("treats an empty body.attachments array as 'no attachments'", async () => {
      mockFetch();
      await sendEmail({ ...connection, body: { ...baseBody, attachments: [] } });
      expect("attachments" in sentBody()).toBeFalse();
    });

    test("rejects invalid opts.attachments before contacting the server", async () => {
      mockFetch();
      await expect(
        sendEmail({
          ...connection,
          body: baseBody,
          attachments: [{ filename: "../escape.txt", content: HELLO_WORLD_B64 }],
        }),
      ).rejects.toThrow(TypeError);
      expect(requests).toHaveLength(0);
    });

    test("rejects an oversized attachment set before contacting the server", async () => {
      mockFetch();
      const originalError = console.error;
      console.error = () => {};
      try {
        await expect(
          sendEmail({
            ...connection,
            body: {
              ...baseBody,
              attachments: [
                { filename: "big.bin", content: base64OfSize(26214402) },
              ],
            },
          }),
        ).rejects.toThrow("Bad request body to send email with!");
      } finally {
        console.error = originalError;
      }
      expect(requests).toHaveLength(0);
    });

    test("flows opts.attachments through sendEmailToMailingList()", async () => {
      mockFetch();
      const mailingListId = "00000000-0000-4000-8000-000000000000";
      await sendEmailToMailingList({
        ...connection,
        mailingListId,
        body: { subject: baseBody.subject, message: baseBody.message },
        attachments: [
          { filename: "hello.txt", content: new TextEncoder().encode("Hello World!") },
        ],
      });
      const body = sentBody();
      expect(body.to).toBe(mailingListId);
      expect(body.attachments).toEqual([
        { filename: "hello.txt", content: HELLO_WORLD_B64 },
      ]);
    });
  });
});
