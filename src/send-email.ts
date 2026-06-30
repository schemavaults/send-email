// send-email.ts

import {
  type SendEmailRequestBody,
  createSendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
import getSchemaVaultsMailApiKey from "./get-api-key";
import parseMailServerUrlWithEnvFallback from "./parse-mail-server-url-with-env-fallback";

const body_schema = createSendEmailRequestBodySchema(true);

export interface ISendEmailOpts {
  body: SendEmailRequestBody;
  bearerToken?: string;
  mailServerUrl?: string;
  dryRun?: boolean;
}

export { getSchemaVaultsMailApiKey };

export async function sendEmail({
  body,
  ...opts
}: ISendEmailOpts): Promise<void> {
  const effectiveBody: SendEmailRequestBody =
    typeof opts.dryRun === "boolean" ? { ...body, dryRun: opts.dryRun } : body;

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
