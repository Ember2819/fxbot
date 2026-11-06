// The two sets of pages, each in Diátaxis's four kinds (https://diataxis.fr), in the order their sidebars list them:
// the docs, for running fxbot, and the SDK's, for building on it. Each page is one kind only, at
// src/content/docs/<set>/<slug>.md. astro.config.mjs makes each set a sidebar topic, and each set's overview shows the
// groups as cards (components/Kinds.astro). The changelog is generated from the repository's CHANGELOG.md.
export type Group = { title: string; about: string; pages: { slug: string; label: string }[] };
export type Topic = { id: "docs" | "sdk"; label: string; groups: Group[] };

export const topics: Topic[] = [
  {
    id: "docs",
    label: "Docs",
    groups: [
      {
        title: "Tutorials",
        about: "A guided first run, from a fresh machine to a chat.",
        pages: [
          { slug: "tutorials/first-fxbot", label: "Your first fxbot" },
          { slug: "tutorials/set-up-with-an-agent", label: "Set up with your AI agent" },
        ],
      },
      {
        title: "How-to guides",
        about: "Steps for one task, when you know what you want.",
        pages: [
          { slug: "how-to/add-a-provider", label: "Add a provider" },
          { slug: "how-to/add-a-plugin", label: "Add a plugin" },
          { slug: "how-to/add-a-skill", label: "Add a skill" },
          { slug: "how-to/add-an-mcp-server", label: "Add an MCP server" },
          { slug: "how-to/give-bots-a-computer", label: "Give bots a computer" },
          { slug: "how-to/talk-in-a-room", label: "Talk with several bots in a room" },
          { slug: "how-to/start-fresh", label: "Start a chat over with /fresh" },
          { slug: "how-to/let-bots-dream", label: "Let bots dream" },
          { slug: "how-to/give-a-bot-a-routine", label: "Give a bot a routine" },
          { slug: "how-to/let-bots-work-together", label: "Let bots work together" },
          { slug: "how-to/memory-search", label: "Choose memory search's vectors" },
          { slug: "how-to/reach-it", label: "Reach it from other devices" },
          { slug: "how-to/tailscale-service", label: "Serve it at its own name" },
          { slug: "how-to/update", label: "Update to a new release" },
          { slug: "how-to/go-back", label: "Go back to an earlier release" },
          { slug: "how-to/back-up", label: "Back up fxbot" },
          { slug: "how-to/checkout-beside-release", label: "Run a checkout beside a release" },
          { slug: "how-to/cut-a-release", label: "Cut a release" },
        ],
      },
      {
        title: "Reference",
        about: "Facts to look up: settings, paths, commands, providers, and changes.",
        pages: [
          { slug: "reference/configuration", label: "Configuration" },
          { slug: "reference/install-layout", label: "What setup.sh creates" },
          { slug: "reference/commands", label: "Commands" },
          { slug: "reference/providers", label: "Providers" },
          { slug: "reference/computer", label: "The computer" },
          { slug: "reference/changelog", label: "Changelog" },
        ],
      },
      {
        title: "Explanation",
        about: "How fxbot works, and why it works that way.",
        pages: [
          { slug: "explanation/core-and-plugins", label: "Core and plugins" },
          { slug: "explanation/security", label: "Security model" },
          { slug: "explanation/releases", label: "Releases and updates" },
          { slug: "explanation/architecture", label: "Architecture" },
          { slug: "explanation/bots-and-chats", label: "Bots, chats, memories, and the library" },
        ],
      },
    ],
  },
  {
    id: "sdk",
    label: "SDK",
    groups: [
      {
        title: "Tutorials",
        about: "A first app on the SDK, from an empty folder to a chat with your bot.",
        pages: [{ slug: "tutorials/terminal-chat", label: "Build a terminal chat" }],
      },
      {
        title: "How-to guides",
        about: "Steps for one task in your own app.",
        pages: [
          { slug: "how-to/set-up", label: "Use the SDK in a project" },
          { slug: "how-to/stream-replies", label: "Stream replies" },
          { slug: "how-to/providers", label: "Connect providers" },
          { slug: "how-to/tools", label: "Give bots tools" },
          { slug: "how-to/memories", label: "Work with memories" },
          { slug: "how-to/web-page", label: "Build a page on the client" },
          { slug: "how-to/write-a-plugin", label: "Write a plugin" },
        ],
      },
      {
        title: "Reference",
        about: "The SDK's calls, options, and types, the server's HTTP API, and the plugin API.",
        pages: [
          { slug: "reference/create-fxbot", label: "createFxbot" },
          { slug: "reference/server-api", label: "The fxbot object" },
          { slug: "reference/client", label: "The client" },
          { slug: "reference/http-api", label: "HTTP API" },
          { slug: "reference/plugin-api", label: "Plugin API" },
        ],
      },
      {
        title: "Explanation",
        about: "How the SDK works under an app, and why.",
        pages: [{ slug: "explanation/how-it-works", label: "How the SDK works" }],
      },
    ],
  },
];
