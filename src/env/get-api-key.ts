export function getSchemaVaultsMailApiKey(): string {
  if (
    !process.env.SCHEMAVAULTS_MAIL_API_KEY ||
    typeof process.env.SCHEMAVAULTS_MAIL_API_KEY !== "string"
  ) {
    throw new Error(
      "Failed to load API key from environment variable 'SCHEMAVAULTS_MAIL_API_KEY'",
    );
  }
  return process.env.SCHEMAVAULTS_MAIL_API_KEY;
}

export default getSchemaVaultsMailApiKey;
