import { z } from "zod";
import { emailTemplateIdSchema } from "@/validators/email-template-id-schema";
import { transportIdSchema } from "@/validators/transport-id-schema";
import { emailAttachmentsSchema } from "@/validators/email-attachment-schema";

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

// C0 controls except HTAB, plus DEL: a line break in a header value can
// start a new header (e.g. `Bcc:`).
function hasHeaderUnsafeCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

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
      subject: z
        .string()
        .nonempty()
        .refine((subject) => !hasHeaderUnsafeCharacters(subject), {
          message: "Subject must not contain line breaks or control characters!",
        }),
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
      /**
       * Which transport configured on the mail-server should deliver this
       *  email? Only meaningful when the target `@schemavaults/mail-server`
       *  instance has more than one transport configured; when omitted, the
       *  mail-server picks its own default transport.
       */
      transport: transportIdSchema.optional(),
      /**
       * Files to attach to the email. Each attachment carries its bytes as a
       *  base64 string (request bodies are JSON); see `createEmailAttachment`
       *  for encoding binary or plain-text content. Between 1 and
       *  `MAX_ATTACHMENTS_PER_EMAIL` files, totalling at most
       *  `MAX_TOTAL_ATTACHMENT_BYTES` once decoded. Omit when there are none.
       */
      attachments: emailAttachmentsSchema.optional(),
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

export type { EmailAttachment } from "@/validators/email-attachment-schema";

export default createSendEmailRequestBodySchema;
