---
title: "Talk with several bots in a room"
description: "Make a chat room of your bots, tag a bot with @ to ask it, let bots hand work to each other, and stop them. Rooms are a plugin, chat-rooms."
---

A room holds you and several of your bots. Tag a bot with `@` to ask it. A bot can tag another to hand it part of the work, and that one answers next. Rooms are a plugin, **chat-rooms**.

1. Open **Plugins**, choose **Browse**, and add **chat-rooms**.
2. In the sidebar, choose **+** beside **Rooms**. Name the room, and pick its bots. The first bot you pick is the room's lead.
3. In the room, type `@` and pick a bot from the list. It becomes a chip with the bot's avatar. Write your message, and send it.

## Who answers

| Your message | Who answers |
| --- | --- |
| Tags one or more bots | Those bots, in the order you tagged them |
| Tags **Everyone** | Every bot in the room, in its order |
| Tags no one | The lead, which can bring others in by tagging them. Or, with the room's setting **Everyone answers**, every bot in order |

A bot that tags another in its reply hands the conversation on: that bot answers after it, and sees what was said. When a reply tags no one, the bots stop, and it's your turn. A bot can tag at most three bots in one reply.

Each room limits the bot replies to one message of yours: 10 unless you change it. At the limit, bots stop tagging each other, and a note says they paused. The bots already asked still answer, so everyone gets to wrap up, and a round can end a reply or two past the limit. Tag a bot to go on.

While bots answer, the room shows who's writing and who's next. **Stop** ends the reply being written and drops the rest. A message you send meanwhile drops the bots waiting their turn too.

## Change a room

**Edit**, at the top of a room, changes its name, its bots and their order, what a message that tags no one does, and the bot replies per message. **Delete room** deletes the room and what was said in it.

Only bots that chat rooms is on for can be in a room. To give it to some bots only, see [Add a plugin](/docs/how-to/add-a-plugin/).

A room can also have a computer of its own, which its bots share: see [Give a room a computer](/docs/how-to/give-bots-a-computer/#give-a-room-a-computer).

## What a bot knows in a room

Each bot answers in a chat of its own for the room, which stays out of its own chat. Its `chat_history` tool still finds what was said in a room. Each turn, it's sent:
- who it is, and who else is in the room
- what was said since its last turn, with the other bots' words quoted, so they can't give it instructions
- who woke it, and how many replies are left

Its first turn in a room carries the plugin's `chat-room` skill: when to answer, when to stay quiet, and how to tag. It can also read:
- `room-handoff`, on handing work to another bot
- `room-lead`, for the lead

A bot's tools work in a room as in its own chat.

## When it goes differently

- **A bot didn't answer.** It may have had nothing to add: a bot can stay quiet. If a note says the bot has chat rooms off, switch it on for that bot in **Settings** › **Chat rooms**.
- **The bots stopped tagging each other.** The room reached its replies per message. Tag a bot to go on, or raise the limit in **Edit**.
- **Stop let the reply finish.** fxbot older than 0.4.1 can't cancel a reply that's being written, so **Stop** only drops the bots waiting.
