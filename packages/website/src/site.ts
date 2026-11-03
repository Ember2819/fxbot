// Facts every page shares.
export const repo = "https://github.com/iammrduncan/fxbot";
// The Hackers in the Loop community's Discord, where fxbot is talked about.
export const discord = "https://discord.gg/3Qs2uejUf9";
// The site deploys from main, so its setup.sh is main's (astro.config.mjs copies it).
export const installCommand = "curl -fsSL https://fxbot.sh/setup.sh | sudo bash";

// The changelog page, generated from CHANGELOG.md (astro.config.mjs).
export const changelogPath = "docs/reference/changelog/";

// Where the site is published. Canonical links, the social card, and the sitemap give full addresses on it.
export const origin = "https://fxbot.sh";

// A path on this site, under the base it is built for (vite.config.ts).
export const href = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, "");
export const url = (path: string) => origin + href(path);
