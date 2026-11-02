# Containers

fxbot runs as containers. `setup.sh` finds podman, or docker when only docker is installed, and `compose up` starts fxbot, its database, and its local embedder.

**Core: what fxbot needs to run.** It replaces the install that [releases](../_completed/phases/releases.md) built, where `setup.sh` installed Node and the distro's Postgres on the machine. Distros ship different Postgres versions, and some have no pgvector, which [memories](memories.md) needs. The database image has pgvector on every machine.

Decided by the owner on 2026-11-02:
- Podman by default, and docker when it's the only one installed.
- One compose file starts the fxbot container and the database container. The database is pgvector's image, `pgvector/pgvector`.
- The local embedder for [memories](memories.md) is a service in the same compose file, on the CPU or a GPU.

To plan:
- **Images:** the release workflow builds fxbot's image for each tag, for amd64 and arm64, and publishes it.
- **Updating:** what Settings' Update does with containers, such as pulling the new image and starting it, and whether fxbot may manage its own containers through the podman or docker socket.
- **Starting at boot:** systemd running compose, or Podman's quadlets.
- **Data:** volumes for the database and chat files, and backups before migrations, taken from the database container.
- **Moving a 0.2 install** from the machine's own Postgres into the database container.
- **A checkout:** the database and embedder from the same compose file, with `npm run dev` on the machine.
- **Reaching it** stays the same. The fxbot container listens on 127.0.0.1:8787, and Tailscale or a proxy serves it.

Not planned yet.
