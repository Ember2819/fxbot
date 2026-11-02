import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import screenshot from "../../../docs/screenshot.png";
import { Blob, colorCount, shapeCount, type Color, type Shape } from "./blob.tsx";
import { Command } from "./code.tsx";
import { buttonVariants } from "./components/ui/button.tsx";
import { changelogPath, latest } from "./content.ts";
import { Shell } from "./layout.tsx";
import { href, installCommand, repo } from "./site.ts";

// Bob, Fernando, and Securely from the screenshot, and a few friends. One is busy, as a bot is during a turn.
const crowd: { shape: Shape; color: Color; size: number; busy?: boolean }[] = [
  { shape: "circle", color: "black", size: 76 },
  { shape: "clover", color: "green", size: 58 },
  { shape: "triangle", color: "amber", size: 62 },
  { shape: "heart", color: "pink", size: 52 },
  { shape: "sparkle", color: "blue", size: 66, busy: true },
  { shape: "cloud", color: "purple", size: 56 },
  { shape: "pumpkin", color: "orange", size: 48 },
];

const features: { shape: Shape; color: Color; title: string; link: string; body: ReactNode }[] = [
  {
    shape: "heart",
    color: "pink",
    title: "Bots and chats",
    link: "/docs/explanation/bots-and-chats/",
    body: (
      <>
        Give each bot a name, instructions, a provider and model, and a look: one of {shapeCount} shapes in {colorCount} colors. Its chat streams, survives reloads and restarts, and takes images and text files. A <code>chat_history</code> tool lets it search its own past.
      </>
    ),
  },
  {
    shape: "sparkle",
    color: "amber",
    title: "Providers",
    link: "/docs/how-to/add-a-provider/",
    body: <>Sign in to a ChatGPT, Grok, or Vercel account with a device code, from any device. Or add a key for OpenAI, AI Gateway, OpenRouter, or OpenCode, or point at a local server such as Ollama or LM Studio.</>,
  },
  {
    shape: "squircle",
    color: "blue",
    title: "The library",
    link: "/docs/explanation/bots-and-chats/#the-library",
    body: <>One copy of every file the chats hold: images and text files you send, and documents bots save. Search it across every bot, or open one bot's files beside its chat.</>,
  },
  {
    shape: "egg",
    color: "teal",
    title: "An installable app",
    link: "/docs/tutorials/first-fxbot/#reach-it-from-your-phone",
    body: <>Open fxbot on a phone or a desktop and install it. It opens offline, makes room for the notch and the keyboard, and offers Reload when a new build lands.</>,
  },
  {
    shape: "flower",
    color: "purple",
    title: "Add-ons",
    link: "/docs/explanation/core-and-add-ons/",
    body: <>Skills from fxbot's picks or skills.sh, which bots read when a task needs them. Remote MCP servers from GitHub's registry or by address, with only the tools you allow. Each goes to all bots or the ones you choose, and costs nothing until you add it.</>,
  },
  {
    shape: "hexagon",
    color: "green",
    title: "Releases and updates",
    link: "/docs/explanation/releases/",
    body: (
      <>
        <code>setup.sh</code> installs a tagged release. When the next one is out, Settings shows its notes and an Update button. The database moves forward, with a backup first.
      </>
    ),
  },
];

