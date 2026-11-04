import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Component, createContext, useContext, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { createPortal } from "react-dom";
import * as attachment from "@/components/ui/attachment";
import * as badge from "@/components/ui/badge";
import * as bubble from "@/components/ui/bubble";
import * as button from "@/components/ui/button";
import * as checkbox from "@/components/ui/checkbox";
import * as dialog from "@/components/ui/dialog";
import * as empty from "@/components/ui/empty";
import * as input from "@/components/ui/input";
import * as message from "@/components/ui/message";
import * as scroller from "@/components/ui/message-scroller";
import * as sidebar from "@/components/ui/sidebar";
import * as switches from "@/components/ui/switch";
import * as textarea from "@/components/ui/textarea";
import { applyLine, type Part, type Profile } from "@fxbot/sdk/client";
import { Blob } from "./blob.tsx";
import { client } from "./client.ts";
import { Header } from "./header.tsx";
import { go } from "./nav.ts";
import { Reply } from "./steps.tsx";

// Plugins' page code, loaded the way opencode loads it: the server serves each running plugin's prebuilt CommonJS
// bundle, and the page runs it with a `require` that hands over the app's own React and `@fxbot/app`, so there is one
// copy of React. Its default export is called with the app's API, scoped to it, and each part it adds sits in an error
// boundary. With no plugins, nothing here fetches or runs any code.

export type ToolCall = Extract<Part, { type: "tool" }>;
// setDraft takes the new text, or a function from the draft to it, as React's setters do.
export type ComposerProps = { bot: Profile; setDraft: (text: string | ((draft: string) => string)) => void; attach: (files: File[]) => void };
type Nav = { label: string; path: string; icon?: ComponentType<{ className?: string }> };
type Places = {
  routes: { path: string; parts: string[]; Component: ComponentType<{ params: Record<string, string> }> }[];
  sidebar: ComponentType[];
  nav: Nav[];
  composer: ComponentType<ComposerProps>[];
  toolViews: Map<string, ComponentType<{ call: ToolCall }>>;
  settings: ComponentType[];
  botSettings: ComponentType<{ bot: Profile }>[];
  botPanel: ComponentType<{ bot: Profile }>[];
  // Places other plugins leave with Slot, by name, such as `chat-rooms.room-header`.
  slots: Map<string, ComponentType<any>[]>;
};
// `key` is the URLs it loaded from, which change with its files.
type Loaded = { name: string; iconKey: string; key: string; css?: HTMLLinkElement; places: Places };

const emptyPlaces = (): Places => ({ routes: [], sidebar: [], nav: [], composer: [], toolViews: new Map(), settings: [], botSettings: [], botPanel: [], slots: new Map() });

// The loaded plugins, by name. A change makes a new array, which the places read through usePlugins.
let loaded: Loaded[] = [];
const listeners = new Set<() => void>();
const publish = (next: Loaded[]) => ((loaded = next), listeners.forEach((listener) => listener()));
const subscribe = (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener));
export const usePlugins = () => useSyncExternalStore(subscribe, () => loaded);

// The bots, for `useBots`: the app's own list.
const BotsContext = createContext<Profile[] | null>(null);
export const BotsProvider = BotsContext.Provider;

// Built when a plugin loads, after every module of the page has.
const ui = () => ({
  ...attachment,
  ...badge,
  ...bubble,
  ...button,
  ...checkbox,
  ...dialog,
  ...empty,
  ...input,
  ...message,
  ...scroller,
  ...sidebar,
  ...switches,
  ...textarea,
  Streamdown,
  Header,
  Blob,
  Reply,
});

// `@fxbot/app` for one plugin: the client, its own routes, the app's navigation and bots, and the app's components.
function appModule(name: string) {
  return {
    client,
    applyLine,
    api: (path: string, init?: RequestInit) => fetch(`/api/plugins/${name}/${path.replace(/^\//, "")}`, init),
    go,
    useBots: () => useContext(BotsContext),
    // React's, for a plugin that draws a component into DOM it doesn't render, such as an editor's node.
    createPortal,
    // A place in this plugin's page that other plugins fill with app.slot(name, Component), each part in its own
    // error boundary. One nobody fills draws nothing.
    Slot: ({ name, props }: { name: string; props?: Record<string, unknown> }) => <Place pick={(places) => places.slots.get(name) ?? []} props={props ?? {}} />,
    ui: ui(),
  };
}

