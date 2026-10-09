---
name: send-one-off-email
description: Send a one-off email to one or more individual recipients via the SchemaVaults mail-server `/api/send` route, using either the `sendEmail()` helper or — for ad-hoc shell invocations — the `schemavaults-send-email send` CLI from `@schemavaults/send-email`. Use when you need to fire off a single notification to specific email addresses (not a mailing list), e.g. a manual heads-up to a colleague, an end-of-task email to the user, a quick smoke test of an API key, or a `bash`/cron one-liner. For mailing-list audiences, use the `send-email-to-mailing-list` skill instead.
---

# Send a One-Off Email

This skill teaches Claude how to send a single email to one or more individual recipients. The fastest path is the `schemavaults-send-email send` CLI (one shell command, no script file). For sends embedded inside application code, use the `sendEmail()` helper directly.

## When to use this skill

- A manual notification to specific email addresses (e.g. "let me email so-and-so the result").
- An ad-hoc smoke test of `SCHEMAVAULTS_MAIL_API_KEY` or a template's `template_props` shape.
- A `bash`, `cron`, or CI step that needs to fire a single email.
- Application code that sends transactional email to one or more recipients.

Do **not** use this skill for:

- Sending to a mailing list audience -- use the `send-email-to-mailing-list` skill (it forbids `to`/`cc`/`bcc` and resolves the audience from a mailing list UUID).
- Discovering which templates exist -- use the `list-email-templates` skill first.
- Client-side / browser code -- the API key is a secret.
- Sends to more than 50 recipients in a single call (the mail-server caps each send at 50; for larger audiences use a mailing list).

## Prerequisites

1. **Install the package** (provides both the helper and the CLI):
   ```bash
   bun add @schemavaults/send-email
   # or: npm install @schemavaults/send-email
   ```

2. **Set the API key** in the environment:
   - `SCHEMAVAULTS_MAIL_API_KEY` -- bearer token starting with `svlts_mail_pk_`.

3. **Optional:** `SCHEMAVAULTS_APP_ENVIRONMENT` = `"production"` (default) | `"development"` | `"staging"`. Only set when explicitly targeting a non-prod mail-server.

## Usage -- CLI (preferred for one-off sends)

The package ships a `schemavaults-send-email` binary. Invoke the `send` subcommand for individual recipients:

```bash
# Single recipient, raw text/html (both required)
bunx schemavaults-send-email send \
  --to alice@example.com \
  --subject "Heads up: deploy at 3pm" \
  --text  "Deploy window starts at 15:00 UTC." \
  --html  "<p>Deploy window starts at <strong>15:00 UTC</strong>.</p>"

# Multiple recipients (--to is repeatable / variadic)
bunx schemavaults-send-email send \
  --to alice@example.com --to bob@example.com \
  --cc carol@example.com \
  --subject "..." --text "..." --html "..."

# Template-based
bunx schemavaults-send-email send \
  --to alice@example.com \
  --subject "Welcome aboard" \
  --template-id welcome-email \
  --template-props '{"name":"Alice"}'

# Long bodies: read from files
bunx schemavaults-send-email send \
  --to alice@example.com \
  --subject "weekly digest" \
  --text-file /tmp/digest.txt \
  --html-file /tmp/digest.html

# Attach files (--attach is repeatable; the basename becomes the attachment filename)
bunx schemavaults-send-email send \
  --to alice@example.com \
  --subject "Q3 report" \
  --text "Report attached." --html "<p>Report attached.</p>" \
  --attach /tmp/q3-report.pdf --attach /tmp/q3-figures.csv

# Or supply the full request body as JSON (--attach may be combined with it)
bunx schemavaults-send-email send --body-file /tmp/payload.json
```

(Use `npx` instead of `bunx` if `bun` is unavailable.) The CLI exits `0` on a successful 200 response and non-zero with a one-line error otherwise. Run `bunx schemavaults-send-email send --help` for the full flag reference.

### Validating without sending (`--dry-run`)

Use `--dry-run` to validate a request end-to-end -- Zod body shape, `template_props` shape, API-key scoping -- without actually delivering an email. This is the right way to smoke-test a new send. **Never send a blank or placeholder "test" email for this purpose.**

