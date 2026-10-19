import { describe, expect, test } from "bun:test";
import {
  type SendEmailRequestBody,
  sendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
import { emailSenderSchema } from "@/validators/email-sender-schema";

const baseBody = {
  to: "support@schemavaults.com",
  subject: "Hello World!",
  message: {
    html: "<html><body><h1>Hello World!</h1></body></html>",
    text: "Hello World!",
  },
} satisfies SendEmailRequestBody;

describe("Sender", () => {
  test.each([
    "noreply@example.com",
    "Example <noreply@example.com>",
    "Example<noreply@example.com>",
    "Example Inc. <noreply@example.com>",
    '"Example, Inc." <noreply@example.com>',
    '"support@example.com" <noreply@example.com>',
    "Café Müller <noreply@example.com>",
    "报告 <noreply@example.com>",
  ])("accepts %j", (from: string) => {
    expect(emailSenderSchema.safeParse(from).success).toBeTrue();
  });

  test.each([
    ["", "must be an email address"],
    ["Example noreply@example.com", "must be an email address"],
    [" Example <noreply@example.com>", "must be an email address"],
    ["Example <noreply@example.com> ", "must be an email address"],
    ["Example <not-an-email>", "must be a valid email address"],
    ["<noreply@example.com>", "must not be empty"],
    ['"" <noreply@example.com>', "must not be empty"],
    ["Example, Inc. <noreply@example.com>", "must be wrapped in double quotes"],
    ["a@example.com <noreply@example.com>", "must be wrapped in double quotes"],
    ['Bob "the" Builder <noreply@example.com>', "double quotes or backslashes"],
    ['"Back\\slash" <noreply@example.com>', "double quotes or backslashes"],
    ["Example <a@example.com> <b@example.com>", "angle brackets"],
    ["Ex>ample <noreply@example.com>", "angle brackets"],
  ])("rejects %j", (from: string, message: string) => {
    const parsed = emailSenderSchema.safeParse(from);
    expect(parsed.success).toBeFalse();
    expect(parsed.error?.issues[0]?.message).toContain(message);
  });

  test("a display name passes through the request body unchanged", () => {
    const from = '"Example, Inc." <noreply@example.com>';
    const parsed = sendEmailRequestBodySchema.safeParse({ ...baseBody, from });
    expect(parsed.success).toBeTrue();
    expect(parsed.data?.from).toBe(from);
  });

  test("an invalid sender fails the request body", () => {
    const parsed = sendEmailRequestBodySchema.safeParse({
      ...baseBody,
      from: "Example, Inc. <noreply@example.com>",
    });
    expect(parsed.success).toBeFalse();
    expect(parsed.error?.issues[0]?.path).toEqual(["from"]);
  });
});
