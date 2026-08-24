import { z } from "zod";

/**
 * Identifier of a transport configured on the target `@schemavaults/mail-server`
 *  instance (e.g. "resend", "smtp-primary", "ses_us_east_1").
 *
 * Transport names are chosen by whoever configures the mail-server, so this
 *  schema only enforces that the value looks like an identifier -- the
 *  mail-server is the authority on whether the named transport actually exists.
 */
export const transportIdSchema = z
  .string()
  .min(1, "Transport ID must be non-empty!")
  .max(64)
  .regex(
    /^[a-z]([a-z0-9_-]*[a-z0-9])?$/,
    "Transport ID must start with a lowercase letter and end with a lowercase alphanumeric character, and may only contain lowercase alphanumeric characters, hyphens and underscores.",
  );

export default transportIdSchema;
