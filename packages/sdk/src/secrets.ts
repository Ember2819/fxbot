import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import postgres from "postgres";
import type { Sql } from "./store.ts";

// AES-256-GCM with a fresh 12-byte nonce on every write, and the provider id bound in as AAD, so a sealed value
// copied onto another provider's row fails to open. Postgres stores only nonce ‖ tag ‖ ciphertext and never sees
// the key: no pgcrypto, whose key would travel inside SQL and could reach Postgres's logs.
export function seal(key: Buffer, id: string, value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(id));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

export function unseal(key: Buffer, id: string, sealed: Buffer): unknown {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12)).setAAD(Buffer.from(id));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8"));
}

// The key file's contents: 32 random bytes in base64.
export function readKey(text: string) {
  const key = Buffer.from(text.trim(), "base64");
  if (key.length !== 32) throw new Error("The secret key must be 32 random bytes in base64, such as `openssl rand -base64 32`.");
  return key;
}

// A failed response with `secrets` masked, for requests whose credentials fxbot adds itself. Some servers quote a bad
// key back in their error, and libfx shows and saves error details, but masks only the credentials it adds.
export async function withoutSecrets(response: Response, secrets: (string | undefined)[]) {
  if (response.ok) return response;
  let body = await response.text();
  for (const secret of secrets) if (secret) body = body.split(secret).join("*".repeat(8));
  return new Response(body, { status: response.status, statusText: response.statusText, headers: { "content-type": response.headers.get("content-type") ?? "text/plain" } });
}

// Each sealed table and the column its rows are keyed by: a provider's keys and tokens, and a plugin's.
const tables = { secrets: "provider_id", plugin_secrets: "plugin_id" } as const;

// Opened secrets stay in memory, so libfx's credentials() calls cost no query. Every write goes through here.
export function createSecrets(sql: Sql, key: Buffer, table: keyof typeof tables = "secrets") {
  const column = tables[table];
  const unopenable = `Cannot open this ${table === "secrets" ? "provider" : "plugin"}'s secret. Sign in again, or check FXBOT_SECRET_KEY_FILE.`;
  const cache = new Map<string, unknown>();
  return {
    async get<T>(id: string): Promise<T | undefined> {
      if (cache.has(id)) return cache.get(id) as T;
      const row = (await sql<{ sealed: Buffer }[]>`select sealed from ${sql(table)} where ${sql(column)} = ${id}`)[0];
      if (!row) return undefined;
      let value: unknown;
      try {
        value = unseal(key, id, row.sealed);
      } catch {
        throw new Error(unopenable);
      }
      cache.set(id, value);
      return value as T;
    },
    async put(id: string, value: unknown, tx: Sql = sql) {
      await tx`insert into ${sql(table)} (${sql(column)}, sealed) values (${id}, ${seal(key, id, value)})
        on conflict (${sql(column)}) do update set sealed = excluded.sealed, updated_at = now()`;
      cache.set(id, value);
    },
    // Rows go with their provider or plugin, by cascade.
    forget: (id: string) => cache.delete(id),
    has: async () => new Set((await sql<{ id: string }[]>`select ${sql(column)} as id from ${sql(table)}`).map((row) => row.id)),
  };
}

// Seals every secret again under a new key, in one transaction. Run it with the server stopped.
export async function rotateSecrets({ databaseUrl, from, to }: { databaseUrl: string; from: Buffer; to: Buffer }) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    return await sql.begin(async (tx) => {
      let count = 0;
      // A database from before 0.4.0 names the plugins' table addon_secrets, and one from before plugins has neither.
      for (const [table, column] of [...Object.entries(tables), ["addon_secrets", "addon_id"]]) {
        if (!(await tx`select to_regclass(${table}) as found`)[0].found) continue;
        const rows = await tx<{ id: string; sealed: Buffer }[]>`select ${tx(column)} as id, sealed from ${tx(table)} for update`;
        for (const { id, sealed } of rows)
          await tx`update ${tx(table)} set sealed = ${seal(to, id, unseal(from, id, sealed))}, updated_at = now() where ${tx(column)} = ${id}`;
        count += rows.length;
      }
      return count;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
