---
name: herdr
description: Look at the coding agents running in herdr, the terminal workspace for agents. Use it when the owner asks what their agents are doing, which are working, blocked, or done, or what an agent's pane shows.
---

# herdr

herdr runs coding agents, each in a pane. Two tools look at them. Neither changes anything.

1. Call `herdr_list_agents` first. Each agent has a pane id, the agent it runs, its status, and its folder.
   - `working`: it's busy.
   - `blocked`: it waits for the owner, often for an approval. Say so first.
   - `done`: it finished, and its pane shows the result.
   - `idle` or `unknown`: nothing is happening, or herdr can't tell.
2. To see what an agent shows, call `herdr_read_pane` with its pane id. It gives the pane's recent lines, 80 unless you ask for more, up to 400.

Answer with what the owner asked: which agents need them, and what each one is doing, in a few words each. Quote a pane only as much as the answer needs.

If a tool says it can't reach herdr's socket, herdr isn't running, or fxbot can't reach it. Tell the owner, and point them to the herdr plugin's settings.
