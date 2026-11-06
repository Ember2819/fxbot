import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { migrate, type MigrateOptions } from "./migrate.ts";
import { maxPinned, type Fields, type Profile, type Sent, type Settings } from "./types.ts";

export const isId = (id: string) => /^[0-9a-f]{12}$/.test(id);
export const newId = () => randomBytes(6).toString("hex");

export type Sql = postgres.Sql;
export type ProviderRecord = { id: string; kind: string; name: string; baseUrl: string | null; model: string; contextWindow: number | null; teamId: string | null };
export type PluginRecord<Config = unknown> = {
  id: string;
  kind: string;
  name: string;
  source: unknown;
  config: Config;
  approvedHash: string;
  enabled: boolean;
  bots: "all" | "each";
  allowed: string[] | null;
  status: string | null;
};
// A profile as stored. Whether its bot is busy is known only to the running process.
export type StoredProfile = Omit<Profile, "busy">;

// Every record fxbot owns, in tables its migrations make (migrate.ts). libfx's sessions are beside them (sessions.ts).
// Each change is one statement or one transaction, so concurrent requests cannot interleave a read-modify-write.
export async function createStore({ databaseUrl, dataDir, backupsDir }: MigrateOptions) {
  // Column names convert between snake_case and camelCase. Values do not, so stored JSON comes back as it went in.
  const sql = postgres(databaseUrl, { onnotice: () => {}, transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } } });
  const backedUp = await migrate(sql, { databaseUrl, dataDir, backupsDir }).catch(async (error) => {
    await sql.end();
    throw error;
  });
  const one = <T>(rows: readonly T[]) => rows[0] ?? null;
  const profile = (rows: readonly StoredProfile[]) => one(rows);
  const columns = sql`id, name, instructions, coalesce(provider, '') as provider, model, shape, color, session_id, handoff, preview, pinned_at is not null as pinned,
    exists (select 1 from settings where default_profile = profiles.id) as is_default`;

  return {
    sql,
    // Whether this start backed up before migrating.
    backedUp,
    profiles: {
      // Pinned bots first, in the order they were pinned, then the rest by name.
      list: async (): Promise<StoredProfile[]> => sql<StoredProfile[]>`select ${columns} from profiles order by pinned_at nulls last, lower(name), id`,
      get: async (id: string) => profile(await sql<StoredProfile[]>`select ${columns} from profiles where id = ${id}`),
      create: async (fields: Fields) =>
        profile(await sql<StoredProfile[]>`insert into profiles (id, name, instructions, provider, model, shape, color, pinned_at)
          values (${newId()}, ${fields.name}, ${fields.instructions}, ${fields.provider || null}, ${fields.model}, ${fields.shape}, ${fields.color},
            case when exists (select 1 from profiles) then null else now() end)
          returning ${columns}`)!,
      update: async (id: string, fields: Partial<Fields & { sessionId: string | null; handoff: string | null; preview: string }>) => {
        const values = { ...fields, ...(fields.provider === undefined ? {} : { provider: fields.provider || null }) };
        // A body with nothing fxbot reads changes nothing.
        if (!Object.keys(values).length) return profile(await sql<StoredProfile[]>`select ${columns} from profiles where id = ${id}`);
        return profile(await sql<StoredProfile[]>`update profiles set ${sql(values)} where id = ${id} returning ${columns}`);
      },
      // A concurrent first send keeps the id already saved.
      claimSession: async (id: string, sessionId: string) =>
        profile(await sql<StoredProfile[]>`update profiles set session_id = coalesce(session_id, ${sessionId}) where id = ${id} returning ${columns}`),
      // A pinned bot keeps its place. A new pin needs a free one of the `maxPinned`, checked in the same statement.
      pin: async (id: string, pinned: boolean) =>
        pinned
          ? (await sql`update profiles set pinned_at = coalesce(pinned_at, now()) where id = ${id}
              and (pinned_at is not null or (select count(*) from profiles where pinned_at is not null) < ${maxPinned}) returning id`).length > 0
          : (await sql`update profiles set pinned_at = null where id = ${id}`, true),
      remove: async (id: string) => void (await sql`delete from profiles where id = ${id}`),
      usingProvider: async (provider: string) => Number((await sql`select count(*) from profiles where provider = ${provider}`)[0].count),
    },
    // The default provider and bot. Memory search's fields are embeddings.ts's.
    settings: {
      get: async (): Promise<Pick<Settings, "defaultProvider" | "defaultProfile" | "unvetted" | "timeZone" | "turnsAtOnce">> => {
        const row = one(await sql<{ defaultProvider: string | null; defaultProfile: string | null; unvetted: boolean; timeZone: string | null; turnsAtOnce: number }[]>`select default_provider, default_profile, unvetted, time_zone, turns_at_once from settings`);
        return { defaultProvider: row?.defaultProvider ?? "", defaultProfile: row?.defaultProfile ?? "", unvetted: row?.unvetted ?? false, timeZone: row?.timeZone ?? "", turnsAtOnce: row?.turnsAtOnce ?? 32 };
      },
      save: async (fields: Partial<Pick<Settings, "defaultProvider" | "defaultProfile" | "unvetted" | "timeZone" | "turnsAtOnce">>) => {
        const values = {
          ...(fields.defaultProvider !== undefined ? { defaultProvider: fields.defaultProvider || null } : {}),
          ...(fields.defaultProfile !== undefined ? { defaultProfile: fields.defaultProfile || null } : {}),
          ...(fields.unvetted !== undefined ? { unvetted: fields.unvetted } : {}),
          ...(fields.timeZone !== undefined ? { timeZone: fields.timeZone || null } : {}),
          ...(fields.turnsAtOnce !== undefined ? { turnsAtOnce: fields.turnsAtOnce } : {}),
        };
        await sql`insert into settings ${sql({ id: 1, ...values })} on conflict (id) do update set ${sql(values)}`;
      },
    },
    providers: {
      list: async () => sql<ProviderRecord[]>`select id, kind, name, base_url, model, context_window, team_id from providers order by created_at, id`,
      get: async (id: string) => one(await sql<ProviderRecord[]>`select id, kind, name, base_url, model, context_window, team_id from providers where id = ${id}`),
      save: async (record: ProviderRecord, tx: Sql = sql) => {
        await tx`insert into providers ${tx(record, "id", "kind", "name", "baseUrl", "model", "contextWindow", "teamId")}
          on conflict (id) do update set kind = excluded.kind, name = excluded.name, base_url = excluded.base_url, model = excluded.model,
          context_window = excluded.context_window, team_id = excluded.team_id`;
        return record;
      },
      remove: async (id: string) => void (await sql`delete from providers where id = ${id}`),
    },
    plugins: {
      list: async () => sql<PluginRecord[]>`select id, kind, name, source, config, approved_hash, enabled, bots, allowed, status from plugins order by created_at, id`,
      create: async (r: PluginRecord) =>
        void (await sql`insert into plugins (id, kind, name, source, config, approved_hash, enabled, bots, allowed, status)
          values (${r.id}, ${r.kind}, ${r.name}, ${sql.json(r.source as postgres.JSONValue)}, ${sql.json(r.config as postgres.JSONValue)}, ${r.approvedHash}, ${r.enabled}, ${r.bots}, ${r.allowed && sql.json(r.allowed)}, ${r.status})`),
      update: async (id: string, fields: Partial<Pick<PluginRecord, "config" | "enabled" | "bots" | "allowed" | "status" | "source" | "approvedHash">>) => {
        const { config, allowed, source, ...rest } = fields;
        const values = {
          ...rest,
          ...(config === undefined ? {} : { config: sql.json(config as postgres.JSONValue) }),
          ...(allowed ? { allowed: sql.json(allowed) } : {}),
          ...(source === undefined ? {} : { source: sql.json(source as postgres.JSONValue) }),
        };
        if (Object.keys(values).length) await sql`update plugins set ${sql(values)} where id = ${id}`;
      },
      remove: async (id: string) => void (await sql`delete from plugins where id = ${id}`),
      // The bots each plugin is switched on for. Only a plugin chosen bot by bot reads them.
      on: async () => sql<{ profileId: string; pluginId: string }[]>`select profile_id, plugin_id from profile_plugins where enabled`,
      forBot: async (profileId: string, pluginId: string, enabled: boolean) =>
        void (await sql`insert into profile_plugins values (${profileId}, ${pluginId}, ${enabled})
          on conflict (profile_id, plugin_id) do update set enabled = excluded.enabled`),
    },
    sent: {
      get: async (id: string, messageId: string): Promise<Sent | null> =>
        one(await sql<Sent[]>`select input, files, plugin from sent where profile_id = ${id} and message_id = ${messageId}`),
      save: async (id: string, messageId: string, { input, files, plugin = null }: Sent) =>
        void (await sql`insert into sent (profile_id, message_id, input, files, plugin) values (${id}, ${messageId}, ${input}, ${sql.json(files)}, ${plugin})
          on conflict do nothing`),
      // The messages plugins sent, whose turn_start lines name them.
      byPlugins: async () => sql<{ profileId: string; messageId: string }[]>`select profile_id, message_id from sent where plugin is not null`,
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

export type Store = Awaited<ReturnType<typeof createStore>>;
