# LineRage

LineRage is an old-school browser line-racing game. It includes PeerJS-based online multiplayer via join links.

## Development with Nix

Enter a reproducible shell with Python, Node.js, Chromium, and Nix formatting tools:

```sh
nix develop
```

Serve the editable development tree from `static/`:

```sh
nix run .#serve-dev
# or choose a port
nix run .#serve-dev -- 8080
```

Build the packaged site:

```sh
nix build
```

The build output contains the static site at `result/share/linerage/`.

Serve the Nix-built package:

```sh
nix run .#serve-built
# or choose a port
nix run .#serve-built -- 8080
```

Run flake checks, including the multiplayer TURN configuration and Worker tests:

```sh
nix flake check
```

## WebRTC relay

Online games fetch short-lived Cloudflare Realtime TURN credentials from:

```text
https://linerage-turn-credentials.tide-shazow.workers.dev/ice
```

The credential Worker lives in `cloudflare-worker/`. Its `TURN_KEY_ID` and
`TURN_KEY_SECRET` values are Cloudflare Worker secrets and must never be
committed. Deploy or update it with a Cloudflare token scoped to Workers
Scripts Write:

```sh
cd cloudflare-worker
wrangler secret put TURN_KEY_ID
wrangler secret put TURN_KEY_SECRET
wrangler deploy
```

The `/ice` endpoint only serves browser requests from the deployed LineRage
GitHub Pages origin and local development origins. Verify the actual relay path,
not only direct peer connectivity, by gathering candidates with
`iceTransportPolicy: "relay"`; the result must include at least one `relay`
candidate.

## Browser smoke screenshots

Generate repeatable browser evidence for visual PRs against the Nix-built site:

```sh
nix run .#browser-smoke
# or choose an artifact directory
nix run .#browser-smoke -- artifacts/my-change
```

The smoke test opens the built game in Chromium at desktop and mobile viewports, fails on browser console errors, horizontal overflow, or missing touch controls, and writes:

```text
artifacts/browser-smoke/
  desktop.png
  mobile.png
  metrics.json
  console.json
```

Include the screenshots in PRs that change visible UI.
