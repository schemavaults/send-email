# @schemavaults/send-email

TypeScript client for sending emails via the `@schemavaults/mail-server` API. Provides request body validation (via Zod), environment-aware server URL resolution, and helpers for sending to individual recipients, mailing lists, attaching files, and listing available email templates.

## Installation

```bash
bun add @schemavaults/send-email
# or
npm install @schemavaults/send-email
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SCHEMAVAULTS_MAIL_API_KEY` | Yes | Bearer token for the mail-server API. Starts with `svlts_mail_pk_`. |
| `SCHEMAVAULTS_MAILING_LIST_ID` | For mailing list sends | UUID of the target mailing list. |
| `SCHEMAVAULTS_APP_ENVIRONMENT` | No | `"production"` (default), `"development"`, or `"staging"`. Controls which mail-server instance is targeted. |
| `SCHEMAVAULTS_MAIL_SERVER_URL` | No | What is the URL of the [`@schemavaults/mail-server` instance](https://github.com/schemavaults/mail-server) to attempt sending mail through? You may also pass the `mailServerUrl` option instead of setting an environment variable. |

## Usage

### Send an email

```ts
import { sendEmail } from "@schemavaults/send-email";

// Using a registered template
await sendEmail({
  body: {
    to: "user@example.com",
    subject: "Welcome!",
    message: {
      template_id: "welcome-email",
      template_props: { name: "Alice" },
    },
  },
});

// Using raw text/html
await sendEmail({
  body: {
    to: "user@example.com",
    subject: "Hello",
    message: {
      text: "Hello from SchemaVaults.",
      html: "<p>Hello from SchemaVaults.</p>",
    },
  },
});
```

### Choose a transport

When the target `@schemavaults/mail-server` instance has more than one transport configured, the optional `transport` field selects which one delivers the email. Omit it to let the mail-server use its default transport.

```ts
await sendEmail({
  body: {
    to: "user@example.com",
    subject: "Hello",
    message: { text: "Hello.", html: "<p>Hello.</p>" },
    transport: "smtp-primary",
  },
});

// Equivalently, as a call-level override (sets `body.transport`):
await sendEmail({
  transport: "smtp-primary",
  body: { to: "user@example.com", subject: "Hello", message: { /* ... */ } },
});
```

The same applies to `sendEmailToMailingList()`, and to the CLI via the global `--transport <name>` flag:

```bash
bunx schemavaults-send-email --transport smtp-primary send \
  --to user@example.com --subject "Hello" --text "Hello." --html "<p>Hello.</p>"
```

Transport names are defined by whoever configures the mail-server; this package only validates that the value looks like an identifier. An unknown transport name is rejected by the mail-server, not by the client.

### Attach files

Request bodies are JSON, so each attachment's bytes travel as a base64 string under `body.attachments`. You rarely need to encode anything yourself: the `attachments` option on `sendEmail()` (and `sendEmailToMailingList()`) accepts raw bytes, plain text, or already-encoded attachments and base64-encodes them for you before appending them to `body.attachments`.

```ts
import { sendEmail } from "@schemavaults/send-email";
// Node/Bun only -- reads from disk, so it lives on its own subpath
import { createEmailAttachmentFromFile } from "@schemavaults/send-email/create-email-attachment-from-file";

await sendEmail({
  body: {
    to: "user@example.com",
    subject: "Your invoice",
    message: { text: "Invoice attached.", html: "<p>Invoice attached.</p>" },
  },
  attachments: [
    // Binary: any Uint8Array / Buffer / ArrayBuffer
    { filename: "invoice.pdf", content: pdfBytes, contentType: "application/pdf" },
    // Plain text: say so, otherwise a string is assumed to be base64 already
    { filename: "summary.txt", content: "Thanks for your order!", encoding: "utf8" },
    // A file on disk; the basename becomes the attachment filename
    await createEmailAttachmentFromFile("./reports/q3.csv"),
  ],
});
```

To build the wire shape yourself -- for example to validate it up front or to put it in `body.attachments` directly -- use `createEmailAttachment()`, which takes the same input and returns a validated `EmailAttachment`:

```ts
import { createEmailAttachment } from "@schemavaults/send-email";

const attachment = createEmailAttachment({
  filename: "logo.png",
  content: logoBytes,
  contentType: "image/png",
  contentId: "logo", // inline image: reference it as <img src="cid:logo"> in the HTML body
});
// => { filename: "logo.png", content: "iVBORw0KGgo...", contentType: "image/png", contentId: "logo" }
```

Setting `contentId` marks the attachment as inline so the HTML body can embed it via a `cid:` URL; pass the bare identifier without angle brackets. `contentType` is optional -- when omitted, the mail-server's transport derives it from the filename's extension.

Limits enforced client-side (and exported as `MAX_ATTACHMENTS_PER_EMAIL` / `MAX_TOTAL_ATTACHMENT_BYTES`): at most 20 attachments per email, totalling at most 25 MiB once decoded. Filenames may not contain path separators or control characters. The mail-server, its hosting platform, and the receiving mail systems may enforce lower limits of their own.

From the CLI, `--attach <path>` is repeatable on both `send` and `send-to-mailing-list`, and may be combined with `--body-file` (the files are appended to any `attachments` already in the JSON):

```bash
bunx schemavaults-send-email send \
  --to user@example.com --subject "Your invoice" \
  --text "Invoice attached." --html "<p>Invoice attached.</p>" \
  --attach ./invoice.pdf --attach ./reports/q3.csv
```

### Send to a mailing list

```ts
import { sendEmailToMailingList } from "@schemavaults/send-email";

await sendEmailToMailingList({
  body: {
    subject: "Weekly update",
    message: {
      text: "Here's what happened this week.",
      html: "<p>Here's what happened this week.</p>",
    },
  },
});
```

The mailing list UUID is read from `SCHEMAVAULTS_MAILING_LIST_ID` by default. You can override it per-call:

```ts
await sendEmailToMailingList({
  mailingListId: "00000000-0000-0000-0000-000000000000",
  body: { subject: "...", message: { text: "...", html: "..." } },
});
```

### List available email templates

```ts
import { listEmailTemplates } from "@schemavaults/send-email";

const templates = await listEmailTemplates();
// => [{ id: "welcome-email", description: "..." }, ...]
```

### Validate a request body

The package exports the Zod schema used by both this client and the mail-server to validate request bodies:

```ts
import { createSendEmailRequestBodySchema } from "@schemavaults/send-email";

// Pass `true` to allow mailing list UUIDs in the `to` field
const schema = createSendEmailRequestBodySchema(true);
const result = schema.safeParse(body);
```

## API

### `sendEmail(opts)`

Sends an email to one or more recipients.

```ts
interface ISendEmailOpts {
  body: SendEmailRequestBody;
  bearerToken?: string;       // overrides SCHEMAVAULTS_MAIL_API_KEY
  mailServerUrl?: string;     // overrides resolved server URL
  environment?: "production" | "development" | "staging";
  dryRun?: boolean;           // convenience; sets body.dryRun
  transport?: string;         // convenience; sets body.transport
  attachments?: EmailAttachmentInput[]; // convenience; encoded + appended to body.attachments
}
```

### `sendEmailToMailingList(opts)`

Sends an email to a mailing list audience. The `to`, `cc`, and `bcc` fields are not accepted -- the audience is the mailing list.

```ts
interface ISendEmailToMailingListOpts {
  body: Omit<SendEmailRequestBody, "to" | "cc" | "bcc">;
  mailingListId?: string;     // overrides SCHEMAVAULTS_MAILING_LIST_ID
  bearerToken?: string;
  mailServerUrl?: string;
  environment?: "production" | "development" | "staging";
  dryRun?: boolean;           // convenience; sets body.dryRun
  transport?: string;         // convenience; sets body.transport
  attachments?: EmailAttachmentInput[]; // convenience; encoded + appended to body.attachments
}
```

### `createEmailAttachment(input)`

Builds a validated `EmailAttachment` (the wire shape used in `body.attachments`), base64-encoding the content for you. Throws a `TypeError` describing the problem when the result is invalid.

```ts
interface EmailAttachmentInput {
  filename: string;                             // shown to the recipient; no path separators
  content: string | Uint8Array | ArrayBuffer;   // bytes, or a string (see `encoding`)
  encoding?: "base64" | "utf8";                 // how to read a string `content`; default "base64"
  contentType?: string;                         // MIME type; derived from the filename when omitted
  contentId?: string;                           // set to embed inline via cid: in the HTML body
}
```

An `EmailAttachment` is itself valid `EmailAttachmentInput` (its `content` is base64), so pre-built attachments and raw inputs can be mixed freely.

### `createEmailAttachmentFromFile(path, opts?)`

Node/Bun only. Reads a file from disk and returns a validated `EmailAttachment`; the file's basename is the attachment filename unless `opts.filename` overrides it. `opts` may also set `contentType` and `contentId`. Imported from the `@schemavaults/send-email/create-email-attachment-from-file` subpath so the package's main entry stays free of filesystem imports.

### `listEmailTemplates(opts?)`

Returns the list of registered email templates from the mail-server catalog.

```ts
interface IListEmailTemplatesOpts {
  bearerToken?: string;
  mailServerUrl?: string;
  environment?: "production" | "development" | "staging";
}

interface EmailTemplate {
  id: string;
  description: string;
}
```

### `getMailServerUrl()`

Reads and returns `SCHEMAVAULTS_MAIL_SERVER_URL` from the environment. Throws if not set.

### `getSchemaVaultsMailApiKey()`

Reads and returns `SCHEMAVAULTS_MAIL_API_KEY` from the environment. Throws if not set.

### `createSendEmailRequestBodySchema(allowMailingListIds?)`

Returns a Zod schema for validating send-email request bodies. Pass `true` to allow UUIDs (mailing list IDs) in the `to` field.

### `emailTemplateIdSchema`

Zod schema for validating template IDs: lowercase alphanumeric with hyphens/underscores, 1-64 characters, must start with a letter.

### `transportIdSchema`

Zod schema for validating transport names: lowercase alphanumeric with hyphens/underscores, 1-64 characters, must start with a lowercase letter and end with a lowercase alphanumeric character. Whether a well-formed name corresponds to a transport the mail-server actually has configured is decided server-side.

### `emailAttachmentSchema` / `emailAttachmentsSchema`

Zod schemas for a single attachment and for the `attachments` array respectively. The array schema enforces the count (`MAX_ATTACHMENTS_PER_EMAIL`, 20) and total decoded size (`MAX_TOTAL_ATTACHMENT_BYTES`, 25 MiB) limits; both constants are exported.

## Request body shape

The `message` field accepts either a template reference or raw content:

```ts
type Message =
  | { template_id: string; template_props?: unknown }
  | { text: string; html: string }; // both required

type EmailAttachment = {
  filename: string;            // 1-255 chars; no path separators or control characters
  content: string;             // base64-encoded bytes (standard alphabet, padded)
  contentType?: string;        // MIME type; derived from the filename when omitted
  contentId?: string;          // marks the attachment inline; reference as cid:<contentId>
};

type SendEmailRequestBody = {
  to: string | string[];       // email address(es) or mailing list UUID
  subject: string;
  message: Message;
  from?: string;               // defaults to mail-server's configured sender
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  dryRun?: boolean;            // server validates without dispatching
  transport?: string;          // which mail-server transport delivers this email
  attachments?: EmailAttachment[]; // 1-20 files, at most 25 MiB in total once decoded
};
```

## Development

```bash
bun install
bun run build
bun test
bun run typecheck
bun run lint
```
