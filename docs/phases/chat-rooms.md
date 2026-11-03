# Chat rooms

Rooms where more than one bot can take part in the same conversation.

**Add-on.** A plugin that adds rooms to the app: a sidebar entry and a screen for each room, its own tables for rooms and who is in them, and a hook that hands each message to the room's bots and starts their turns, all through the [plugin API](../_completed/phases/plugins.md).

Its first version is built: fxbot's plugin [plugins/chat-rooms](../../plugins/chat-rooms/README.md), one of the two that proved the plugin API ([plugins: the first plugins](../_completed/phases/plugins.md#the-first-plugins)). Each of the owner's messages gets one answer from each bot in the room, in turn. What comes next, such as bots answering each other, starts from there.
