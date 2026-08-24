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
      "s", // single lowercase letter both starts and ends the ID
      "smtp-primary",
      "ses_us_east_1",
      "ses-us-east-1",
      "a".repeat(64), // exactly at the length limit
    ])("accepts '%s'", (id: string) => {
      expect(transportIdSchema.safeParse(id).success).toBeTrue();
    });

    test.each([
      "", // empty
      "1transport", // must start with a lowercase letter
      "-transport", // must start with a lowercase letter
      "_transport", // must start with a lowercase letter
      "SMTP_Primary", // no uppercase
      "smtpPrimary", // no uppercase
      "mail.example.com", // no periods
      "transport-", // must end with a lowercase alphanumeric character
      "transport_", // must end with a lowercase alphanumeric character
      "has space",
      "has/slash",
      "a".repeat(65), // too long
    ])("rejects '%s'", (id: string) => {
      expect(transportIdSchema.safeParse(id).success).toBeFalse();
    });
  });
});
