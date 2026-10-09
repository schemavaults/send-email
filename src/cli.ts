#!/usr/bin/env node
// cli.ts

import { readFileSync } from "node:fs";
import { Command, Option } from "commander";
import sendEmail from "./send-email";
import sendEmailToMailingList from "./send-email-to-mailing-list";
import listEmailTemplates from "./list-email-templates";
import createEmailAttachmentFromFile from "./create-email-attachment-from-file";
import type {
  EmailAttachment,
  SendEmailRequestBody,
} from "./send-email-request-body-schema";

interface GlobalOpts {
  apiKey?: string;
  dryRun?: boolean;
  transport?: string;
}

interface MessageOpts {
  templateId?: string;
  templateProps?: string;
  text?: string;
  html?: string;
  textFile?: string;
  htmlFile?: string;
  attach?: string[];
}

interface SendOpts extends MessageOpts {
  to?: string[];
  from?: string;
  subject?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  bodyFile?: string;
}

interface MailingListOpts extends MessageOpts {
  from?: string;
  subject?: string;
  replyTo?: string;
  bodyFile?: string;
  mailingListId?: string;
}

interface ListTemplatesOpts {
  format: "json" | "table";
}

function readTextFile(path: string): string {
  return readFileSync(path, "utf8");
}

function parseTemplateProps(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse --template-props as JSON: ${msg}`);
  }
}

function buildMessage(opts: MessageOpts): SendEmailRequestBody["message"] {
  if (opts.templateId) {
    const props = parseTemplateProps(opts.templateProps);
    return props === undefined
      ? { template_id: opts.templateId, template_props: undefined }
      : { template_id: opts.templateId, template_props: props };
  }
  const text =
    opts.text ?? (opts.textFile ? readTextFile(opts.textFile) : undefined);
  const html =
    opts.html ?? (opts.htmlFile ? readTextFile(opts.htmlFile) : undefined);
  if (!text || !html) {
    throw new Error(
      "Provide either --template-id, or both of --text/--html (or --text-file/--html-file).",
    );
  }
  return { text, html };
}

function loadBodyFile(path: string): SendEmailRequestBody {
  const raw = readTextFile(path);
  try {
    return JSON.parse(raw) as SendEmailRequestBody;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${path} as JSON: ${msg}`);
  }
}

async function loadAttachments(
  paths: string[] | undefined,
): Promise<EmailAttachment[]> {
  if (!paths || paths.length === 0) return [];
  return await Promise.all(
    paths.map((path) => createEmailAttachmentFromFile(path)),
  );
}

async function withErrorHandling(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function attachBodyOptions(cmd: Command): Command {
  return cmd
    .option("--from <email>", "Sender email address")
    .option("--subject <subject>", "Email subject")
    .option("--reply-to <email>", "Reply-To email address")
    .option(
      "--template-id <id>",
      "Email template ID (mutually exclusive with --text/--html)",
    )
    .option(
      "--template-props <json>",
      "JSON string of props to render the template with",
    )
    .option("--text <text>", "Plain-text body (requires --html)")
    .option("--html <html>", "HTML body (requires --text)")
    .option(
      "--text-file <path>",
      "Path to a file containing the plain-text body",
    )
    .option("--html-file <path>", "Path to a file containing the HTML body")
    .option(
      "--attach <path...>",
      "Path to a file to attach (repeatable); its basename becomes the attachment filename",
    )
    .option(
      "--body-file <path>",
      "Path to a JSON file containing the full request body (overrides other body flags, except --attach which is appended)",
    );
}

const program = new Command();

program
  .name("schemavaults-send-email")
  .description("CLI for sending emails via the SchemaVaults mail-server")
  .option(
    "--api-key <key>",
    "Bearer token (defaults to SCHEMAVAULTS_MAIL_API_KEY env var)",
  )
  .addOption(
    new Option(
      "--environment <env>",
      "Target SchemaVaults environment",
    ).choices(["production", "development", "staging"]),
  )
  .option(
    "--dry-run",
    "Validate the request server-side without dispatching the email",
  )
  .option(
    "--transport <name>",
    "Which mail-server transport should deliver the email (defaults to the mail-server's default transport)",
  );

attachBodyOptions(
  program
    .command("send")
    .description("Send an email to one or more recipients")
    .option("--to <email...>", "Recipient email address (repeatable)")
    .option("--cc <email...>", "CC recipient (repeatable)")
    .option("--bcc <email...>", "BCC recipient (repeatable)"),
).action(async (opts: SendOpts, cmd: Command) => {
  await withErrorHandling(async () => {
    const global = cmd.optsWithGlobals<GlobalOpts>();

    let body: SendEmailRequestBody;
    if (opts.bodyFile) {
      body = loadBodyFile(opts.bodyFile);
    } else {
      if (!opts.to || opts.to.length === 0) {
        throw new Error("Missing required option: --to");
      }
      if (!opts.subject) {
        throw new Error("Missing required option: --subject");
      }
      body = {
        to: opts.to.length === 1 ? opts.to[0] : opts.to,
        subject: opts.subject,
        message: buildMessage(opts),
        ...(opts.from ? { from: opts.from } : {}),
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.cc && opts.cc.length > 0
          ? { cc: opts.cc.length === 1 ? opts.cc[0] : opts.cc }
          : {}),
        ...(opts.bcc && opts.bcc.length > 0
          ? { bcc: opts.bcc.length === 1 ? opts.bcc[0] : opts.bcc }
          : {}),
      };
    }

    const attachments = await loadAttachments(opts.attach);

    await sendEmail({
      body,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(global.apiKey ? { bearerToken: global.apiKey } : {}),
      ...(global.dryRun ? { dryRun: true } : {}),
      ...(global.transport ? { transport: global.transport } : {}),
    });
    console.log(
      global.dryRun
        ? "[dry-run] request validated; no email sent."
        : "Email sent.",
    );
  });
});

