import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createWorld } from "@workflow/world-postgres";
import { world } from "libfx/durable-world";
import type postgres from "postgres";
import { backup, type MigrateOptions } from "./migrate.ts";
import { moveSessions } from "./move-sessions.ts";

const run = promisify(execFile);
// world-postgres's folder. Its main export is dist/index.js.
const home = dirname(dirname(fileURLToPath(import.meta.resolve("@workflow/world-postgres"))));

// libfx's sessions, in fxbot's Postgres through Workflow's Postgres World. Its tables are the package's, in schemas of
// its own (workflow, workflow_drizzle, and graphile_worker), and its bootstrap migrates them, not migrations/.
export async function openSessions(sql: postgres.Sql, options: MigrateOptions) {
  await bootstrap(sql, options);
  // At its defaults the queue polls 100 times a second while idle. LISTEN wakes it for each new message, so a turn
  // doesn't wait on the poll. Its start() isn't called: it would queue every session again for an agent named
  // "default" (vercel-labs/fx#1253). The queue starts on its first message, and index.ts resumes open turns itself.
  const sessions = createWorld({
    connectionString: options.databaseUrl,
    jobPrefix: "fxbot_",
    namespace: "fxbot",
    queueConcurrency: 4,
    pollInterval: 5000,
    maxPoolSize: 6,
    applicationManagedShutdown: true,
  });
  await moveSessions(sql, sessions, options.dataDir).catch(async (error) => {
    await sessions.close?.();
    throw error;
  });
  return {
    durability: world(sessions, { name: "postgres", store: "fxbot" }),
    // How many lines a session's chat has, which is its newest line's cursor. libfx writes them to one stream per
    // session, named as its uiStreamOf does, and counts them the same way.
    async end(runId: string) {
      const info = (await sessions.streams.getInfo(runId, `${runId.replace(/^wrun_/, "strm_")}_user_${Buffer.from("libfx-ui").toString("base64url")}`)) as {
        tailIndex: number;
      };
      return info.tailIndex + 1;
    },
    close: async () => sessions.close?.(),
  };
}

// The package's migrations run, after a backup, when the schema was last set up by another version of it. The version
// is the workflow schema's comment. Its bootstrap ends its process, so it runs in one of its own.
async function bootstrap(sql: postgres.Sql, options: MigrateOptions) {
  const { version } = JSON.parse(await readFile(join(home, "package.json"), "utf8")) as { version: string };
  const by = `world-postgres ${version}`;
  const [{ was }] = await sql<{ was: string | null }[]>`select obj_description(to_regnamespace('workflow'), 'pg_namespace') as was`;
  if (was === by) return;
  const [{ used }] = await sql<{ used: boolean }[]>`select exists (select 1 from profiles) as used`;
  if (used) await backup(options, `world-postgres-${version}`);
  await run(process.execPath, [join(home, "bin", "setup.js")], { cwd: home, env: { PATH: process.env.PATH, WORKFLOW_POSTGRES_URL: options.databaseUrl } }).catch(
    (error: { stderr?: string; message: string }) => {
      throw new Error(`Cannot set up the tables for chats: ${error.stderr?.trim() || error.message}`);
    },
  );
  await sql.unsafe(`comment on schema workflow is '${by}'`);
  console.log(`fxbot set up the tables for chats, for ${by}`);
}
