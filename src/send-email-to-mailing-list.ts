import type { SendEmailRequestBody } from "./send-email-request-body-schema";
import sendEmail, { type ISendEmailOpts } from "./send-email";
import isValidUuid from "@/validators/is-valid-uuid";
import { getSchemaVaultsMailingListId } from '@/env/get-mailing-list-id';
export { getSchemaVaultsMailingListId } from '@/env/get-mailing-list-id';

export interface ISendEmailToMailingListOpts extends Omit<
  ISendEmailOpts,
  "body"
> {
  body: Omit<SendEmailRequestBody, "to" | "cc" | "bcc">;
  mailingListId?: string;
}

export async function sendEmailToMailingList(
  opts: ISendEmailToMailingListOpts,
): Promise<void> {
  let to: string;
  if (typeof opts.mailingListId === "string") {
    to = opts.mailingListId;
  } else {
    to = getSchemaVaultsMailingListId();
  }
  if (!isValidUuid(to)) {
    throw new TypeError(
      "Failed to parse 'to' field as a mailing list ID (UUID)!",
    );
  }

  return await sendEmail({
    ...opts,
    body: {
      ...opts.body,
      to,
    },
  });
}

export default sendEmailToMailingList;
