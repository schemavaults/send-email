export {
  sendEmailRequestBodySchema,
  createSendEmailRequestBodySchema,
} from "./send-email-request-body-schema";
export type { SendEmailRequestBody } from "./send-email-request-body-schema";

export { emailTemplateIdSchema } from "@/validators/email-template-id-schema";

export { transportIdSchema } from "@/validators/transport-id-schema";

export {
  sendEmail,
  sendEmail as default,
} from "./send-email";
export type {
  ISendEmailOpts
} from './send-email';

export {
  getSchemaVaultsMailApiKey,
} from "@/env/get-api-key";

export {
  getSchemaVaultsMailingListId,
} from "@/env/get-mailing-list-id";

export {
  getMailServerUrl
} from "@/env/get-mail-server-url"

export {
  sendEmailToMailingList,
} from "./send-email-to-mailing-list";
export type { ISendEmailToMailingListOpts } from "./send-email-to-mailing-list";

export { listEmailTemplates } from "./list-email-templates";
export type {
  EmailTemplate,
  IListEmailTemplatesOpts,
} from "./list-email-templates";
