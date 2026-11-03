---
title: "Use the SDK in a project"
description: "Add @fxbot/sdk to a Node app of your own, with Postgres and the local embedder beside it. The SDK isn't on npm yet. It's TypeScript source in fxbot's repository, and your app takes it from there through an npm workspace."
---

Add `@fxbot/sdk` to a Node app of your own, with Postgres and the local embedder beside it. The SDK isn't on npm yet. It's TypeScript source in fxbot's repository, and your app takes it from there through an npm workspace.

You need Node 22.18 or newer, git, and podman or docker.

1. Make the project's folder, and clone fxbot inside it:

   ```sh
   mkdir my-bot && cd my-bot
   git clone --depth 1 https://github.com/iammrduncan/fxbot
   ```

   `main` holds releases only, so this is the newest release. To pin one, add `--branch v0.3.0`. A git submodule works the same way: `git submodule add https://github.com/iammrduncan/fxbot`.

2. Write `package.json`, with the SDK's folder as a workspace:

   ```json
   {
     "name": "my-bot",
     "private": true,
     "type": "module",
     "workspaces": ["fxbot/packages/sdk"],
     "dependencies": { "@fxbot/sdk": "*" }
   }
   ```

   Node runs TypeScript as it is, but not from inside `node_modules`. With the workspace, `node_modules/@fxbot/sdk` is a link to `fxbot/packages/sdk`, and Node loads the SDK from there.

3. Install:

   ```sh
   npm install
   ```

   This installs the SDK's packages, with libfx's native addon for your machine's CPU.

4. Make the key that seals secrets, and a database password, and write them to `.env`:

   ```sh
   openssl rand -base64 32 > secret.key && chmod 400 secret.key
   pw=$(openssl rand -hex 16)
   printf '%s\n' "FXBOT_DB_PASSWORD=$pw" "FXBOT_DATABASE_URL=postgres://fxbot:$pw@127.0.0.1:5433/fxbot_dev" FXBOT_EMBED_URL=http://127.0.0.1:8081/v1 FXBOT_SECRET_KEY_FILE=secret.key > .env
   ```

   The SDK seals every API key and token it stores with `secret.key`. Keep the file for as long as you keep the database: without it, they can't be opened again.

5. Start Postgres, with pgvector, on 127.0.0.1:5433, and the local embedder for memory search on 127.0.0.1:8081. fxbot's own compose file runs both:

   ```sh
   podman compose -f fxbot/deploy/compose.dev.yaml --env-file .env up -d        # or docker compose
   ```

   The embedder downloads its model, 310 MB, on its first start. Until it answers, memory search uses words alone.

   The compose project is called `fxbot-dev`, the same as a checkout of fxbot's. If one already runs on this machine, give yours a name and ports of its own in `.env`: `COMPOSE_PROJECT_NAME=my-bot`, then `FXBOT_DB_PORT` and `FXBOT_EMBED_PORT`, with the same ports in `FXBOT_DATABASE_URL` and `FXBOT_EMBED_URL`.

6. Write `bot.ts`:

   ```ts
   import { readFileSync } from "node:fs";
   import { createFxbot } from "@fxbot/sdk";

   const fxbot = await createFxbot({
     databaseUrl: process.env.FXBOT_DATABASE_URL!,
     secretKey: readFileSync(process.env.FXBOT_SECRET_KEY_FILE!, "utf8"),
     embedUrl: process.env.FXBOT_EMBED_URL,
     syncRegistry: false,
   });
   console.log(await fxbot.profiles.list());
   await fxbot.close();
   ```

   `syncRegistry: false` skips the copy of GitHub's MCP registry and the read of fxbot's lists when the app starts. An app that doesn't search for MCP servers doesn't need them. Every option is in [createFxbot](/sdk/reference/create-fxbot/).

7. Run it:

   ```sh
   node --env-file=.env bot.ts
   ```

   On the first start, `createFxbot` brings the empty database up to date and prints `fxbot migrated the database:`, with the migrations it ran. Then the script prints `[]`: there are no bots yet.

The SDK keeps plugins' files in `data/` and its backups in `backups/`, in the folder the app runs from. Chats are in the database. `dataDir` and `backupsDir` move them. Keep `.env`, `secret.key`, `data/`, `backups/`, and `node_modules/` out of git, and `fxbot/` too unless it's a submodule.

## Type-check it

An editor or `tsc` needs fxbot's TypeScript settings. The SDK's own source needs the DOM library, even on a server.

1. Install TypeScript and Node's types:

   ```sh
   npm install -D typescript @types/node@22
   ```

2. Write `tsconfig.json`:

   ```json
   {
     "compilerOptions": {
       "target": "ES2023",
       "lib": ["ES2023", "DOM"],
       "module": "ESNext",
       "moduleResolution": "bundler",
       "customConditions": ["node"],
       "types": ["node"],
       "strict": true,
       "noEmit": true,
       "skipLibCheck": true,
       "allowImportingTsExtensions": true,
       "verbatimModuleSyntax": true,
       "erasableSyntaxOnly": true
     },
     "include": ["*.ts"]
   }
   ```

   `include` names your own files. Change it to where your code lives, and leave `fxbot/` out: `tsc` checks the SDK through your imports, and fxbot's other packages need settings of their own.

3. Check:

   ```sh
   npx tsc
   ```

## Update the SDK

1. Read the release's section of the [changelog](/docs/reference/changelog/). A release that adds migrations says so under **Before upgrading**.
2. Pull the new release, or check out its tag, and install again:

   ```sh
   git -C fxbot pull
   npm install
   ```

3. Start your app. `createFxbot` runs the new migrations, after backing up the database and `data/` into `backups/`.

## If it doesn't work

- **`npm install` can't find `@fxbot/sdk`.** npm looked for it on the registry, where it isn't. Check that `workspaces` names `fxbot/packages/sdk`, the folder with the SDK's own `package.json`.
- **Node refuses to strip types in `node_modules`.** The SDK was copied into `node_modules` instead of linked. Use the workspace from step 2, and run `npm install` again.
- **`createFxbot` says memories need pgvector.** The database lacks the extension. Use the database that the compose file runs, which has it.
- **`createFxbot` says it can't back up before migrating.** The backup runs the machine's `pg_dump`, which must be Postgres 17's, such as from `postgresql-client-17`. Nothing was migrated.
- **`createFxbot` says the database has a migration from a newer fxbot.** A newer SDK has run on this database. Update `fxbot/` to that release or newer.
- **`createFxbot` says the secret key must be 32 random bytes in base64.** `FXBOT_SECRET_KEY_FILE` names the wrong file, or the file holds something else.
- **Compose says the port is in use.** Something else has 5433 or 8081. Set `FXBOT_DB_PORT` or `FXBOT_EMBED_PORT` in `.env`, as in step 5.
