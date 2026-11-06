// fxbot's own plugins, checked against the release they'd ship in: each with code says the oldest fxbot it runs on, no
// floor is above that release, and plugin-breaks.json doesn't mark any. Part of `npm run typecheck`, so the release
// workflow runs it. On a release branch the next release is in the branch's name, since package.json trails it.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fitSaid, unfit, validBreak } from "../packages/sdk/src/plugin-fit.ts";
import { compareVersions } from "../packages/sdk/src/releases.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const branch = (() => {
  try {
    return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const next = /^release\/(\d+\.\d+\.\d+)$/.exec(branch)?.[1] ?? JSON.parse(read("package.json")).version;
const listed = JSON.parse(read("packages/sdk/src/plugin-breaks.json")).breaks;
const problems = listed.filter((line) => !validBreak(line)).map((line) => `plugin-breaks.json has a line fxbot can't read: ${JSON.stringify(line)}`);

for (const folder of readdirSync(new URL("../plugins/", import.meta.url), { withFileTypes: true }).filter((f) => f.isDirectory()).map((f) => f.name)) {
  const path = `plugins/${folder}/plugin.json`;
  if (!existsSync(new URL(`../${path}`, import.meta.url))) continue;
  const manifest = JSON.parse(read(path));
  const own = manifest.extensions?.["sh.fxbot"] ?? {};
  const code = [own.server, own.page].filter(Boolean).map((file) => read(`plugins/${folder}/${file}`)).join("\n");
  if (!code) continue;
  if (!own.minFxbot) {
    problems.push(`${folder} has code and no minFxbot.`);
    continue;
  }
  if (compareVersions(own.minFxbot, next) > 0) problems.push(`${folder} says minFxbot ${own.minFxbot}, which is above ${next}, the release it would ship in.`);
  const problem = unfit({ name: manifest.name, version: manifest.version, minFxbot: own.minFxbot }, code, next, listed.filter(validBreak));
  if (problem && !("needs" in problem)) problems.push(`${folder}: ${fitSaid(problem, next)}`);
}
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`fxbot's plugins fit ${next}.`);
