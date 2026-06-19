# LineRage

LineRage is an old-school browser line-racing game. This branch adds PeerJS-based online multiplayer via join links.

## Development with Nix

Enter a reproducible shell with Java, zip, Python, Node.js, Chromium, and Nix formatting tools:

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

## Legacy build command

If you are already inside a shell with `java` and `zip` available, the old build script still works:

```sh
mkdir -p build
(cd util && ./build.sh)
```
