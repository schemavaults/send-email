export default function resolveMailServerUrlFromEnvVars(): string {
  const SCHEMAVAULTS_MAIL_SERVER_URL: string | undefined =
    process.env.SCHEMAVAULTS_MAIL_SERVER_URL;
  if (
    typeof SCHEMAVAULTS_MAIL_SERVER_URL === "string" &&
    SCHEMAVAULTS_MAIL_SERVER_URL.length > 0
  ) {
    return SCHEMAVAULTS_MAIL_SERVER_URL;
  }
  throw new TypeError(
    `Failed to parse mail server URL from environment variable 'SCHEMAVAULTS_MAIL_SERVER_URL'`,
  );
}
