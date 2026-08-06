import { z } from "zod";
import { emailTemplateIdSchema } from "@/validators/email-template-id-schema";

const sendEmailTemplateOptions = z
  .object({
    template_id: emailTemplateIdSchema,
    template_props: z.unknown(),
  })
  .required({
    template_id: true,
  })
  .strict();

const sendRawEmailOptions = z
  .object({
    text: z.string().nonempty(),
    html: z.string().nonempty(),
  })
  .required({
    text: true,
    html: true,
  })
  .strict();

const MAX_RECIPIENTS: number = 50;

export function createRecipientSchema(
  allow_mailing_list_ids_as_recipients: boolean = false,
) {
  if (allow_mailing_list_ids_as_recipients) {
    return z.union([
      z.string().email(), // single recipient
      z.string().email().array().min(1).max(MAX_RECIPIENTS), // multi recipient
      z.string().uuid(), // mailing list id as recipient
    ]);
  } else {
    return z.union([
      z.string().email(), // single recipient
      z.string().email().array().min(1).max(MAX_RECIPIENTS), // multi recipient
    ]);
  }
}

/**
 *
 * @param allow_mailing_list_ids_as_recipients
 * @returns Schema for validating send-email request body
 */
export function createSendEmailRequestBodySchema(
  allow_mailing_list_ids_as_recipients: boolean = false,
) {
  return z
    .object({
      to: createRecipientSchema(allow_mailing_list_ids_as_recipients),
      from: z.string().email().optional(),
      subject: z.string().nonempty(),
      message: z.union([sendEmailTemplateOptions, sendRawEmailOptions]),
      replyTo: z.string().email().optional(),
      cc: z
        .union([
          z.string().email(),
          z.string().email().array().min(1).max(MAX_RECIPIENTS),
        ])
        .optional(),
      bcc: z
        .union([
          z.string().email(),
          z.string().email().array().min(1).max(MAX_RECIPIENTS),
        ])
        .optional(),
      dryRun: z.boolean().optional(),
    })
    .required({
      to: true,
      message: true,
      subject: true,
    })
    .strict();
}

/**
 * Default send email request body schema
 * @see createSendEmailRequestBodySchema
 *
 * This schema will not allow "to: <mailing_list_uuid>"-- use createSendEmailRequestBodySchema
 *  with allow_mailing_list_ids_as_recipients = true to accept UUIDs
 */
export const sendEmailRequestBodySchema = createSendEmailRequestBodySchema();

export type SendEmailRequestBody = z.infer<typeof sendEmailRequestBodySchema>;

export default createSendEmailRequestBodySchema;
