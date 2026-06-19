#!/bin/sh
set -e

if [ ! -d ../build ]; then
    echo "build dir doesn't exist. aborting."
    exit 1
fi

BUILD_PATH=../build/linerage
WORKING_PATH=../static
JS_OUTPUT=$BUILD_PATH/js/all.js

rm -rf "$BUILD_PATH"
mkdir -p "$BUILD_PATH/js" "$BUILD_PATH/css" "$BUILD_PATH/levels" "$BUILD_PATH/images"

cp -R "$WORKING_PATH/js/extern" "$BUILD_PATH/js/extern"
cp "$WORKING_PATH/built.html" "$BUILD_PATH/index.html"
cp "$WORKING_PATH/manifest.json" "$BUILD_PATH/manifest.json"
cp -R "$WORKING_PATH/css/." "$BUILD_PATH/css/"
cp -R "$WORKING_PATH/images/." "$BUILD_PATH/images/"
cp -R "$WORKING_PATH/levels/." "$BUILD_PATH/levels/"
mv "$BUILD_PATH"/images/icon*.png "$BUILD_PATH"/

echo "Bundling JavaScript..."
cat \
    "$WORKING_PATH/js/lib/Class.js" \
    "$WORKING_PATH/js/lib/Dom.js" \
    "$WORKING_PATH/js/lib/Util.js" \
    "$WORKING_PATH/js/lib/Clock.js" \
    "$WORKING_PATH/js/lib/Collision.js" \
    "$WORKING_PATH/js/core/Input.js" \
    "$WORKING_PATH/js/core/Player.js" \
    "$WORKING_PATH/js/core/Entity.js" \
    "$WORKING_PATH/js/core/Level.js" \
    "$WORKING_PATH/js/core/Hud.js" \
    "$WORKING_PATH/js/core/Game.js" \
    "$WORKING_PATH/js/core/Multiplayer.js" \
    "$WORKING_PATH/js/core/TouchControls.js" \
    "$WORKING_PATH/js/core/Init.js" \
    > "$JS_OUTPUT"

cd "$BUILD_PATH"
rm -f linerage.zip
python3 -m zipfile -c ../linerage.zip .
cd - >/dev/null
