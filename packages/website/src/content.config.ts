import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// Every page under src/content/docs/: the docs in docs/, the SDK's in sdk/ (src/sidebar.ts). `pageActions: false`
// leaves out Copy Markdown and the rest, for a page with no Markdown of its own, such as the plugin directory's.
export const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: z.object({ pageActions: z.boolean().optional() }) }) }) };
