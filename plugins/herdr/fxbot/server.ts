import { connect } from "node:net";
import { homedir } from "node:os";
import type { PluginApi } from "@fxbot/sdk";

// herdr's agents for bots: two read-only tools that ask herdr's socket, which takes one JSON request per line and
// answers each with its id (herdr's socket API, protocol 22).

type Agent = { pane_id: string; agent?: string | null; name?: string | null; display_agent?: string | null; agent_status: string; cwd?: string | null; focused?: boolean };

export default function setup(fx: PluginApi) {
  const path = () => (fx.settings.socket || "~/.config/herdr/herdr.sock").replace(/^~(?=\/|$)/, homedir());

  // One request on a new connection, answered within 5 seconds.
  function ask(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = `fxbot_${Date.now().toString(36)}`;
    const at = path();
    return new Promise((resolve, reject) => {
      const socket = connect(at);
      let rest = "";
      const done = (error?: Error, result?: Record<string, unknown>) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result!);
      };
      const timer = setTimeout(() => done(new Error(`herdr's socket at ${at} didn't answer in 5 seconds.`)), 5000);
      socket.on("connect", () => socket.write(`${JSON.stringify({ id, method, params })}\n`));
      socket.on("data", (chunk) => {
        const lines = (rest + chunk.toString("utf8")).split("\n");
        rest = lines.pop()!;
        for (const line of lines) {
          const answer = JSON.parse(line) as { id?: string; result?: Record<string, unknown>; error?: { code: string; message: string } };
          if (answer.id !== id) continue;
          if (answer.error) done(new Error(`herdr: ${answer.error.message}`));
          else done(undefined, answer.result ?? {});
        }
      });
      socket.on("error", (error: NodeJS.ErrnoException) => {
        const why =
          error.code === "ENOENT" || error.code === "ECONNREFUSED"
            ? `Nothing answers at ${at}. Is herdr running, and does the herdr plugin's socket setting name its socket?`
            : error.code === "EACCES"
              ? `fxbot may not use the socket at ${at}. The herdr plugin's README shows how to let it.`
              : `herdr's socket at ${at}: ${error.message}`;
        done(new Error(why));
      });
    });
  }

  fx.tool({
    name: "list_agents",
    description: "List the coding agents herdr runs: each one's pane id, which agent it is, its status (working, blocked, done, idle, or unknown), and its folder.",
    inputSchema: { type: "object", properties: {} },
    idempotent: true,
    async execute() {
      const { agents = [] } = (await ask("agent.list", {})) as { agents?: Agent[] };
      return JSON.stringify(
        agents.map((a) => ({ pane: a.pane_id, agent: a.display_agent ?? a.agent ?? a.name ?? "", status: a.agent_status, folder: a.cwd ?? "", ...(a.focused ? { focused: true } : {}) })),
      );
    },
  });

  fx.tool({
    name: "read_pane",
    description: "Read what a herdr pane shows: its recent lines, as text. Get pane ids from herdr_list_agents.",
    inputSchema: {
      type: "object",
      properties: {
        pane: { type: "string", description: "A pane id, such as w1:p1" },
        lines: { type: "integer", minimum: 1, maximum: 400, description: "How many recent lines. Default 80" },
      },
      required: ["pane"],
    },
    idempotent: true,
    async execute(input: { pane?: unknown; lines?: unknown }) {
      if (typeof input.pane !== "string" || !input.pane.trim()) return "Give a pane id from herdr_list_agents.";
      const lines = Math.min(400, Math.max(1, Math.trunc(Number(input.lines) || 80)));
      const { read } = (await ask("pane.read", { pane_id: input.pane.trim(), source: "recent", lines, format: "text", strip_ansi: true })) as { read?: { text: string; truncated: boolean } };
      if (!read) return "herdr gave no text for that pane.";
      return read.truncated ? `${read.text}\n(Earlier lines left out.)` : read.text;
    },
  });
}
