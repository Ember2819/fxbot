// A mention in a room's message: <@bot:<id>>, with the bot's 12 hex characters, or <@all> for every bot in the room.
// It stays literal in Markdown, and doesn't flicker while a reply streams. A rename changes how it's drawn, not the
// token. The page and the server share this file.

export const all = "<@all>";
export const tokenOf = (bot: string) => `<@bot:${bot}>`;
// Each token, with the bot's id, or none for <@all>.
export const tokens = /<@(?:bot:([0-9a-f]{12})|all)>/g;

// The bots a text tags, in order, each once: "all" for <@all>.
export function mentioned(text: string) {
  const found: string[] = [];
  for (const m of text.matchAll(tokens)) if (!found.includes(m[1] ?? "all")) found.push(m[1] ?? "all");
  return found;
}

// The text with each token as @Name, for a model to read. A bot that's gone is "@a bot that's gone".
export const toNames = (text: string, names: Map<string, string>) =>
  text.replace(tokens, (_, bot?: string) => (bot ? `@${names.get(bot) ?? "a bot that's gone"}` : "@everyone"));

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A bot's reply, with each @Name of another bot in the room as its token: the whole name, ignoring case, on word
// boundaries, the longest name first, and not in code or an email address. A token the bot wrote stays, except its own,
// which becomes its name: a bot doesn't wake itself.
export function toTokens(text: string, members: { id: string; name: string }[], self: string) {
  const others = members.filter((m) => m.id !== self && m.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const byName = new Map(others.map((m) => [m.name.toLowerCase(), m.id]));
  const me = members.find((m) => m.id === self);
  const names = others.length ? new RegExp(`(^|[^\\w.@])@(${others.map((m) => escape(m.name)).join("|")})(?![\\w])`, "gi") : null;
  // Code, fenced or inline, is left as it is.
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2) return part;
      const own = me ? part.replaceAll(tokenOf(self), `@${me.name}`) : part;
      return names ? own.replace(names, (_, before: string, name: string) => before + tokenOf(byName.get(name.toLowerCase())!)) : own;
    })
    .join("");
}
