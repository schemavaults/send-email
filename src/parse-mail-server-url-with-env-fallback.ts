import isValidUrl from "@/validators/is-valid-url";
import getMailServerUrlFromEnvVars from "@/env/get-mail-server-url";

export default function parseMailServerUrlWithEnvFallback(
  maybe_mail_server_url_input: string | undefined,
): string {
  if (
    typeof maybe_mail_server_url_input !== "string" &&
    typeof maybe_mail_server_url_input !== "undefined"
  ) {
    throw new TypeError(
      "Expected 'mailServerUrl' option to be a string or undefined!",
      {
        cause: `Received type '${typeof maybe_mail_server_url_input}'`,
      },
    );
  }

  let mail_server_url: string | undefined = undefined;
  if (typeof maybe_mail_server_url_input === "string") {
    mail_server_url = maybe_mail_server_url_input;
  } else if (typeof maybe_mail_server_url_input === "undefined") {
    try {
      mail_server_url = getMailServerUrlFromEnvVars();
    } catch {
      /** no-op */
    }
  }

  if (!isValidUrl(mail_server_url)) {
    throw new TypeError(
      "Failed to parse a valid mail server URL from sendEmail input options or environment variable 'SCHEMAVAULTS_MAIL_SERVER_URL'!",
    );
  }

  return mail_server_url;
}
