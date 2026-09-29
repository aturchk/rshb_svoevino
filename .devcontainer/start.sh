#!/usr/bin/env bash
# Запуск сканера «Своё Вино» в Codespaces.
#
# Вызывается из postStartCommand и postAttachCommand, поэтому идемпотентен:
# пока приложение работает или собирается, повторный вызов его не трогает.
#
#   bash .devcontainer/start.sh           запустить, если не запущено; сделать порт публичным
#   bash .devcontainer/start.sh restart   перезапустить (пересоберёт, если код изменился)
#   bash .devcontainer/start.sh stop      остановить
#   bash .devcontainer/start.sh status    режим, ссылка и QR-код для телефона
#
# Режим — SVOE_MODE (значение по умолчанию задано в devcontainer.json):
#   prod  npm run build + node .output/server/index.mjs — стабильно, для показа;
#   dev   nuxt dev с HMR — для правок на лету.
# Разово, до следующего рестарта codespace: SVOE_MODE=dev bash .devcontainer/start.sh restart
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/frontend"
SELF="$ROOT/.devcontainer/start.sh"
PORT="${SVOE_PORT:-3000}"
MODE="${SVOE_MODE:-prod}"
# Состояние и логи — вне репозитория, чтобы не попадать в git status.
RUN_DIR="${SVOE_RUN_DIR:-/tmp/svoe-vino}"
LOG="$RUN_DIR/server.log"
PORTS_LOG="$RUN_DIR/ports.log"
# Замок держит сам сервер (дескриптор наследуется), поэтому он освобождается ровно
# тогда, когда процесс умер, — без протухших pid-файлов после рестарта контейнера.
LOCK="$RUN_DIR/server.lock"
PID_FILE="$RUN_DIR/server.pid"

mkdir -p "$RUN_DIR"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

public_url() {
  if [ -n "${CODESPACE_NAME:-}" ]; then
    printf 'https://%s-%s.%s/\n' "$CODESPACE_NAME" "$PORT" \
      "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else
    printf 'http://localhost:%s/\n' "$PORT"
  fi
}

is_running() {
  # Удалось взять замок — значит, его никто не держит и приложение не запущено.
  local free=1
  exec 9>> "$LOCK"
  if flock -n 9; then free=0; fi
  exec 9>&-
  [ "$free" -ne 0 ]
}

# --- Фоновые части -----------------------------------------------------------

# Node из frontend/.nvmrc. nvm — функция шелла и в неинтерактивный скрипт не
# наследуется, поэтому подключаем явно. Ошибка не фатальна: первым в PATH уже стоит
# $NVM_DIR/current, который выставил post-create.sh.
use_node() {
  export NVM_DIR="${NVM_DIR:-/usr/local/share/nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] || return 0
  set +e # nvm.sh не рассчитан на `set -e`
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh" --no-use && nvm use --silent > /dev/null
  local status=$?
  set -e
  [ "$status" -eq 0 ] || log "ВНИМАНИЕ: nvm use не сработал, работаем на $(node -v)."
}

# После git pull lock-файл мог измениться — тогда нужен свежий npm ci.
ensure_deps() {
  local want have=""
  want="$(sha256sum package-lock.json | cut -d' ' -f1)"
  have="$(cat node_modules/.svoe-lock.sha256 2> /dev/null || true)"
  [ "$want" = "$have" ] && return 0
  log "Зависимости устарели или не установлены — npm ci"
  npm ci --no-audit --no-fund
  echo "$want" > node_modules/.svoe-lock.sha256
}

# Отпечаток всего, от чего зависит сборка: последний коммит, трогавший фронтенд или CSV
# датасета, плюс незакоммиченные правки в них. public/data исключён — это выход
# build:data, его перепишет сама сборка. Правки в других папках пересборку не вызывают.
build_fingerprint() {
  local paths=(frontend 'dataset/*.csv' ':!frontend/public/data')
  {
    git -C "$ROOT" log -1 --format=%H -- "${paths[@]}" &&
      git -C "$ROOT" status --porcelain --untracked-files=all -- "${paths[@]}" &&
      git -C "$ROOT" diff HEAD -- "${paths[@]}"
  } 2> /dev/null | sha256sum | cut -d' ' -f1
}

