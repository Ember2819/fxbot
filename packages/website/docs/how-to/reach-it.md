# Reach fxbot from other devices

fxbot listens on 127.0.0.1:8787 and has no login of its own. This guide shows the ways to open it, from the simplest to the most work.

## On the machine itself

Open `http://127.0.0.1:8787` in a browser on that machine. Everything works there, installing the app included, and nothing else can reach it.

## With Tailscale (recommended)

[Tailscale](https://tailscale.com) gives fxbot an HTTPS address that only your own devices reach. On the machine, with Tailscale running and [HTTPS turned on](https://tailscale.com/kb/1153/enabling-https) for your tailnet:

```sh
sudo tailscale serve --bg 8787
```

fxbot is then at `https://<machine>.<tailnet>.ts.net` on every device in your tailnet. To give it a name of its own, such as `bot.<tailnet>.ts.net`, see [Serve it at its own name](/docs/how-to/tailscale-service/).

## Through a proxy or VPN of your own

Anything else in front of fxbot works if it:

- **adds its own login or access control.** Whoever reaches fxbot can use all of it: every bot, chat, and provider.
- **serves HTTPS.** Phones install the app only from an HTTPS address, and an MCP server's sign-in comes back to fxbot by itself only over HTTPS.
- **passes the `Host` header through unchanged,** such as nginx's `proxy_set_header Host $host`. fxbot refuses a write whose page origin doesn't match the host it was reached at.
- **doesn't buffer responses,** such as nginx's `proxy_buffering off`, and lets them run long: each chat streams its replies.

Point the proxy at `http://127.0.0.1:8787` on the same machine.

## Never

- Open port 8787 to a network directly, or forward it from a router.
- Share fxbot publicly, such as with [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), without a login in front of it.

The [security model](/docs/explanation/security/) explains why fxbot leaves this to what you put in front of it.
