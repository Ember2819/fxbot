---
title: "Cut a release"
description: "For maintainers. Work for the next release happens on release/<version>, made from main after the last release. These steps release 0.2.0."
---

For maintainers. Work for the next release happens on `release/<version>`, made from `main` after the last release. These steps release `0.2.0`.

1. Check the branch:

   ```sh
   npm run typecheck && npm run build
   ```

2. Set the version, in `package.json` and the lockfile:

   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```

3. In `CHANGELOG.md`, rename `## Unreleased` to `## 0.2.0 (<date>)`. If the release adds migrations, bumps libfx, or needs a step by hand, open its section with **Before upgrading**.

4. Write the release's notes in `docs/releases/0.2.0.md`, shaped like the last one's. GitHub Releases and Settings show them, and they're short enough to paste anywhere. Leave out **Before upgrading** when the changelog has none. Keep it above **Changes**, because Settings shows the notes in a small box above **Update**.

   ```md
   fxbot v0.2.0 is out!

   https://fxbot.sh/docs/reference/changelog/

   Before upgrading: what an owner needs to know first.

   Changes:

   - New Plugin: Name => What it gives you
   - A line for each thing worth telling
   - Bug fix: what stopped going wrong
   ```

5. Commit, merge into `main`, and push:

   ```sh
   git add docs/releases && git commit -am "Release 0.2.0"
   git switch main && git merge --ff-only release/0.2.0 && git push
   ```

6. Start the next release's branch:

   ```sh
   git switch -c release/0.3.0 && git push -u origin release/0.3.0
   ```

The [release workflow](.github/workflows/release.yml) then typechecks and builds `main`, checks that no shipped migration changed, builds fxbot's image for amd64 and arm64, and pushes it to ghcr.io as `0.2.0`, `0.2`, and `latest`. Only then does it tag `v0.2.0` and publish a GitHub Release with `docs/releases/0.2.0.md` as the notes, so Settings never offers a release without an image. If a check or the image's build fails, the changelog has no section for the version, or the notes are missing or open with another version, nothing is tagged or published.

- **A prerelease,** such as `0.3.0-rc.1`, is the same steps with that version. It is published as a prerelease, and its image gets only its own tag, `0.3.0-rc.1`.
- **A fix to a release** goes on `release/0.2.1`, made from `main`, and is merged into the open release branch after.
- **An update to the site alone** goes to `main` with no new version. The workflow finds that version tagged and does nothing, and the site deploys, so installs see no change. Only do this while the branch holds nothing but the site and docs.

How versions, tags, and migrations fit together is in [Releases and updates](/docs/explanation/releases/).

## Once, after the first release with an image

GitHub makes a new package private, and `setup.sh` pulls the image without a login. After the workflow has pushed the first image, open the `fxbot` package on GitHub, then **Package settings**, **Change visibility**, and **Public**. Check it from a machine that isn't logged in to ghcr.io:

```sh
podman pull ghcr.io/iammrduncan/fxbot:<version>
```