```bash
bunx schemavaults-send-email send --dry-run \
  --to alice@example.com \
  --subject "Welcome aboard" \
  --template-id welcome-email \
  --template-props '{"name":"Alice"}'
```

A successful dry-run prints `[dry-run] request validated; no email sent.` and exits `0`. A malformed request (e.g. wrong `template_props` shape) exits non-zero with the server's validation error.

### Globally-applicable flags

These work on every subcommand, before the subcommand name:

- `--api-key <key>` -- override `SCHEMAVAULTS_MAIL_API_KEY`.
- `--environment <env>` -- override `SCHEMAVAULTS_APP_ENVIRONMENT` (`production` | `development` | `staging`).
- `--transport <name>` -- pick which of the mail-server's configured transports delivers the email. Only relevant when the target mail-server has more than one transport; omit it to use the server's default.

Example:

```bash
bunx schemavaults-send-email --environment development send \
  --to me@example.com --subject "dev smoke" \
  --template-id welcome-email --template-props '{"name":"me"}'

# Route through a specific transport
bunx schemavaults-send-email --transport smtp-primary send \
  --to alice@example.com --subject "..." --text "..." --html "..."
```

## Usage -- `sendEmail()` helper (for application code)

When the send is embedded in a TypeScript/JavaScript codepath, import the helper. Same auth conventions, same body schema:

```ts
import { sendEmail } from "@schemavaults/send-email";

// Template-based
await sendEmail({
  body: {
    to: "alice@example.com",
    subject: "Welcome aboard",
    message: {
      template_id: "welcome-email",
      template_props: { name: "Alice" },
    },
  },
});

// Raw text/html (both required)
await sendEmail({
  body: {
    to: ["alice@example.com", "bob@example.com"],
    cc: "carol@example.com",
    subject: "Heads up: deploy at 3pm",
    message: {
      text: "Deploy window starts at 15:00 UTC.",
      html: "<p>Deploy window starts at <strong>15:00 UTC</strong>.</p>",
    },
  },
});
```

Escape user-supplied values before embedding them in `html` if they can contain `<` / `>` / `&` -- the mail-server does not sanitize this for you.

### Attachments

Pass `attachments` next to `body`. Binary content (`Uint8Array` / `Buffer` / `ArrayBuffer`) and plain text (`encoding: "utf8"`) are base64-encoded for you; a bare string is assumed to be base64 already. On Node/Bun, `createEmailAttachmentFromFile()` (own subpath, since it reads from disk) turns a file path into an attachment:

```ts
import { sendEmail } from "@schemavaults/send-email";
import { createEmailAttachmentFromFile } from "@schemavaults/send-email/create-email-attachment-from-file";

await sendEmail({
  body: {
    to: "alice@example.com",
    subject: "Q3 report",
    message: { text: "Report attached.", html: "<p>Report attached.</p>" },
  },
  attachments: [
    await createEmailAttachmentFromFile("/tmp/q3-report.pdf"),
    { filename: "figures.csv", content: csvString, encoding: "utf8", contentType: "text/csv" },
    { filename: "chart.png", content: pngBytes, contentId: "chart" }, // inline: <img src="cid:chart">
  ],
});
```

Limits: at most 20 attachments per email, totalling at most 25 MiB once decoded (the mail-server or its host may allow less). Filenames may not contain path separators.

## Request body shape

```ts
type OneOffEmailBody = {
  to: string | string[];           // 1-50 recipient email(s)
  subject: string;
  message:
    | { template_id: string; template_props?: unknown }
    | { text: string; html: string };
  from?: string;                   // defaults to the mail-server's configured sender
  replyTo?: string;
  cc?: string | string[];          // 1-50
  bcc?: string | string[];         // 1-50
  dryRun?: boolean;                // server validates without dispatching
  transport?: string;              // which mail-server transport to deliver with
  attachments?: EmailAttachment[]; // 1-20 files, <= 25 MiB total once decoded
};

type EmailAttachment = {
  filename: string;                // shown to the recipient; no path separators
  content: string;                 // base64-encoded bytes
  contentType?: string;            // MIME type; derived from the filename when omitted
  contentId?: string;              // marks the file inline; reference as cid:<contentId>
};

// Helper call signature:
type ISendEmailOpts = {
  body: OneOffEmailBody;
  bearerToken?: string;            // override SCHEMAVAULTS_MAIL_API_KEY
  environment?: "production" | "development" | "staging";
  dryRun?: boolean;                // convenience; sets body.dryRun
  transport?: string;              // convenience; sets body.transport
  attachments?: EmailAttachmentInput[]; // convenience; bytes/text encoded + appended to body.attachments
};
```

