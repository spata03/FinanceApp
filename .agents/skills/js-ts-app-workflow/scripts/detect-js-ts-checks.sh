#!/usr/bin/env sh
set -eu

if [ ! -f package.json ]; then
  echo "package_manager=none"
  echo "format="
  echo "lint="
  echo "typecheck="
  echo "test="
  echo "build="
  echo "serve=python -m http.server 8080"
  exit 0
fi

pm="npm"
[ -f pnpm-lock.yaml ] && pm="pnpm"
[ -f yarn.lock ] && pm="yarn"
[ -f bun.lock ] || [ -f bun.lockb ] && pm="bun"

run_cmd() {
  case "$pm" in
    npm) echo "npm run $1" ;;
    pnpm) echo "pnpm $1" ;;
    yarn) echo "yarn $1" ;;
    bun) echo "bun run $1" ;;
  esac
}

has_script() {
  script_name="$1"
  if command -v node >/dev/null 2>&1; then
    node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)"
  else
    grep -q "\"$script_name\"" package.json
  fi
}

echo "package_manager=$pm"
for script in format lint typecheck test build dev start; do
  if has_script "$script"; then
    echo "$script=$(run_cmd "$script")"
  else
    echo "$script="
  fi
done
