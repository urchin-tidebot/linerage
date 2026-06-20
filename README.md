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

Run flake checks:

```sh
nix flake check
```