build_if_needed() {
  local fingerprint stamp=.output/.svoe-build
  # Без git отпечаток не посчитать — тогда честно пересобираем каждый раз.
  fingerprint="$(build_fingerprint)" || fingerprint="nogit-$(date +%s)"
  if [ -f .output/server/index.mjs ] && [ "$(cat "$stamp" 2> /dev/null)" = "$fingerprint" ]; then
    log "Сборка актуальна — пропускаю npm run build"
    return 0
  fi
  log "Сборка: npm run build (build:data + nuxt build)"
  npm run build
  echo "$fingerprint" > "$stamp"
}

wait_ready() {
  local _
  for _ in $(seq 1 300); do
    kill -0 "$1" 2> /dev/null || return 1
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/" && return 0
    sleep 1
  done
  return 1
}

run_server() {
  # Последняя строка лога всегда объясняет, чем всё кончилось: упавшей сборкой,
  # npm ci или остановкой сервера.
  trap 'log "Фоновый запуск завершился (код $?). Снова: bash .devcontainer/start.sh"' EXIT
  echo $$ > "$PID_FILE"
  echo "$MODE" > "$RUN_DIR/mode"
  cd "$APP"
  use_node
  log "Режим $MODE, Node $(node -v)"
  ensure_deps

  if [ "$MODE" = dev ]; then
    # С --host 0.0.0.0 Nuxt CLI сам ставит vite.server.allowedHosts = true, а HMR
    # ходит через тот же порт — прокси Codespaces пропускает его как wss на 443.
    # Но allowedHosts = true живёт только до перезапуска Nuxt (правка nuxt.config.ts
    # или .env): дальше Nuxt сужает список до локальных адресов, и Vite отвечает 403
    # «Blocked request». Адрес codespace добавляем через документированную переменную
    # Vite — она дописывается к списку при каждом перезапуске, nuxt.config.ts не трогаем.
    if [ -n "${CODESPACE_NAME:-}" ]; then
      local host="$CODESPACE_NAME-$PORT.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
      export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS:+$__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS,}$host"
    fi
    ./node_modules/.bin/nuxt dev --host 0.0.0.0 --port "$PORT" &
  else
    build_if_needed
    HOST=0.0.0.0 PORT="$PORT" node .output/server/index.mjs &
  fi
  local pid=$!
  if wait_ready "$pid"; then
    log "Готово: $(public_url)"
  fi
  wait "$pid"
}

# Codespaces не даёт задать видимость порта в devcontainer.json и сбрасывает её в
# private при каждом рестарте. Выставляем через gh: GITHUB_TOKEN в codespace хватает
# на свой codespace. Порт появляется в туннеле не сразу, а видимость может слететь
# сразу после подключения IDE — поэтому повторяем и подтверждаем несколько раз.
# Замка здесь нет намеренно: у вызова из postAttachCommand окружение свежее, и он не
# должен ждать застрявший цикл из postStartCommand. Повторный вызов gh безвреден —
# если порт уже публичный, gh ничего не меняет.
make_public() {
  local manual="Вручную: вкладка Ports -> правый клик по порту $PORT -> Port Visibility -> Public."
  if [ -z "${CODESPACE_NAME:-}" ]; then
    log "Не Codespaces — видимость порта не трогаю."
    exit 0
  fi
  if ! command -v gh > /dev/null; then
    log "ВНИМАНИЕ: нет gh. $manual"
    exit 0
  fi
  # gh меняет видимость только у порта, который уже есть в туннеле codespace
  # (иначе «error getting tunnel port»), а надёжнее всего порт там есть, когда приложение
  # уже слушает. Первая сборка на 2 ядрах идёт минуты и съела бы весь запас повторов
  # ниже — поэтому сначала ждём ответа приложения, не дольше 20 минут.
  local waited=0
  log "Жду, пока приложение ответит на порту ${PORT}…"
  until curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; do
    if [ "$waited" -ge 1200 ]; then
      log "Приложение не ответило за 20 минут (см. $LOG) — пробую сделать порт публичным всё равно."
      break
    fi
    sleep 5
    waited=$((waited + 5))
  done
  export GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
  local confirmed=0 out _
  for _ in $(seq 1 60); do
    if out="$(gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" 2>&1)"; then
      confirmed=$((confirmed + 1))
      if [ "$confirmed" -ge 3 ]; then
        log "Порт $PORT публичный: $(public_url)"
        exit 0
      fi
      sleep 15
    else
      log "gh: ${out%%$'\n'*}"
      case "$out" in
        # Нет токена, прав или запрещает политика организации — повтор не поможет.
        *"HTTP 401"* | *"HTTP 403"* | *Forbidden* | *Unauthorized* | *policy* | *"gh auth login"*) break ;;
      esac
      sleep 5
    fi
  done
  log "ВНИМАНИЕ: не удалось сделать порт $PORT публичным. $manual"
}

