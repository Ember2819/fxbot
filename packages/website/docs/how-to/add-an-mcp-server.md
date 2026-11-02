# Add an MCP server

Give your bots the tools of a remote MCP server. You need the server's address, which its docs give, often ending in `/mcp`.

1. Open **Add-ons**, the puzzle button at the bottom of the sidebar, and choose **Add a server**.
2. Paste the address and choose **Look**. fxbot shows the server's name, and either its tools, **Takes a key**, or **Signs in with OAuth**.
3. For a server that takes a key, paste it. It is sent as `Authorization: Bearer`; for another header, write it as `Name: value`.
4. Choose the **Add** button, which names the server.
5. For a server that signs in with OAuth, choose **Sign in** and approve fxbot on the page that opens.
6. Under **Bots**, keep **All bots**, or choose **Choose** and switch it on for each bot that should have it.
7. Under **Tools**, allow the ones bots may call. Only the read-only tools are allowed at first.

A bot's **Edit** page lists the servers too, under **Add-ons**.

## When it goes differently

- **The address is local or private.** fxbot refuses it unless you tick **Allow a local address**. Tick it only for a server you run: it can then reach this machine and your private network.
- **The sign-in page doesn't come back.** fxbot comes back to its own address when you use it at an HTTPS address, such as your tailnet's. Elsewhere, the page the sign-in sends you to may not load: copy its address from the browser, and paste it into fxbot.
- **The server signs in with OAuth, but you have a key.** Choose **Use a key instead** before adding it.

Why only read-only tools to start: see [Security model](/docs/explanation/security/#mcp-servers).
