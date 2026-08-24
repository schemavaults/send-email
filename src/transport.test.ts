import { describe, expect, test } from "bun:test";
import {
  type SendEmailRequestBody,
  sendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
import { transportIdSchema } from "@/validators/transport-id-schema";

const baseBody = {
  to: "support@schemavaults.com",
  subject: "Hello World!",
  message: {
    html: "<html><body><h1>Hello World!</h1></body></html>",
    text: "Hello World!",
  },
} satisfies Omit<SendEmailRequestBody, "transport">;

describe("Transport", () => {
  test("is optional", () => {
    const parsed = sendEmailRequestBodySchema.safeParse({
      ...baseBody,
    } satisfies SendEmailRequestBody);
    expect(parsed.success).toBeTrue();
    if (parsed.success) {
      expect(parsed.data.transport).toBeUndefined();
    }
  });

  test("can parse a message naming a transport", () => {
    const parsed = sendEmailRequestBodySchema.safeParse({
      ...baseBody,
      transport: "smtp-primary",
    } satisfies SendEmailRequestBody);
    expect(parsed.success).toBeTrue();
    if (parsed.success) {
      expect(parsed.data.transport).toBe("smtp-primary");
    }
  });

  test("rejects a non-string transport", () => {
    const parsed = sendEmailRequestBodySchema.safeParse({
      ...baseBody,
      transport: 1,
    });
    expect(parsed.success).toBeFalse();
  });

  test("rejects an empty transport", () => {
    const parsed = sendEmailRequestBodySchema.safeParse({
      ...baseBody,
      transport: "",
    } satisfies SendEmailRequestBody);
    expect(parsed.success).toBeFalse();
  });

  describe("transportIdSchema", () => {
    test.each([
      "resend",
      "smtp",
      "s",
      "SMTP_Primary",
      "ses-us-east-1",
      "mail.example.com",
    ])("accepts '%s'", (id: string) => {
      expect(transportIdSchema.safeParse(id).success).toBeTrue();
    });

    test.each([
      "", // empty
      "1transport", // must start with a letter
      "-transport", // must start with a letter
      "has space",
      "has/slash",
      "a".repeat(65), // too long
    ])("rejects '%s'", (id: string) => {
      expect(transportIdSchema.safeParse(id).success).toBeFalse();
    });
  });
});
