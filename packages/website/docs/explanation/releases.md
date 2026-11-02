# Releases and updates

fxbot gives people a version to stay on, while its owner keeps working on the next one. This page is about how releases are made, how an install moves between them, and why the database only moves forward.

## A release is a merge into main

One version covers the whole repository. Work happens on a branch named for the next release, and `npm run dev` runs from it. When it is ready, it merges into `main`, which holds releases only.

The release workflow runs on `main`. When the version in `package.json` has no tag yet, it typechecks and builds, checks that no shipped migration changed, and only then tags it and publishes the release, with its section of the [changelog](/docs/reference/changelog/) as the notes. No tag points at a build that failed.

The changelog is written by hand. A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**, so its notes say so before anything else.

## Installs stay where they are

An install stays on its release until someone chooses the next one. fx, which fxbot takes after, updates itself by default. fxbot doesn't: you update when you are ready. Once a day, the server asks GitHub for the newest release, and Settings shows its notes and an **Update** button. `FXBOT_UPDATE_CHECK=off` stops the asking. Prereleases install only by name, so nobody lands on one by accident.

## Built beside the running release

Each installed release is a git worktree of its own, `/opt/fxbot/releases/<tag>/`, with its own packages and build. An update builds the new release there while the running one keeps serving. Only once it has built does `current` switch to it, in one rename. Running chats finish, and the server exits so systemd starts the new release.

Nothing changes until the new release has built, so a failed build leaves fxbot as it was. The `fxbot` user owns `/opt/fxbot`, so the **Update** button needs no helper with more rights than the server has. The release it replaced stays, for [going back](/docs/how-to/go-back/).

## Migrations

Each release's database changes are numbered SQL files, which ship with the release and never change after it. A starting server runs the ones its database hasn't, in one transaction, under a lock: all of them or none.

They only move forward. Writing a way back for every change would double the work and rarely be tried, so fxbot takes a copy instead. Before any migration runs on a database in use, the server backs up the database and the chat files, whatever started it, and keeps the last five. An older release refuses a database that a newer one migrated, so going back across a migration means restoring that copy.

## Trust without binaries

fxbot runs from its source. Tags that cannot move, git's hashes, and the lockfile's integrity hashes do the work that checksums do for a binary. `setup.sh` checks Node's checksum before it installs Node.

Chats live in libfx's session files, so a release that bumps libfx says so under **Before upgrading**.
