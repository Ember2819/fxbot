---
title: "Let bots dream"
description: "The dreams plugin has each bot go over its day at night: it saves what's worth remembering and writes down ways of working as skills, and a journal in the bot's settings shows each change, with Undo."
---

The dreams plugin gives each bot a pass over its day at night. The bot saves what will matter in later chats as memories, citing the turns they came from, and when the day showed a way of doing a kind of task that worked, it writes it down as a skill. Each change is in a journal in the bot's settings, where **Undo** takes it back.

1. Add **dreams** from **Plugins**, on **Browse**, where fxbot's picks list it. It needs fxbot 0.5.0 or newer.
2. Open **Settings** › **Dreams**, and set when bots dream: `hour`, 3 by default. It's in the time zone in **Settings** › **General**, which the first browser to open fxbot set.
3. Chat as usual. A bot dreams at that hour once it has 6 turns since its last dream, which `minTurns` changes.

To see a dream now, open a bot's settings, then **Dream now** under **Dreams**. It reads the turns since the last dream, and takes as long as a long reply.

## Read the journal

**Dreams**, in each bot's settings, shows each night: how many turns it read, and its last line, such as "Saved two memories." Under it is each change:
- **Saved a memory**, **Changed a memory**, or **Merged a memory**, with the old text
- **Made a skill** or **Rewrote a skill**, with **Show**
- the turns it came from, with your words in them

**Undo** puts the memory or the skill back as it was. If you changed that memory since, Undo leaves it and says so: edit or delete it in **Memories**. **Skills from dreams** lists the bot's skills, with **Remove**. Each bot keeps its own: one bot's skills from dreams aren't another's.

## What a dream changes

- **Memories:** up to 10 changes a night. It changes only the bot's own memories, never the ones you wrote, and never forgets one. You remove memories in **Memories**.
- **Skills:** one change a night, and 20 skills a bot. Set `skills` to `off` for memories only.
- **The day is evidence, not instructions.** A dream doesn't follow requests quoted in what it read, saves only what a turn shows, and leaves out secrets and what mattered only that day.

A dream runs on the bot's own model and provider. A night costs one turn of it for each bot that dreams, with up to 96 KB of the day. The plugin's [README](https://github.com/iammrduncan/fxbot/tree/main/plugins/dreams) has the rules it gives the model.

## Only some bots

Dreams is on for every bot once added. To have only some bots dream, open **Settings** › **Dreams**, and under **Bots** choose **Choose**, then switch it on for each bot that should dream. A bot it's off for has no turns kept, and doesn't dream.

## Troubleshooting

- **A night says "Failed".** The bot's provider didn't answer. The turns wait for the next night.
- **A night says it was stopped.** It ran past `minutes`, 10 by default, or fxbot restarted during it. The turns wait for the next night.
- **No dream at the hour.** A bot needs `minTurns` turns since its last dream, and dreams within 4 hours of `hour`. A bot busy in a chat dreams a few minutes later.
