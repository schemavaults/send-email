
export function getSchemaVaultsMailingListId(): string {
  if (
    !process.env.SCHEMAVAULTS_MAILING_LIST_ID ||
    typeof process.env.SCHEMAVAULTS_MAILING_LIST_ID !== "string"
  ) {
    throw new Error(
      "Failed to load mailing list ID from environment variable 'SCHEMAVAULTS_MAILING_LIST_ID'",
    );
  }
  return process.env.SCHEMAVAULTS_MAILING_LIST_ID;
}

export default getSchemaVaultsMailingListId;
