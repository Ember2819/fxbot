import { createClient } from "@fxbot/sdk/client";
import { serverVersion } from "./pwa.ts";

// The page's own origin. The page holds no secrets: the model key stays on the server. A server on another version
// than the page's build sends the page looking for that build.
export const client = createClient({ onVersion: (version) => void serverVersion(version) });
