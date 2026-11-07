// How bots show in a room: a mention's chip, with the bot's avatar and its current name, and a room's bots as avatars,
// stacked.
import { ui, useBots } from "@fxbot/app";

// A mention: <@bot:id> as the bot's avatar and @Name, or <@all> as @everyone. The name is the bot's now, so a rename
// shows; a bot that's gone shows as one.
export function Chip({ id }) {
  const bot = (useBots() ?? []).find((b) => b.id === id);
  if (id === "all") return <span className="cr-chip">@everyone</span>;
  return (
    <span className="cr-chip">
      {bot && (
        <span className="cr-chip-face" aria-hidden="true">
          <ui.Blob {...bot} size={16} />
        </span>
      )}
      @{bot?.name ?? "a bot that's gone"}
    </span>
  );
}

// A room's bots as avatars, each over the one before by a third, in the room's order. Past four, the fourth is +N. The
// bot `busy` names, writing in the room, shows it, as does one the app knows is busy.
export function Stack({ ids, size = 18, busy }) {
  const all = useBots() ?? [];
  const bots = ids.map((id) => all.find((b) => b.id === id)).filter(Boolean);
  const shown = bots.length > 4 ? bots.slice(0, 3) : bots;
  return (
    <span className="cr-stack" aria-hidden="true" style={{ "--cr-size": `${size}px` }}>
      {shown.map((bot) => (
        <span key={bot.id}>
          <ui.Blob {...bot} size={size} busy={bot.busy || bot.id === busy} />
        </span>
      ))}
      {bots.length > 4 && <span className="cr-more">+{bots.length - 3}</span>}
    </span>
  );
}
