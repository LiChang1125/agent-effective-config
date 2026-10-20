#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL_DIR=${AEC_INSTALL_DIR:-"$HOME/.local/bin"}

printf 'Installing aec to %s (set AEC_INSTALL_DIR to choose another location).\n' "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
chmod +x "$PROJECT_DIR/bin/aec.js"
printf '%s\n' '#!/usr/bin/env sh' "exec node \"$PROJECT_DIR/bin/aec.js\" \"\$@\"" > "$INSTALL_DIR/aec"
chmod +x "$INSTALL_DIR/aec"

printf 'Installed. If needed, add %s to PATH.\n' "$INSTALL_DIR"
