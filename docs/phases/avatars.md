# Avatars

A bot today is a flat shape with two white eyes, and the owner's word for that is "straight up clones of grokbot". This phase gives each bot a face of its own, and makes picking one a pleasure:
- **Big, dark eyes with a glint,** the two pills from fxbot's logo, which carry every feeling.
- **Soft color,** the way plugin icons are soft, in the same eleven color names.
- **More shapes:** the fourteen a bot can have now, and eighteen more, such as toast, cat, frog, and ghost.
- **Things to wear,** on the head, the face, and the body, cut to the bot's own outline so they sit right on all of them.
- **A feeling,** picked by the owner, and motion that means something: a bot works, waits, finishes, and sleeps where you can see it.
- **A new bot screen to match,** in the brand: quiet, black and white, with the bot as the only color on it.

Status: planned 2026-11-07, for 0.7.0, from five rounds of design the owner chose from, at the design canvas linked in [the owner's words](#what-the-owner-asked). Researched against the research directive's references.

## What the owner asked

"I want to change our bot avatars up. Right now they are straight up clones of grokbot and I want to change that up a bit and also change up a bit of color/bot selection." Then, "we want them to feel like cute coworkers", thinking "flat and 3d, accessories, personality". Round 3 "doesn't fit our brand at all". Round 4 was "much better", though the things they wear "don't sit right on things or look cheap", and "our current avatars have a lot of emotion in their eyes and how they interact and follow". Of Round 5: "This looks much better, do this. Make sure the new bot experience lines up", and "works for our brand".

Round 5 is the design this builds: eyes, shapes, clothes, motion, and the picker.

## 0. Core or plugin

**Core.** A bot's look is part of the bot, stored on its row, and drawn wherever the app and plugins show one: the sidebar, the chat, rooms, pills, cards. There is nothing to add or leave out: a plugin can't change the row, and every bot has a look. `Blob` is already what plugins get for it, so this widens what's there. Plugins pass a whole bot to it, so what they show keeps up by itself.

The one addition to what plugins plug into is `waiting` on a profile, from the `{ wait }` a `tool.before` hook already answers.

## 1. Research

The owner named Muse, Duet, OpenAI's dots, and Grok Bot. Checked in the design rounds, and read again for this plan:

- **Grok Bot** ([docs](https://docs.x.ai/grok-bot/overview)) is what fxbot's look came from: flat color, a soft shape, two white eyes. Its users ask for states such as idle, thinking, working, waiting, and done, so a look that says what a bot is doing is wanted.
- **OpenAI's dots**, as press describes them: "a triangle with a bow tie, a bunny with headphones, a cloud with a beret". What a character wears carries its personality.
- **[OpenDots](https://github.com/CopilotKit/OpenDots)** draws soft rendered bodies with stubby arms, and a small face set low. Rendered art is out of reach of hand-written vectors, and it's a picture, so it can't look at you.
- **[OpenMuse](https://github.com/CopilotKit/openmuse) and [OpenDuet](https://github.com/CopilotKit/OpenDuet)** use a capybara and a glowing orb. Nothing public shows the real products' designs, so they were hints and no more.
- **fxbot's brand** matters more than any of these. The product is black and white: Geist, hairline borders, generous space, and a logo of a black circle with two white pills. Its only color comes from bots, and plugin icons, which are soft gradients on pale tiles.
- **fxbot's avatars today.** Measured in Round 5: eyes a quarter of the body's height, at its center, with no mouth. All the feeling is in the eyes, and in how they follow, lean, blink, and hop. Round 4 cut the eyes to a quarter of that area and stopped the motion, and the owner felt it at once: "too small of facial features".

## 2. Key takeaways

- **The eyes are the character, and they're the logo.** Keep them big and central, the two pills, dark on soft color, with a small glint. Dark eyes on soft bodies is what stops this reading as Grok Bot. White pills on flat color is what it looks like now.
- **Color is the bot.** Everything on a bot is its own color or black and white. What it wears takes a deep shade of its own color by default: it reads as part of the character, and shows on a dark page, where black doesn't.
- **What's worn is cut to the body,** not laid on it. A hat that's drawn on top sits wrong on a heart. A hat that's the top of the body, painted, with a little overhang, fits anything.
- **Motion that means something.** A hop means working. A look says a bot is waiting. Motion costs battery, so it runs only when it says something.
- **Small sizes are drawn again,** like a good typeface: bolder eyes and no fine lines at 28 pixels and under.

## 3. Implementation

### A look

`shape` and `color` keep their names, so nothing about a bot changes by itself. Five columns join them, each with a default that draws nothing new, so a bot from before this phase keeps its shape and takes the new drawing of it.

| Field | Values | Default |
|---|---|---|
| `shape` | The fourteen, then `mochi`, `gumdrop`, `toast`, `arch`, `pill`, `drop`, `peanut`, `puff`, `mushroom`, `bear`, `cat`, `mouse`, `bunny`, `frog`, `imp`, `bot`, `ghost`, `sprout` | `circle` |
| `color` | The same eleven | `brown` |
| `mood` | `bright`, `happy`, `calm`, `focus`, `doubt`, `wow`, `shy`, `wink` | `bright` |
| `head` | `none`, `headphones`, `beanie`, `cap`, `beret`, `headband`, `swoop` | `none` |
| `face` | `none`, `glasses`, `shades`, `mustache` | `none` |
| `outfit` | `none`, `blazer`, `turtleneck`, `hoodie`, `scarf`, `bowtie`, `badge` | `none` |
| `tint` | `own`, `black`, `white`: what they wear is dyed | `own` |

They're plain columns, as `shape` and `color` are, checked in `fields()` against lists in `types.ts`. Migration `0012_looks` adds them.

### Drawing

Two new files in `packages/ui/src`, both plain data and math with no React and no SDK import, so the site keeps a copy as it does for plugin icons:

- `blob-draw.ts`: the eyes, and what's worn. One eye is one outline from a few numbers, so a mood is only numbers, and any mood melts into any other. What's worn is measured from the shape's own outline.
- `blob-data.ts`, generated by `scripts/blob-data.mjs`: each shape's points, where its face sits, and each color's tones. A table replaces the math that builds fourteen shapes on every page load.

`Blob` draws its SVG from these as a string and sets it once, which is the same drawing for the app and the site's build. Every value in it comes from a list or a number: none of it is a bot's name or anything typed.

The Soft and Flat switch of Round 5 isn't built: Soft is the look, and small sizes are already redrawn.

### Motion

`blob.tsx` keeps the job it has, with one loop for every bot on the page:

| What's true | What the bot does |
|---|---|
| Nothing | Its feeling, a blink now and then, and a glance around, sometimes at another bot |
| `follow` | Its eyes and lean follow the pointer, and what it wears shifts a little less, so its head seems to turn |
| `busy` | Focused eyes, a hop, and a look around, as now |
| `waiting` | It looks at you and bobs |
| A turn just ended | Happy eyes for a few seconds |
| `provider` is empty | Asleep, since it can't answer, breathing slowly |
| Clicked | A squish and a smile |

The loop runs only while something moves. Between blinks it's one timer for the page, and a bot at rest writes nothing, so a page of idle bots costs about what it does today. The site's CSS blink and hop stay for the site. With reduced motion on, a bot holds still, with the face its state calls for.

`waiting` is true while a `tool.before` hook's `{ wait }` holds a call, counted in `wrap()` and read in `withBusy`. It covers a card waiting on the owner, and a reviewer model. The list is read again every 2 seconds while a bot is busy, so it costs no new request.

### The new bot screen

`LookPicker` moves to `look-picker.tsx`, with tabs for **Shape**, **Color**, **Feeling**, **Head**, **Face**, and **Body**, each option drawn on the owner's actual bot, and **Clothes** for the tint while a tab of things to wear is open. **Surprise me** picks a look. `BotForm` shows the bot large beside them on a wide screen, and above them on a phone, watching as you choose. The dialog widens to fit, and it's the same form in first-run setup and on a bot's edit page. Tokens only, so it holds in dark mode: the bot is the only color on the screen.

### Plugins

Plugins pass a whole bot, `<ui.Blob {...bot} size={20} />`, in chat rooms, messages, permissions, and pages, and bump a patch version. An older fxbot ignores what it doesn't know, so `minFxbot` stays. The `look` prop, which pointed the eyes in the old picker and was never in the docs, goes.

### The site

`packages/website/src/blob.tsx` draws from the copied files at build time. The home page's crowd becomes the team from Round 5.

### Cost

- **Page:** about 25 KB of shape points, 11 KB gzipped, in a bundle of 1.1 MB, less the geometry code it replaces. No new request or dependency, and no work at load to build shapes.
- **Message path:** nothing. `waiting` is two more lines in a list the app already reads.
- **Idle:** one timer, and a few frames for each blink.

### Not in this phase

- Rendered 3D. It would need an illustrator or an image model, and a picture can't follow you.
- Arms, feet, and things a bot carries.
- A bot choosing its own look.
- A `waiting` that tells a reviewer model from the owner.

Size: about 60 lines of SDK and migration, 330 of UI, 150 of generator, 40 of site, 15 in plugins, and 40 of docs. The generated table isn't counted.

## 4. Checklist

Checks use the harness the last phases used: a disposable Postgres, a check server on another port, the mock model, and Playwright at desktop and phone sizes. Writes to `/api/settings` are blocked on anything but a disposable database. Print a check's setup, and match exact fields: one that tested nothing can't pass.

**Bounded goals**
- **Size:** at most 700 hand-written lines, without the generated table and each plugin's `page.js`.
- **Out of scope:** [Not in this phase](#not-in-this-phase).
- **If it must be cut,** the site's crowd goes first, then the glance at other bots. The eyes, shapes, clothes, motion, and new bot screen stay.

**M1. The record**
- [ ] A new install and an upgraded database both have the columns, and a bot from before keeps its shape and color, with the defaults.
- [ ] Each field is saved, read back, and refused with 400 when it's not on its list.
- [ ] `waiting` is true while a hook's `wait` holds a call, and false once it ends, or the turn stops.

**M2. The drawing**
- [ ] Every shape, in every color, draws, and all 15 things to wear are looked at on all 32 shapes.
- [ ] A saved bot from before this phase draws with no error, and an unknown value falls back and doesn't throw.
- [ ] 16, 24, 40, 64, and 112 pixels hold up, in light and dark.

**M3. Motion**
- [ ] Eyes follow the pointer where `follow` is on, and a bot leans.
- [ ] Each row of the motion table works from its real signal: a real turn, a real card, a turn's end, a bot with no provider.
- [ ] A page of idle bots asks for no frames between blinks.
- [ ] Reduced motion holds still, and shows the state.

**M4. The new bot screen**
- [ ] A bot made in the dialog keeps everything picked, and so does an edit.
- [ ] First-run setup's bot step works, at desktop and phone sizes.
- [ ] Tabs work from the keyboard, and each option has a name.
- [ ] It holds at 390 pixels wide with no sideways scroll, and in dark mode.

**M5. Everywhere a bot shows**
- [ ] The sidebar, the chat, library, plugin pages, and rooms show the whole look.
- [ ] An older copy of a plugin, passing only `shape` and `color`, still draws.
- [ ] The site builds, its crowd moves, and its links pass.

**M6. Wrap up**
- [ ] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [ ] The full regression from the last phases still passes.
- [ ] Docs, changelog, and each plugin's version are updated, and this plan moves to `_completed`.

## 5. Open questions

Three were put to the owner with Round 5, and "do this" took Round 5 as it stood, so:
- **Soft or Flat:** Soft, the look it shipped in. Flat isn't built.
- **One thing to wear, or head, face, and body:** all three, as in the picker.
- **Black or the bot's own color for clothes:** its own color by default, and **Clothes** offers black and white.
