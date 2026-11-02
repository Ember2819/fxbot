# Add an MCP server

Give your bots the tools of a remote MCP server, found in fxbot's list or GitHub's MCP registry, or added by its address.

## From search

1. Open **Add-ons**, the puzzle button at the bottom of the sidebar, and choose the **MCP** tab.
2. Type in the search above the tabs. Results tagged **fxbot** are the project's own picks; the rest come from fxbot's copy of GitHub's MCP registry, which it refreshes every hour.
3. Choose a result to open its page. fxbot looks at the server and shows where it runs, how it signs in, the keys it needs, and who published it.
4. For a server that needs a key, paste it into the field the page names.
5. Choose the **Add** button, which names the server. fxbot shows it under **Installed**.
6. For a server that signs in with OAuth, choose **Sign in** and approve fxbot on the page that opens.
7. Choose the pencil button on its row. Under **Bots**, keep **All bots**, or choose **Choose** and switch it on for each bot that should have it.
8. Under **Tools**, allow the ones bots may call. Only the read-only tools are allowed at first.

## By its address

For a server the registry doesn't list. Its docs give the address, often ending in `/mcp`.

1. On the **MCP** tab, choose **Add by address**.
2. Paste the address and choose **Look**. fxbot shows the server's name, and either its tools, **Takes a key**, or **Signs in with OAuth**.
3. For a server that takes a key, paste it. It is sent as `Authorization: Bearer`; for another header, write it as `Name: value`.
4. Choose the **Add** button, then follow steps 6 to 8 above.

A bot's **Edit** page lists the servers too, under **Add-ons**.

## When it goes differently

- **The search doesn't find it.** Tick **Search everything** to look in the official MCP registry as well. Nobody reviews its entries, so check who published one before you add it.
- **The page warns that the server isn't on the publisher's domain.** The registry checks who published an entry, not where its server runs. Add it only if you trust that host.
- **The page says it runs on this machine.** That server is a program, not a remote server, and fxbot can't add it yet.
- **The address is local or private.** fxbot refuses it unless you tick **Allow a local address**. Tick it only for a server you run: it can then reach this machine and your private network.
- **The sign-in page doesn't come back.** fxbot comes back to its own address when you use it at an HTTPS address, such as your tailnet's. Elsewhere, the page the sign-in sends you to may not load: copy its address from the browser, and paste it into fxbot.
- **The server signs in with OAuth, but you have a key.** When adding by address, choose **Use a key instead** before adding it.

## Update a server

A server added from the registry says **Update available** on its row when the registry has a newer version. Open it with the pencil button and choose **Update to**: fxbot shows what the new version changes, and moves to it only when you choose **Update**. A row may also say **Deprecated** or **Removed from the registry**; the server keeps working as added.

Why only read-only tools to start: see [Security model](/docs/explanation/security/#mcp-servers).
