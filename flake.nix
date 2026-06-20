{
  description = "LineRage browser game development and build environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = fn:
        nixpkgs.lib.genAttrs systems (system:
          fn (import nixpkgs {
            inherit system;
          }));
    in
    {
      packages = forAllSystems (pkgs:
        let
          linerage = pkgs.stdenvNoCC.mkDerivation {
            pname = "linerage";
            version = "0-unstable";
            src = pkgs.lib.cleanSource ./.;

            buildPhase = ''
              runHook preBuild
              buildPath=build/linerage
              staticPath=static

              rm -rf "$buildPath"
              mkdir -p "$buildPath/js" "$buildPath/css" "$buildPath/levels" "$buildPath/images"

              cp -R "$staticPath/js/extern" "$buildPath/js/extern"
              cp "$staticPath/built.html" "$buildPath/index.html"
              cp "$staticPath/manifest.json" "$buildPath/manifest.json"
              cp -R "$staticPath/css/." "$buildPath/css/"
              cp -R "$staticPath/images/." "$buildPath/images/"
              cp -R "$staticPath/levels/." "$buildPath/levels/"
              mv "$buildPath"/images/icon*.png "$buildPath"/

              cat \
                "$staticPath/js/lib/Class.js" \
                "$staticPath/js/lib/Dom.js" \
                "$staticPath/js/lib/Util.js" \
                "$staticPath/js/lib/Clock.js" \
                "$staticPath/js/lib/Collision.js" \
                "$staticPath/js/core/Input.js" \
                "$staticPath/js/core/Player.js" \
                "$staticPath/js/core/Entity.js" \
                "$staticPath/js/core/Level.js" \
                "$staticPath/js/core/Hud.js" \
                "$staticPath/js/core/Game.js" \
                "$staticPath/js/core/Multiplayer.js" \
                "$staticPath/js/core/TouchControls.js" \
                "$staticPath/js/core/Init.js" \
                > "$buildPath/js/all.js"
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out/share
              cp -r build/linerage $out/share/linerage
              runHook postInstall
            '';
          };
        in
        {
          default = linerage;
          inherit linerage;
        });

      apps = forAllSystems (pkgs:
        let
          browserPython = pkgs.python3.withPackages (python-pkgs: [
            python-pkgs.playwright
          ]);

          serve-dev = pkgs.writeShellApplication {
            name = "linerage-serve-dev";
            runtimeInputs = [ pkgs.python3 ];
            text = ''
              port="''${1:-8000}"
              echo "Serving LineRage dev tree at http://127.0.0.1:$port"
              exec python3 -m http.server "$port" --directory static
            '';
          };

          serve-built = pkgs.writeShellApplication {
            name = "linerage-serve-built";
            runtimeInputs = [ pkgs.python3 ];
            text = ''
              port="''${1:-8000}"
              site="${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/share/linerage"
              echo "Serving built LineRage at http://127.0.0.1:$port"
              exec python3 -m http.server "$port" --directory "$site"
            '';
          };

          browser-smoke = pkgs.writeShellApplication {
            name = "linerage-browser-smoke";
            runtimeInputs = [
              browserPython
              pkgs.chromium
            ];
            text = ''
              site="${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/share/linerage"
              out="''${1:-artifacts/browser-smoke}"
              exec python ${./scripts/browser-smoke.py} \
                --site "$site" \
                --out "$out" \
                --chromium ${pkgs.chromium}/bin/chromium
            '';
          };
        in
        {
          default = {
            type = "app";
            program = "${serve-dev}/bin/linerage-serve-dev";
            meta.description = "Serve LineRage's editable static development tree";
          };
          serve-dev = {
            type = "app";
            program = "${serve-dev}/bin/linerage-serve-dev";
            meta.description = "Serve LineRage's editable static development tree";
          };
          serve-built = {
            type = "app";
            program = "${serve-built}/bin/linerage-serve-built";
            meta.description = "Serve the Nix-built LineRage package";
          };
          browser-smoke = {
            type = "app";
            program = "${browser-smoke}/bin/linerage-browser-smoke";
            meta.description = "Run browser smoke tests and save screenshots/metrics";
          };
        });

      devShells = forAllSystems (pkgs:
        let
          browserPython = pkgs.python3.withPackages (python-pkgs: [
            python-pkgs.playwright
          ]);
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.python3
              browserPython
              pkgs.nodejs
              pkgs.chromium
              pkgs.nixpkgs-fmt
            ];

            shellHook = ''
              echo "LineRage dev shell"
              echo "  nix run .#serve-dev -- [port]       # serve ./static"
              echo "  nix build                           # bundle JS and build packaged site"
              echo "  nix run .#serve-built -- [port]     # serve the Nix-built package"
              echo "  nix run .#browser-smoke -- [outdir] # screenshots, console, metrics"
            '';
          };
        });

      checks = forAllSystems (pkgs: {
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      });

      formatter = forAllSystems (pkgs: pkgs.nixpkgs-fmt);
    };
}
