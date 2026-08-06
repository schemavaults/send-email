import { z } from "zod";

export const emailTemplateIdSchema = z
  .string()
  .min(1, "Email template ID must be non-empty!")
  .max(64)
  .regex(
    /^[a-z][a-z0-9_-]+$/,
    "Template ID must start with a letter, and may only contain lowercase alphanumeric characters, hyphens and underscores.",
  );
