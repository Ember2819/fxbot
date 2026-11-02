import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type postgres from "postgres";

const run = promisify(execFile);
const dir = join(import.meta.dirname, "migrations");
const kept = 5;

export type MigrateOptions = { databaseUrl: string; dataDir: string; backupsDir: string };

// The schema is the numbered SQL files in migrations/, each run once, in order of their names, and recorded in
// fxbot_migrations. A file that has shipped never changes; a fix is a new file. One transaction holds a lock, so two
// servers starting at once take turns, and runs every pending file, so a failure keeps none of them.
export async function migrate(sql: postgres.Sql, options: MigrateOptions) {
  const known = (await readdir(dir)).filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -4)).sort();
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('fxbot:migrate'))`;
    await tx`create table if not exists fxbot_migrations (id text primary key, applied_at timestamptz not null default now())`;
    const applied = (await tx<{ id: string }[]>`select id from fxbot_migrations order by id`).map((row) => row.id);
    // A newer release has run here. Its schema may not suit this one.
    const unknown = applied.filter((id) => !known.includes(id));
    if (unknown.length)
      throw new Error(`This database has migration ${unknown.join(", ")}, from a newer fxbot. Update to it, or restore the backup taken before that update.`);
    const pending = known.filter((id) => !applied.includes(id));
    if (!pending.length) return;
    // A database that already holds fxbot's records is backed up before anything changes it.
    const [{ used }] = await tx<{ used: boolean }[]>`select to_regclass('profiles') is not null as used`;
    if (used) await backup(options, pending[0]);
    for (const id of pending) {
      await tx.unsafe(await readFile(join(dir, `${id}.sql`), "utf8")).catch((error: Error) => {
        throw new Error(`Migration ${id} failed, and none of this start's migrations were kept: ${error.message}`);
      });
      await tx`insert into fxbot_migrations (id) values (${id})`;
    }
    console.log(`fxbot migrated the database: ${pending.join(", ")}`);
  });
}

// The database as pg_dump's custom format, and libfx's session files, in a folder of their own that only fxbot's user
// reads. The newest five are kept. Restore with pg_restore --clean --if-exists, and by unpacking the tarball.
async function backup({ databaseUrl, dataDir, backupsDir }: MigrateOptions, first: string) {
  const folder = join(backupsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-before-${first}`);
  try {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await run("pg_dump", ["--format=custom", `--file=${join(folder, "database.dump")}`, databaseUrl]);
    if (existsSync(dataDir)) await run("tar", ["-czf", join(folder, "data.tar.gz"), "-C", dataDir, "."]);
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw new Error(`Cannot back up before migrating, so nothing was migrated: ${(error as Error).message}`);
  }
  const all = (await readdir(backupsDir)).sort();
  for (const old of all.slice(0, -kept)) await rm(join(backupsDir, old), { recursive: true, force: true });
  console.log(`fxbot backed up the database to ${folder}`);
}