attachBodyOptions(
  program
    .command("send-to-mailing-list")
    .description("Send an email to a SchemaVaults mailing list")
    .option(
      "--mailing-list-id <uuid>",
      "Mailing list UUID (defaults to SCHEMAVAULTS_MAILING_LIST_ID env var)",
    ),
).action(async (opts: MailingListOpts, cmd: Command) => {
  await withErrorHandling(async () => {
    const global = cmd.optsWithGlobals<GlobalOpts>();

    let body: Omit<SendEmailRequestBody, "to" | "cc" | "bcc">;
    if (opts.bodyFile) {
      const fullBody = loadBodyFile(opts.bodyFile);
      body = {
        subject: fullBody.subject,
        message: fullBody.message,
        ...(fullBody.from ? { from: fullBody.from } : {}),
        ...(fullBody.replyTo ? { replyTo: fullBody.replyTo } : {}),
        ...(fullBody.transport ? { transport: fullBody.transport } : {}),
        ...(fullBody.attachments
          ? { attachments: fullBody.attachments }
          : {}),
      };
    } else {
      if (!opts.subject) {
        throw new Error("Missing required option: --subject");
      }
      body = {
        subject: opts.subject,
        message: buildMessage(opts),
        ...(opts.from ? { from: opts.from } : {}),
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      };
    }

    const attachments = await loadAttachments(opts.attach);

    await sendEmailToMailingList({
      body,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(opts.mailingListId ? { mailingListId: opts.mailingListId } : {}),
      ...(global.apiKey ? { bearerToken: global.apiKey } : {}),
      ...(global.dryRun ? { dryRun: true } : {}),
      ...(global.transport ? { transport: global.transport } : {}),
    });
    console.log(
      global.dryRun
        ? "[dry-run] mailing-list request validated; no email sent."
        : "Email sent to mailing list.",
    );
  });
});

program
  .command("list-templates")
  .description("List available email templates")
  .addOption(
    new Option("--format <fmt>", "Output format")
      .choices(["json", "table"])
      .default("json"),
  )
  .action(async (opts: ListTemplatesOpts, cmd: Command) => {
    await withErrorHandling(async () => {
      const global = cmd.optsWithGlobals<GlobalOpts>();
      const templates = await listEmailTemplates({
        ...(global.apiKey ? { bearerToken: global.apiKey } : {}),
      });

      if (opts.format === "table") {
        for (const t of templates) {
          console.log(`${t.id}\t${t.description}`);
        }
      } else {
        console.log(JSON.stringify(templates, null, 2));
      }
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
