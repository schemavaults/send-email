// browser-compatibility.test.ts
//
// The package root (src/index.ts) is bundled for the browser by consumers --
// the mail-server's admin UI imports `sendEmail` from a client component --
// so nothing reachable from it may require a Node/Bun runtime. Modules that
// do (filesystem access, `process`, ...) live on their own package subpaths.
//
// Two layers of checks:
//  1. Static: bundle the root with esbuild for `platform: "browser"`. Any
//     `node:*` import (or bare built-in like "fs") fails to resolve, and the
//     metafile shows exactly which source files the root pulls in.
//  2. Runtime: evaluate that bundle inside a `node:vm` context that has only
//     browser-style globals (no `process`, `Buffer`, `require`), then exercise
//     the public API from inside it.

import { beforeAll, describe, expect, test } from "bun:test";
import { builtinModules } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import * as esbuild from "esbuild";

const REPO_ROOT = join(import.meta.dir, "..");
const ROOT_ENTRY = "src/index.ts";
const GLOBAL_NAME = "SendEmailSdk";

/**
 * Modules that need a Node/Bun runtime. They are published on their own
 *  subpaths and must never be reachable from the package root. Add any new
 *  Node-only module here: the tests below prove the root does not import it
 *  AND that it genuinely is not browser-safe (so the check means something).
 */
const NODE_ONLY_MODULES: readonly string[] = [
  "src/create-email-attachment-from-file.ts",
  "src/cli.ts",
];

const NODE_BUILTINS: ReadonlySet<string> = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);

interface BrowserBundle {
  errors: esbuild.Message[];
  warnings: esbuild.Message[];
  metafile: esbuild.Metafile | undefined;
  code: string | undefined;
}

function isBuildFailure(err: unknown): err is esbuild.BuildFailure {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown }).errors)
  );
}

async function bundleForBrowser(entry: string): Promise<BrowserBundle> {
  try {
    const result = await esbuild.build({
      absWorkingDir: REPO_ROOT,
      entryPoints: [entry],
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: GLOBAL_NAME,
      target: "es2022",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    return {
      errors: result.errors,
      warnings: result.warnings,
      metafile: result.metafile,
      code: result.outputFiles[0]?.text,
    };
  } catch (err: unknown) {
    if (isBuildFailure(err)) {
      return {
        errors: err.errors,
        warnings: err.warnings,
        metafile: undefined,
        code: undefined,
      };
    }
    throw err;
  }
}

/** Evaluate `expression` inside the vm context and bring the result across the realm boundary as plain JSON. */
function evalJson<T>(ctx: vm.Context, expression: string): T {
  return JSON.parse(
    vm.runInContext(`JSON.stringify(${expression})`, ctx) as string,
  ) as T;
}

describe("Package root is browser-safe", () => {
  let root: BrowserBundle;

  beforeAll(async () => {
    root = await bundleForBrowser(ROOT_ENTRY);
  });

  test("bundles for the browser platform without errors", () => {
    expect(root.errors.map((e) => e.text)).toEqual([]);
    expect(root.code).toBeString();
    expect(root.metafile).toBeDefined();
  });

  test("imports no Node built-in modules anywhere in its import graph", () => {
    const offenders: string[] = [];
    for (const [file, input] of Object.entries(root.metafile!.inputs)) {
      for (const imp of input.imports) {
        if (imp.path.startsWith("node:") || NODE_BUILTINS.has(imp.path)) {
          offenders.push(`${file} -> ${imp.path}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("does not reach any Node-only module", () => {
    const inputs = Object.keys(root.metafile!.inputs);
    // Sanity: the metafile is really describing our source tree.
    expect(inputs).toContain(ROOT_ENTRY);
    expect(inputs).toContain("src/send-email.ts");
    for (const nodeOnlyModule of NODE_ONLY_MODULES) {
      expect(inputs).not.toContain(nodeOnlyModule);
    }
  });

  test.each([...NODE_ONLY_MODULES])(
    "negative control: %s is NOT browser-safe (so the checks above are meaningful)",
    async (entry: string) => {
      const bundle = await bundleForBrowser(entry);
      expect(bundle.errors.length).toBeGreaterThan(0);
      expect(
        bundle.errors.some((e) => /Could not resolve "node:/.test(e.text)),
      ).toBeTrue();
    },
  );

  describe("runs inside a context with no Node globals", () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    let ctx: vm.Context;

    beforeAll(() => {
      // Only what a browser would offer. Deliberately NO process / Buffer /
      // require / global.
      const sandbox = {
        console,
        TextEncoder,
        TextDecoder,
        btoa,
        atob,
        URL,
        Response,
        fetch: async (input: string | URL | Request, init?: RequestInit) => {
          requests.push({ url: String(input), init });
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      };
      ctx = vm.createContext(sandbox);
      // Module evaluation itself must not touch Node globals.
      vm.runInContext(root.code!, ctx);
    });

    test("the context really lacks Node globals", () => {
      expect(vm.runInContext("typeof process", ctx)).toBe("undefined");
      expect(vm.runInContext("typeof Buffer", ctx)).toBe("undefined");
      expect(vm.runInContext("typeof require", ctx)).toBe("undefined");
    });

    test("exposes the public API", () => {
      const keys = evalJson<string[]>(
        ctx,
        `Object.keys(${GLOBAL_NAME}).sort()`,
      );
      expect(keys).toEqual(
        expect.arrayContaining([
          "sendEmail",
          "sendEmailToMailingList",
          "listEmailTemplates",
          "createEmailAttachment",
          "createSendEmailRequestBodySchema",
          "sendEmailRequestBodySchema",
          "emailAttachmentSchema",
        ]),
      );
    });

    test("validates a request body", () => {
      const ok = evalJson<boolean>(
        ctx,
        `${GLOBAL_NAME}.sendEmailRequestBodySchema.safeParse({
          to: "a@example.com", subject: "s",
          message: { text: "t", html: "<p>t</p>" },
        }).success`,
      );
      expect(ok).toBeTrue();
    });

    test("createEmailAttachment() encodes text and bytes without Buffer", () => {
      const fromText = evalJson<{ filename: string; content: string }>(
        ctx,
        `${GLOBAL_NAME}.createEmailAttachment({
          filename: "hello.txt", content: "Hello World!", encoding: "utf8",
        })`,
      );
      expect(fromText).toEqual({
        filename: "hello.txt",
        content: "SGVsbG8gV29ybGQh",
      });

      const fromBytes = evalJson<{ filename: string; content: string }>(
        ctx,
        `${GLOBAL_NAME}.createEmailAttachment({
          filename: "hi.bin", content: new Uint8Array([72, 105]),
        })`,
      );
      expect(fromBytes).toEqual({ filename: "hi.bin", content: "SGk=" });
    });

    test("sendEmail() posts via fetch when given explicit credentials", async () => {
      requests.length = 0;
      await vm.runInContext(
        `${GLOBAL_NAME}.sendEmail({
          bearerToken: "svlts_mail_pk_test",
          mailServerUrl: "https://mail.example.test",
          body: {
            to: "a@example.com", subject: "s",
            message: { text: "t", html: "<p>t</p>" },
          },
          attachments: [
            { filename: "hello.txt", content: "Hello World!", encoding: "utf8" },
          ],
        })`,
        ctx,
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe("https://mail.example.test/api/send");
      const sent = JSON.parse(String(requests[0]!.init?.body)) as {
        attachments?: unknown;
      };
      expect(sent.attachments).toEqual([
        { filename: "hello.txt", content: "SGVsbG8gV29ybGQh" },
      ]);
    });
  });
});
