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

            nativeBuildInputs = [
              pkgs.jdk
              pkgs.zip
            ];

            buildPhase = ''
              runHook preBuild
              mkdir -p build
              (cd util && sh ./build.sh)
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out/share $out/nix-support
              cp -r build/linerage $out/share/linerage
              cp build/linerage.zip $out/linerage.zip
              cat > $out/nix-support/hydra-build-products <<EOF
              file zip $out/linerage.zip
              EOF
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
        });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.jdk
            pkgs.zip
            pkgs.python3
            pkgs.nodejs
            pkgs.chromium
            pkgs.nixpkgs-fmt
          ];

          shellHook = ''
            echo "LineRage dev shell"
            echo "  nix run .#serve-dev -- [port]    # serve ./static"
            echo "  nix build                        # build packaged site + linerage.zip"
            echo "  nix run .#serve-built -- [port]  # serve the Nix-built package"
          '';
        };
      });

      checks = forAllSystems (pkgs: {
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      });

      formatter = forAllSystems (pkgs: pkgs.nixpkgs-fmt);
    };
}
