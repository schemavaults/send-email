import getSchemaVaultsMailApiKey from "./get-api-key";
import parseMailServerUrlWithEnvFallback from "./parse-mail-server-url-with-env-fallback";

export interface EmailTemplate {
  id: string;
  description: string;
}

export interface IListEmailTemplatesOpts {
  bearerToken?: string;
  mailServerUrl?: string;
}

export async function listEmailTemplates(
  opts: IListEmailTemplatesOpts = {},
): Promise<EmailTemplate[]> {
  const mail_server_url: string = parseMailServerUrlWithEnvFallback(
    opts.mailServerUrl,
  );

  let bearerToken: string;
  if (opts.bearerToken && typeof opts.bearerToken === "string") {
    bearerToken = opts.bearerToken;
  } else {
    bearerToken = getSchemaVaultsMailApiKey();
  }

  const endpoint: URL = new URL("/api/templates", mail_server_url);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok || response.status !== 200) {
    let errorMessage = "Error response while trying to list email templates!";
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
    throw new Error("Failed to parse JSON object from response!");
  }
  if (!("success" in responseBody) || !responseBody.success) {
    throw new Error("Failure indicated in response body!");
  }
  if (!("data" in responseBody) || !Array.isArray(responseBody.data)) {
    throw new Error("Missing 'data' array in response body!");
  }

  return responseBody.data as EmailTemplate[];
}

export default listEmailTemplates;
