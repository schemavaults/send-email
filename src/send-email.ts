// send-email.ts

import {
  type SendEmailRequestBody,
  createSendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
import type { EmailAttachment } from "@/validators/email-attachment-schema";
import {
  createEmailAttachment,
  type EmailAttachmentInput,
} from "./create-email-attachment";
import getSchemaVaultsMailApiKey from "@/env/get-api-key";
import parseMailServerUrlWithEnvFallback from "./parse-mail-server-url-with-env-fallback";

const body_schema = createSendEmailRequestBodySchema(true);

export interface ISendEmailOpts {
  body: SendEmailRequestBody;
  bearerToken?: string;
  mailServerUrl?: string;
  dryRun?: boolean;
  /**
   * Convenience override for `body.transport` -- names which of the
   *  mail-server's configured transports should deliver this email.
   */
  transport?: string;
  /**
   * Convenience for `body.attachments` -- files to attach to the email.
   *  Unlike `body.attachments`, binary content (`Uint8Array`, `Buffer`,
   *  `ArrayBuffer`) and plain text (`encoding: "utf8"`) are accepted here
   *  and base64-encoded for you; see `createEmailAttachment`. Appended after
   *  any attachments already present on `body`.
   */
  attachments?: EmailAttachmentInput[];
}

export { getSchemaVaultsMailApiKey };

export async function sendEmail({
  body,
  ...opts
}: ISendEmailOpts): Promise<void> {
  const { attachments: bodyAttachments, ...bodyWithoutAttachments } = body;
  const attachments: EmailAttachment[] = [
    ...(bodyAttachments ?? []),
    ...(opts.attachments ?? []).map(createEmailAttachment),
  ];

  const effectiveBody: SendEmailRequestBody = {
    ...bodyWithoutAttachments,
    ...(typeof opts.dryRun === "boolean" ? { dryRun: opts.dryRun } : {}),
    ...(typeof opts.transport === "string" ? { transport: opts.transport } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  const parsed = await body_schema.safeParseAsync(effectiveBody);
  if (!parsed.success) {
    console.error("Bad request body: ", parsed.error);
    throw new TypeError("Bad request body to send email with!");
  }

  let bearerToken: string;
  if (opts.bearerToken && typeof opts.bearerToken === "string") {
    bearerToken = opts.bearerToken;
  } else {
    bearerToken = getSchemaVaultsMailApiKey();
  }

  const mail_server_url: string = parseMailServerUrlWithEnvFallback(
    opts.mailServerUrl,
  );

  const endpoint: URL = new URL(`/api/send`, mail_server_url);
  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(parsed.data satisfies SendEmailRequestBody),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!response.ok || response.status !== 200) {
    let errorMessage = "Error response while trying to send email!";
    try {
      const errBody = await response.json();
      if (
        typeof errBody === "object" &&
        !!errBody &&
        "message" in errBody &&
        typeof errBody.message === "string"
      ) {
        errorMessage = errBody.message;
      }
    } catch {
      // ignore JSON parse failure, fall back to default
    }
    throw new Error(errorMessage);
  }
  const responseBody = await response.json();
  if (typeof responseBody !== "object" || !responseBody) {
    throw new Error("Failed to parse JSON object from response object!");
  }
  if (!("success" in responseBody) || !responseBody.success) {
    throw new Error("Failure indicated in response body!");
  }

  return;
}

export default sendEmail;
