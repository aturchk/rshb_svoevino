# «Своё Вино»: scanner + SigLIP 2 retrieval

Единый репозиторий мобильного Nuxt-приложения и воспроизводимого ML-контура для распознавания российских вин по полевой фотографии.

## Текущий статус

- frontend: mobile-first Nuxt 4, каталог на 2 178 SKU (включая 75 новых с сайта), камера, история и карточки;
- переносимый снимок `vino-svoe.ru`: 2 110 карточек с атрибутами и исходными фото; проверенная галерея — 1 936 SKU;
- ML: закреплённый `google/siglip2-base-patch16-384` + включённый в репозиторий rank-64 adapter, cosine retrieval по полной бутылке и детали этикетки;
- production default: adapter-SigLIP с `full-label` эталонами и полным полевым фото, без ORB;
- на внутреннем pool из 59 покрытых полевых фото: 41/59 Top-1 (69,5%), 53/59 Recall@5 (89,8%), p95 237,5 мс на RTX 5090; frozen baseline — 39/59 и 51/59;
- 100 реальных фото вручную просмотрены: 64 exact-SKU, 35 `not_in_catalog`, 1 `uncertain`;
- 59 из 64 подтверждённых входят в новую галерею; это однопроходная разметка для диагностики, **не закрытый test** и не подтверждение цели ТЗ 90%; пороги отказа не откалиброваны.

Полные методика, метрики и ограничения: [отчёт о точности](ml/docs/FIELD_ACCURACY_REPORT.md).
Модель и воспроизведение: [ML README](ml/README.md), [карточка адаптера](ml/models/README.md).
Приложение и фичи: [frontend README](frontend/README.md).

## Структура

```text
frontend/   Nuxt UI и server-side proxy к ML
ml/         обучение, benchmark, inference API, Docker
dataset/    неизменяемые исходные данные, real_photo и переносимый снимок vino-svoe
data/       reviewed-аннотации и catalog lookup
eval/       контракт и fixtures организатора
docs/       презентационные и проектные материалы
work/       локальные кэши, эксперименты и временные отчёты; не коммитится
```

## Полный локальный запуск

Нужны Python 3.10+, `curl` и Node из `frontend/.nvmrc`. Первый запуск сам создаёт
Python environment, устанавливает зависимости, готовит gallery, локальный SigLIP
index и production build frontend:

```bash
make local
```

После готовности откройте `http://127.0.0.1:3000`. ML работает локально на
`http://127.0.0.1:8080`; устройство выбирается автоматически: CUDA, Apple MPS или
CPU. Проверенный adapter уже хранится в `ml/models/` и **не переобучается** при
запуске. Базовый публичный checkpoint загружается один раз по закреплённой
ревизии, затем локальный индекс сохраняется в ignored `work/`.
Принудительная повторная подготовка: `make local-setup`.

Для быстрой проверки только интерфейса без ML:

```bash
make install
make demo              # http://localhost:3000, сканер явно помечен «Демо»
```

Полная локальная проверка данных, Python/Nuxt тестов, production build и HTTP-smoke:

```bash
make test
```

### Frontend

Нужен Node из `frontend/.nvmrc`.

```bash
cd frontend
nvm use
npm ci
npm run build:images   # один раз или после изменения dataset/
npm run dev            # http://localhost:3000
```

Для UI без GPU: `NUXT_PUBLIC_DEMO_SCAN=true npm run dev`. В обычном режиме Nuxt вызывает ML по приватному `NUXT_ML_BASE_URL` (по умолчанию `http://127.0.0.1:8080`).

### Временный интерфейс разметки

После `npm run dev` откройте `http://localhost:3000/annotate`. Слева показывается
оригинальная фотография из `dataset/real_photo`, справа — поиск по каталогу.
Подтверждение атомарно обновляет канонический `data/field_mapping.tsv`; при первом
сохранении процесса исходная версия копируется в `work/annotation-backups/`.
Интерфейс доступен автоматически только в dev. Для отдельного trusted deployment
его нужно явно включить переменной `NUXT_ANNOTATION_ENABLED=true` и передать
`ANNOTATION_REPO_ROOT`; публиковать write-endpoint в интернет нельзя.

Перед началом новой партии проверьте, не совпадают ли полевые фото с каталогом:

```bash
.venv/bin/python ml/scripts/audit_real_photo_overlap.py
```

Текущий снимок и границы доверия описаны в [`data/README.md`](data/README.md).

### ML

Команды выполняются из корня репозитория: относительные пути `dataset/`, `data/`, `eval/` и `work/` остаются едиными.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e './ml[orb,api]'
.venv/bin/python -m unittest discover -s ml/tests -v
.venv/bin/wine-cv prepare-strict --data-root .
```

Для полного SigLIP-контура используйте `make local-setup`; он ставит
`./ml[siglip,orb,api,test]`, выбирает доступный accelerator и создаёт совместимый
локальный embedding-cache. Подробности приведены в [ML README](ml/README.md#5-serve-the-organizer-endpoint).

## Production deployment

Runtime разделён на два контейнера: наружу публикуется только Nuxt, а один ML-процесс владеет одной GPU во внутренней сети. Обучение вынесено в отдельный image/profile.

1. Создайте self-contained release с gallery, проверенными reference images, adapter, cache и offline Hugging Face cache с закреплённым snapshot:

   ```bash
   .venv/bin/python ml/scripts/build_release.py \
     --cache-dir work/siglip-cache \
     --model-dir /path/to/huggingface-cache-root \
     --release-id siglip2-site-20260929 --output work/release
   ```

2. Запустите:

   ```bash
   cp .env.example .env
   docker compose up --build
   ```

Health endpoints: frontend `/api/health`, ML `/health/live` и `/health/ready`. Organizer contract доступен через frontend `/api/v1/eval/predict`; продуктовый endpoint — `/api/v1/recognize`.

## Проверки перед релизом

```bash
make release-check
```

Пороговые переменные `ML_*_THRESHOLD` намеренно пусты. Их можно заполнить только
вместе с `ML_THRESHOLD_VERSION` после frozen acceptance test. ORB включается как
отдельная абляция: на proxy он дал лишь +0,11 п.п. Top-1 при +48,6 мс к p95.

## Acceptance test 1 октября

Положите выданные файлы без переименования в `eval/test/images/`, а manifest — в
`eval/test/queries.tsv`. Полный стек поднимется, проверит package, выполнит запросы
через Nuxt и сохранит evidence одной локальной командой:

```bash
make october-test
```

Команда проверяет входные SHA-256, записывает `/api/v1/metadata`, последовательно
вызывает organizer endpoint и валидирует итоговый JSONL. Evidence сохраняется в
игнорируемом `work/acceptance-<timestamp>/`. Без answer labels этот прогон подтверждает только
целостность, контракт и latency — не accuracy. Полный протокол: [`eval/README.md`](eval/README.md).

## Stop-code

Перед публикацией финального репозитория:

1. Не менять модель, gallery, preprocessing и adapter после открытия test.
2. Выполнить `make release-check` на чистом checkout.
3. Выполнить acceptance run и сохранить receipts отдельно от Git.
4. Зафиксировать commit SHA, release ID, model metadata и hash test package.
5. Публиковать field accuracy только при наличии официальных answer labels/score.

Пошаговый локальный publication runbook: [`docs/STOP_CODE.md`](docs/STOP_CODE.md).

## Security

Секреты и приватный test package не хранятся в репозитории. Для локального запуска
API-ключи не требуются: базовая модель публичная, а после `make local-setup` сервис
работает с локальным model cache в offline-режиме.
