import { compareVersions, isVersion } from "./releases.ts";

// A line of plugin-breaks.json: names a release took out of the plugin API, with `since` and `uses`, every plugin older
// than a release, with `since` alone, or a plugin's bad versions, with `plugin` and `below`. It applies from `since` on.
export type PluginBreak = { says: string; since?: string; uses?: string[]; plugin?: string; below?: string };

// A line fxbot can read. One it can't is left out, so a bad published line can't stop a plugin.
export const validBreak = (line: PluginBreak) => {
  const version = (value: unknown) => typeof value === "string" && isVersion(value);
  if (typeof line?.says !== "string" || (line.since !== undefined && !version(line.since))) return false;
  if (line.plugin !== undefined) return typeof line.plugin === "string" && version(line.below);
  return version(line.since) && (line.uses === undefined || (Array.isArray(line.uses) && line.uses.every((name) => typeof name === "string" && name.length > 0)));
};

// As a whole word: fx.chats.send isn't in fx.chats.sendAll.
const names = (code: string, name: string) => new RegExp(`(?<![\\w$.])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`).test(code);

// Why a plugin can't run on a version of fxbot: a floor it needs, or a line that fits it. `code` is its server and page
// code. Pure, so an update can ask about a version this isn't yet. An app with no version, 0.0.0, has no floor to meet.
export function unfit(plugin: { name: string; version: string; minFxbot?: string }, code: string, version: string, breaks: PluginBreak[]) {
  if (!isVersion(version)) return undefined;
  const running = version.replace(/-.*$/, "");
  const floor = plugin.minFxbot ?? "0.0.0";
  if (running !== "0.0.0" && compareVersions(running, floor) < 0) return { needs: floor };
  for (const { since, uses, plugin: name, below, says } of breaks) {
    if (since && compareVersions(running, since) < 0) continue;
    if (name) {
      if (name === plugin.name && isVersion(plugin.version) && compareVersions(plugin.version, below!) < 0) return { unsupported: says };
      continue;
    }
    // A plugin with a floor at the break was built since it.
    if (compareVersions(floor, since!) >= 0) continue;
    if (!uses) return { unsupported: says };
    const used = uses.find((each) => names(code, each));
    if (used) return { unsupported: `It uses ${used}, which fxbot ${since} took out. ${says}` };
  }
}

export const fitSaid = (problem: NonNullable<ReturnType<typeof unfit>>, version: string) =>
  "needs" in problem ? `It needs fxbot ${problem.needs} or newer. This is ${version}.` : `It doesn't work on fxbot ${version}. ${problem.unsupported}`;
