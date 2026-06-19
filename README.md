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

Build the packaged site and zip artifact:

```sh
nix build
```

The build output contains:

- `result/share/linerage/` — static site
- `result/linerage.zip` — zipped packaged site

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

## Build command

If you are already inside a shell with `python3` available, the build script can be run directly:

```sh
mkdir -p build
(cd util && ./build.sh)
```
