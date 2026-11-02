// Facts every page shares.
export const repo = "https://github.com/iammrduncan/fxbot";
export const installCommand = "curl -fsSL https://raw.githubusercontent.com/iammrduncan/fxbot/main/setup.sh | sudo bash";

// A path on this site, under the base it is built for (vite.config.ts).
export const href = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, "");