// Runs one plugin's bundle, and keeps what its setup adds.
async function run(name: string, version: string, url: string): Promise<Places> {
  const code = await (await fetch(url)).text();
  const places = emptyPlaces();
  const app = appModule(name);
  const require = (id: string) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "@fxbot/app") return app;
    throw new Error(`${name} asked for ${id}, which fxbot doesn't give plugins. Bundle it in.`);
  };
  const module: { exports: unknown } = { exports: {} };
  new Function("require", "module", "exports", code)(require, module, module.exports);
  const setup = typeof module.exports === "function" ? module.exports : (module.exports as { default?: unknown }).default;
  if (typeof setup !== "function") throw new Error(`${name}'s page code exports no function.`);
  setup({
    name,
    version,
    route: (path: string, Component: Places["routes"][number]["Component"]) => places.routes.push({ path, parts: path.split("/").filter(Boolean), Component }),
    sidebar: (Component: ComponentType) => places.sidebar.push(Component),
    nav: (nav: Nav) => places.nav.push(nav),
    composer: (Component: ComponentType<ComposerProps>) => places.composer.push(Component),
    toolView: (tool: string, Component: ComponentType<{ call: ToolCall }>) => places.toolViews.set(`${name}_${tool}`, Component),
    settings: (Component: ComponentType) => places.settings.push(Component),
    botSettings: (Component: ComponentType<{ bot: Profile }>) => places.botSettings.push(Component),
    botPanel: (Component: ComponentType<{ bot: Profile }>) => places.botPanel.push(Component),
    slot: (name: string, Component: ComponentType<any>) => places.slots.set(name, [...(places.slots.get(name) ?? []), Component]),
  });
  return places;
}

// Reads the list of running plugins, and loads the ones that are new or changed. A plugin that's gone loses its
// places; its code stays in the page until it reloads. Adding, updating, or removing one calls this again.
export async function loadPlugins() {
  const list = await client.plugins.pages().catch(() => null);
  if (!list) return;
  const next: Loaded[] = [];
  for (const { name, iconKey, version, page, css } of list) {
    const now = loaded.find((p) => p.name === name);
    const key = `${page ?? ""} ${css ?? ""}`;
    if (now && now.key === key) {
      next.push({ ...now, iconKey });
      continue;
    }
    now?.css?.remove();
    let link: HTMLLinkElement | undefined;
    if (css) {
      link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: css });
      document.head.append(link);
    }
    const places = page ? await run(name, version, page).catch((error: Error) => (console.error(`Plugin ${name}:`, error), emptyPlaces())) : emptyPlaces();
    next.push({ name, iconKey, key, css: link, places });
  }
  for (const gone of loaded.filter((p) => !list.some((l) => l.name === p.name))) gone.css?.remove();
  publish(next);
}

// A plugin's part, kept from taking down the app: one that throws shows a short card in its place.
export class PluginPart extends Component<{ plugin: string; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <p role="alert" className="m-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {this.props.plugin} broke here: {this.state.error.message}
      </p>
    );
  }
}

// Each plugin's parts for one place, in the order the plugins were added.
export function Place<P extends object>({ pick, props }: { pick: (places: Places) => ComponentType<P>[]; props: P }) {
  const plugins = usePlugins();
  return plugins.flatMap(({ name, places }) =>
    pick(places).map((Part, i) => (
      <PluginPart key={`${name}-${i}`} plugin={name}>
        <Part {...props} />
      </PluginPart>
    )),
  );
}

// Each loaded plugin that draws in Settings, with its parts, in load order: a tab each.
export function usePluginSettings() {
  return usePlugins().flatMap(({ name, iconKey, places }) => (places.settings.length ? [{ name, iconKey, parts: places.settings }] : []));
}

// The plugin screen for a path, `/<plugin>/…`, checked after the app's own.
export function usePluginScreen(path: string): ReactNode | undefined {
  const plugins = usePlugins();
  const [, top, ...rest] = path.split("/");
  const plugin = plugins.find((p) => p.name === top);
  if (!plugin) return undefined;
  for (const route of plugin.places.routes) {
    if (route.parts.length !== rest.filter(Boolean).length) continue;
    const params: Record<string, string> = {};
    if (route.parts.every((part, i) => (part.startsWith(":") ? ((params[part.slice(1)] = decodeURIComponent(rest[i])), true) : part === rest[i])))
      return (
        <PluginPart key={path} plugin={plugin.name}>
          <route.Component params={params} />
        </PluginPart>
      );
  }
  return undefined;
}

// How a plugin's tool call shows in a reply, if its plugin drew one.
export function usePluginToolView(tool: string) {
  const plugins = usePlugins();
  for (const { name, places } of plugins) {
    const View = places.toolViews.get(tool);
    if (View) return { plugin: name, View };
  }
  return undefined;
}

// The sidebar footer's buttons, one per plugin nav entry, and each one's address.
export function usePluginNav() {
  return usePlugins().flatMap(({ name, iconKey, places }) => places.nav.map((nav) => ({ ...nav, plugin: name, iconKey, href: `/${name}${nav.path.startsWith("/") ? nav.path : `/${nav.path}`}` })));
}
