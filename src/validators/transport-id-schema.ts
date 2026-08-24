import { z } from "zod";

/**
 * Identifier of a transport configured on the target `@schemavaults/mail-server`
 *  instance (e.g. "resend", "smtp-primary", "ses-us-east-1").
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
    /^[a-zA-Z][a-zA-Z0-9_.-]*$/,
    "Transport ID must start with a letter, and may only contain alphanumeric characters, hyphens, underscores and periods.",
  );

export default transportIdSchema;
