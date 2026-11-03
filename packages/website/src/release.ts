import changelog from "../../../CHANGELOG.md?raw";

// The newest release in the changelog, for the home page.
const [, version = "", date = ""] = changelog.match(/^## (\d+\.\d+\.\d+\S*) \((\d{4}-\d{2}-\d{2})\)/m) ?? [];
export const latest = { version, date };
