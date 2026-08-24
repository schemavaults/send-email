# @schemavaults/send-email

TypeScript client for sending emails via the `@schemavaults/mail-server` API. Provides request body validation (via Zod), environment-aware server URL resolution, and helpers for sending to individual recipients, mailing lists, and listing available email templates.

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
}
```

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

Zod schema for validating transport names: alphanumeric with hyphens/underscores/periods, 1-64 characters, must start with a letter. Whether a well-formed name corresponds to a transport the mail-server actually has configured is decided server-side.

## Request body shape

The `message` field accepts either a template reference or raw content:

```ts
type Message =
  | { template_id: string; template_props?: unknown }
  | { text: string; html: string }; // both required

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
