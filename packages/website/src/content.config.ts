import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

// Every page under src/content/docs/: the docs in docs/, the SDK's in sdk/ (src/sidebar.ts).
export const collections = { docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }) };
