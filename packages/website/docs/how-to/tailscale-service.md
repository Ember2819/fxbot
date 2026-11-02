# Serve fxbot at its own tailnet name

Give fxbot a name of its own, such as `bot.<tailnet>.ts.net`, as a [Tailscale Service](https://tailscale.com/kb/1552/tailscale-services), instead of the machine's address. The machine must be tagged.

A tailnet admin does three things once:

1. **Define the service** on the admin console's Services page: **Define a Service**, named `bot`, with the port `tcp:443`.
2. **Approve this machine** as its host on that service's page, or with an `autoApprovers` rule for the machine's tag.
3. **Grant access** in the policy file, such as:

   ```json
   { "src": ["autogroup:member"], "dst": ["svc:bot"], "ip": ["443"] }
   ```

Then, on the machine:

```sh
sudo tailscale serve --service=svc:bot --https=443 http://127.0.0.1:8787
```

Check the address from a phone or a laptop on the tailnet, not from the machine itself: a grant to people doesn't cover a tagged machine, so the name may not resolve there.

An app installed from the machine's address stays on that address. To move to the new name, open it there and install the app again.