## Error handling

The CLI prints the error message and exits non-zero. The helper throws on any non-200 response -- wrap in `try/catch` whenever a failed send must not break the caller's flow. Common failure modes:

| Error | Cause |
| --- | --- |
| `Failed to load API key from environment variable 'SCHEMAVAULTS_MAIL_API_KEY'` | Env var not set (or empty string). |
| `Bad request body to send email with!` | Body fails Zod validation -- typically a missing `subject`, missing `text`/`html` pair, an invalid email in `to`/`cc`/`bcc`, or unknown fields. |
| `Invalid or revoked API key.` (HTTP 401) | API key is wrong, expired, or revoked. |
| `Failed to parse request body!` (HTTP 400) | Server-side Zod parsing failed; usually a template `template_props` shape mismatch. |
| `Provide either --template-id, or both of --text/--html …` (CLI only) | Neither a template ID nor a complete raw body was supplied. |
| `Invalid email attachment '<filename>': …` | An `attachments` entry failed validation -- bad filename (path separators, control characters), content that is not valid base64 (did you mean `encoding: "utf8"`?), empty content, or a malformed `contentType` / `contentId`. |
| `ENOENT: no such file or directory …` (CLI only) | A `--attach` path does not exist. Nothing is sent. |
| Unknown-transport error (HTTP 400) | `transport` named a transport the mail-server does not have configured. The client only checks that the name is well-formed; the server decides whether it exists. |

## Cautions

- **Treat recipient lists as PII.** Don't paste them into chat logs or commit them to source.
- **Ask before sending** if the user hasn't explicitly opted in. Email is a side effect visible to other humans.
- **Never send a blank or "test" email to validate a request.** Use `--dry-run` (CLI) or `dryRun: true` (helper body). The mail-server validates the full request -- including `template_props` shape -- without dispatching. Real test emails create inbox noise, can leak staging addresses, and annoy recipients.
- **Prefer mailing lists** for any audience that grows or churns -- managing a recipient list inline doesn't scale.
- **Don't loop the CLI/helper to fan out** beyond 50 recipients per send -- create a mailing list instead and use the `send-email-to-mailing-list` skill.
- **Keep attachments small.** Attachments ride inside the JSON body as base64 (+33% size). The client caps a send at 20 files / 25 MiB decoded, but the mail-server's host may reject far smaller bodies -- prefer linking to large files instead of attaching them.

## Reference

- CLI source: `node_modules/@schemavaults/send-email/dist/cli.js` (bundled, runs under Node).
- Helper source: `node_modules/@schemavaults/send-email/dist/send-email.{d.ts,js}`.
- Body schema: `node_modules/@schemavaults/send-email/dist/send-email-request-body-schema.{d.ts,js}` (the same `createSendEmailRequestBodySchema` Zod schema used by both client and mail-server).
- Attachments: `node_modules/@schemavaults/send-email/dist/create-email-attachment.{d.ts,js}` (`createEmailAttachment()`), `dist/create-email-attachment-from-file.{d.ts,js}` (Node/Bun file helper), `dist/validators/email-attachment-schema.{d.ts,js}` (schema + limits).

## Adding this skill to another project

1. Copy this file into the target project's `.claude/skills/` folder.
2. Install the package: `bun add @schemavaults/send-email`.
3. Set `SCHEMAVAULTS_MAIL_API_KEY` in the project's secret store (`.env.local` for local dev; hosting provider's secret store for prod).
4. Commit the skill file. The next Claude Code session in that repo will discover it automatically.