const steps: { title: string; command?: string; body: ReactNode }[] = [
  { title: "Install it", command: installCommand, body: <>On Debian or Ubuntu. It installs Postgres, Node if the machine needs it, and fxbot as a service on 127.0.0.1:8787.</> },
  {
    title: "Open it",
    command: "sudo tailscale serve --bg 8787",
    body: (
      <>
        On the machine, it is at <code>http://127.0.0.1:8787</code>. For your other devices, Tailscale is the recommended way in: this command puts it at <code>https://&lt;machine&gt;.&lt;tailnet&gt;.ts.net</code>.
      </>
    ),
  },
  { title: "Install the app", body: <>Open fxbot on each device. Install it from Settings in Chrome or Edge, or with Share, then Add to Home Screen, on an iPhone.</> },
  { title: "Add a provider and a bot", body: <>In Settings, sign in to an account, add a key, or point at a local model server. Then make a bot and start a chat.</> },
];

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-pretty text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Home() {
  return (
    <Shell>
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20">
          <div className="crowd flex max-w-xl items-end gap-2 sm:gap-3">
            {crowd.map((blob) => (
              <Blob key={blob.shape} {...blob} follow={!blob.busy} />
            ))}
          </div>
          <h1 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Your bots, on your own machine.</h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
            fxbot is a small web app for long-running chats with bot profiles. One Node server and Postgres run on a machine you own. Open it on that machine, or from your phone and other devices, over Tailscale or a way of your own.
          </p>
          <div className="mt-8 max-w-2xl">
            <Command>{installCommand}</Command>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {latest.version && (
              <>
                <a className="underline-offset-4 hover:text-foreground hover:underline" href={href(changelogPath)}>
                  v{latest.version}
                </a>
                {" · "}
              </>
            )}
            Debian and Ubuntu · Apache-2.0
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href={href("/docs/")} className={cn(buttonVariants({ size: "lg" }), "px-4")}>
              Read the docs
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </a>
            <a href={repo} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}>
              Source on GitHub
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
          <figure>
            <div className="overflow-hidden rounded-xl border bg-card shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)]">
              <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
                <span aria-hidden="true" className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                </span>
                <span className="mx-auto truncate rounded-md bg-background px-3 py-0.5 font-mono text-xs text-muted-foreground">https://bot.&lt;tailnet&gt;.ts.net</span>
                <span aria-hidden="true" className="w-[42px]" />
              </div>
              <img src={screenshot} width={2530} height={1700} alt="fxbot in a desktop browser: Bob's chat open, with Fernando and Securely in the sidebar" className="block h-auto w-full" />
            </div>
            <figcaption className="mt-3 text-sm text-muted-foreground">Bob's chat in a desktop browser, with Fernando and Securely in the sidebar.</figcaption>
          </figure>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-20 sm:px-6 sm:pt-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          <div>
            <SectionTitle eyebrow="Who it's for" title="People who run their own machine" />
            <div className="mt-5 grid max-w-2xl gap-4 text-pretty text-muted-foreground">
              <p>
                fxbot is for one person with a machine of their own: a home server, a small VPS, or the computer under the desk. It listens on loopback and has no login of its own, so whatever you put in front of it decides who reaches it, and everyone who does sees every bot and every chat. <a className="text-foreground underline underline-offset-4" href="https://tailscale.com">Tailscale</a> is the recommended way in from other devices.
              </p>
              <p>There is no hosted version and no account to make. Bots, chats, files, and keys are stored on your machine. Each message goes to the provider its bot uses, or stays on your network with a local model server.</p>
            </div>
          </div>
          <dl className="grid content-start gap-px overflow-hidden rounded-xl border bg-border text-sm">
            {[
              ["Machine", "Debian or Ubuntu, with systemd"],
              ["Runtime", "Node 22.18 or newer, which setup.sh installs when it is missing"],
              ["Records", "Postgres, with every key and token sealed"],
              ["Agents", "libfx, one agent per provider"],
              ["Network", "127.0.0.1:8787; from other devices, Tailscale (recommended) or a proxy of your own"],
            ].map(([term, detail]) => (
              <div key={term} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 bg-background px-4 py-3">
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28">
          <SectionTitle eyebrow="What it does" title="Bots you keep talking to">
            Each bot is a profile with one long-running chat. The core stays small, and the rest comes as add-ons you pick. All of this ships in the current release.
          </SectionTitle>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="bg-background">
                <a href={href(feature.link)} className="group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-muted/40">
                  <Blob shape={feature.shape} color={feature.color} size={40} follow />
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    {feature.title}
                    <ArrowRight aria-hidden="true" className="size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-60" />
                  </h3>
                  <p className="text-sm leading-6 text-pretty text-muted-foreground">{feature.body}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <SectionTitle eyebrow="Get started" title="From a fresh machine to a chat" />
          <ol className="mt-10 grid gap-4 lg:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.title} className="flex min-w-0 gap-4 rounded-xl border p-5">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {i + 1}
                </span>
                <div className="grid min-w-0 flex-1 grid-cols-1 content-start gap-3">
                  <h3 className="font-semibold">{step.title}</h3>
                  {step.command && <Command>{step.command}</Command>}
                  <p className="text-sm leading-6 text-pretty text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-2">
            <a href={href("/docs/tutorials/first-fxbot/")} className={cn(buttonVariants({ size: "lg" }), "px-4")}>
              The tutorial: your first fxbot
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </a>
            <a href={href("/docs/")} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}>
              All the docs
            </a>
          </div>
        </section>
      </main>
    </Shell>
  );
}
