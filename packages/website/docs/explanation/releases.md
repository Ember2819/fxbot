# Releases and updates

fxbot gives people a version to stay on, while its owner keeps working on the next one. This page is about how releases are made, how an install moves between them, and why the database only moves forward.

## A release is a merge into main

One version covers the whole repository. Work happens on a branch named for the next release, and `npm run dev` runs from it. When it is ready, it merges into `main`, which holds releases only.

The release workflow runs on `main`. When the version in `package.json` has no tag yet, it typechecks and builds, checks that no shipped migration changed, and builds fxbot's image for amd64 and arm64 and pushes it to ghcr.io. Only then does it tag the version and publish the release, with its section of the [changelog](/docs/reference/changelog/) as the notes. No tag points at a build that failed, and Settings never offers a release without an image.

The changelog is written by hand. A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**, so its notes say so before anything else.

## Installs stay where they are

An install stays on its release until someone chooses the next one. fx, which fxbot takes after, updates itself by default. fxbot doesn't: you update when you are ready. Once a day, the server asks GitHub for the newest release, and Settings shows its notes and an **Update** button. `FXBOT_UPDATE_CHECK=off` stops the asking. Prereleases install only by name, so nobody lands on one by accident.

## An image per release

An install runs three containers, from the release's compose file: the app, from fxbot's image for that version, its database, from pgvector's Postgres image, and the local embedder for memory search, from llama.cpp's server image, unless it's turned off. Every machine then runs the same Node, the same Postgres, and pgvector, whatever its distro ships. `/opt/fxbot/.env` names the version that runs.

The app doesn't start containers itself, and has no podman or docker socket. Settings' **Update** writes a request into a folder the app shares with the machine. systemd sees it and runs the machine's `fxbot` command, as root, which takes only a version from the request. The command downloads the release's compose file and itself, pulls the images it doesn't have yet, writes the new version, and recreates the app's container. Running chats get up to 90 seconds to finish, the database keeps running, and the app is down for a few seconds. The command writes each step to a status file, which Settings shows, and the page reloads onto the new version once it answers.

Nothing changes until the new release has downloaded, so a failed download leaves fxbot as it was. If the new app isn't healthy within 5 minutes, the command goes back to the release it replaced by itself, restoring the backup the new app took before its migrations, if it ran any. Settings then shows why, from the new app's last log lines. [Going back](/docs/how-to/go-back/) by hand later works the same way.

## Migrations

Each release's database changes are numbered SQL files, which ship with the release and never change after it. A starting server runs the ones its database hasn't, in one transaction, under a lock: all of them or none.

They only move forward. Writing a way back for every change would double the work and rarely be tried, so fxbot takes a copy instead. Before any migration runs on a database in use, the server backs up the database and the chat files, whatever started it, and keeps the last five. In a release, `pg_dump` runs in the app's container, whose image carries Postgres 17's client. An older release refuses a database that a newer one migrated, so going back across a migration means restoring that copy.

## Built from the tag

A release's image is built by the release workflow from the commit its tag points at, with the packages in the lockfile. Compose names the exact version of each image, such as `0.3.0`, not `latest`. `setup.sh` and `fxbot update` take the compose file and the `fxbot` command from the release's tag.

Chats live in libfx's session files, so a release that bumps libfx says so under **Before upgrading**.
