#!/usr/bin/env bash
# Один раз при создании codespace: Node ровно из frontend/.nvmrc и зависимости.
# Версия Node больше нигде не записана — .nvmrc остаётся единственным источником правды.
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"

want="$(tr -d '[:space:]' < .nvmrc)"

# Хуки devcontainer запускаются неинтерактивно: /etc/bash.bashrc, где образ подключает
# nvm, не читается, а сама nvm — функция шелла и через окружение не наследуется.
# Поэтому подключаем её явно.
export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
# `nvm use` перевешивает симлинк $NVM_DIR/current, а он в образе стоит первым в PATH:
# так версия из .nvmrc видна всем процессам — хукам, терминалам, start.sh.
export NVM_SYMLINK_CURRENT=true

# nvm.sh не рассчитан на `set -e`: на время работы с ним строгий режим снимаем.
set +e
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh" --no-use && nvm install && nvm alias default "$want" > /dev/null
nvm_status=$?
set -e

node_version="$(node -v)"
if [ "$nvm_status" -ne 0 ] || [ "$node_version" != "v${want#v}" ]; then
  # Не падаем: в образе Node того же мажора, приложение на нём соберётся.
  echo "ВНИМАНИЕ: nvm не поставил Node $want из .nvmrc, работаем на $node_version." >&2
fi
echo "Node $node_version ($(command -v node)), npm $(npm -v)"

npm ci --no-audit --no-fund
# Отпечаток lock-файла: по нему start.sh поймёт, что после git pull нужен новый npm ci.
sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.svoe-lock.sha256

echo "Зависимости готовы. Приложение поднимет start.sh, лог: ${SVOE_RUN_DIR:-/tmp/svoe-vino}/server.log"
