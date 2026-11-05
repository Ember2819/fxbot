export { cn } from "cn"

// A plugin's description as the plugin lists show it under its name: its first sentence, cut at a word to 100
// characters, which is two lines on a wide screen. The lists also stop it at two lines, which on a phone hold less.
export function blurb(text: string | undefined, max = 100) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const first = /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const word = cut.lastIndexOf(" ");
  return `${(word > max / 2 ? cut.slice(0, word) : cut.slice(0, max - 1)).replace(/[\s,;:–—-]+$/, "")}…`;
}