# --- Команды -------------------------------------------------------------------

start() {
  case "$MODE" in
    prod | dev) ;;
    *)
      echo "SVOE_MODE=$MODE: ожидается prod или dev." >&2
      exit 1
      ;;
  esac
  exec 9>> "$LOCK"
  if flock -n 9; then
    [ -f "$LOG" ] && mv -f "$LOG" "$LOG.prev"
    # setsid + полное перенаправление: хук devcontainer не ждёт фоновый процесс
    # и не убивает его, когда заканчивается сам. Дескриптор 9 с замком уходит серверу.
    setsid nohup bash "$SELF" __run >> "$LOG" 2>&1 < /dev/null &
    echo "Своё Вино: запускаю в фоне, режим $MODE."
  else
    echo "Своё Вино: уже запущено или собирается, режим $(cat "$RUN_DIR/mode" 2> /dev/null || echo '?')."
  fi
  exec 9>&-
  setsid nohup bash "$SELF" __public >> "$PORTS_LOG" 2>&1 < /dev/null &
  echo "  Ссылка: $(public_url)"
  echo "  Лог:    tail -f $LOG"
  echo "  QR:     bash .devcontainer/start.sh status"
}

stop() {
  local pid
  pid="$(cat "$PID_FILE" 2> /dev/null || true)"
  exec 9>> "$LOCK"
  if flock -n 9; then
    exec 9>&-
    echo "Своё Вино: не запущено."
    return 0
  fi
  # Фоновый процесс — лидер своей группы (setsid): гасим всю группу — сборку, сервер,
  # дочерние процессы nuxt dev.
  [ -n "$pid" ] && kill -TERM -- "-$pid" 2> /dev/null || true
  if ! flock -w 20 9; then
    [ -n "$pid" ] && kill -KILL -- "-$pid" 2> /dev/null || true
    if ! flock -w 5 9; then
      echo "Не удалось остановить: $LOCK держит кто-то ещё (см. lsof $LOCK)." >&2
      exit 1
    fi
  fi
  exec 9>&-
  echo "Своё Вино: остановлено."
}

status() {
  local url
  url="$(public_url)"
  if is_running; then
    echo "Своё Вино: работает, режим $(cat "$RUN_DIR/mode" 2> /dev/null || echo '?'), PID $(cat "$PID_FILE" 2> /dev/null || echo '?')."
  else
    echo "Своё Вино: не запущено. Запуск: bash .devcontainer/start.sh"
  fi
  echo "Ссылка: $url"
  # QR для телефона. uqr уже лежит в node_modules как зависимость Nuxt CLI (listhen);
  # если его там не окажется — просто без QR.
  (cd "$APP" && node -e 'console.log(require("uqr").renderUnicodeCompact(process.argv[1], { border: 2 }))' "$url" 2> /dev/null) || true
  echo "Видимость порта: $(tail -n 1 "$PORTS_LOG" 2> /dev/null || echo 'ещё не выставлялась')"
  echo "Логи: $LOG, $PORTS_LOG"
}

case "${1:-start}" in
  start) start ;;
  restart)
    stop
    start
    ;;
  stop) stop ;;
  status) status ;;
  __run) run_server ;;
  __public) make_public ;;
  *)
    sed -n '2,15p' "$SELF"
    exit 1
    ;;
esac
