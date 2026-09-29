# «Своё Вино»: scanner + SigLIP 2 retrieval

Единый репозиторий мобильного Nuxt-приложения и воспроизводимого ML-контура для распознавания российских вин по полевой фотографии.

## Текущий статус

- frontend: mobile-first Nuxt 4, каталог на 2 103 SKU, камера, история и карточки;
- ML: `google/siglip2-base-patch16-384` + rank-64 adapter, точный cosine retrieval;
- production default: adapter-SigLIP без ORB;
- strict searchable gallery: 928 из 2 103 SKU;
- 94,1% Top-1 и p95 84,9 мс измерены **только на synthetic proxy**, не на фото из магазинов;
- 100 реальных фото вручную просмотрены: 64 exact-SKU, 35 `not_in_catalog`, 1 `uncertain`;
- из 64 подтверждений только 23 сейчас входят в strict gallery, поэтому field accuracy пока не заявляется;
- официальный test ожидается 1 октября 2026 года; до него модель и thresholds остаются замороженными.

Проверяемый пакет для презентации: [docs/presentation/ml-status/README.md](docs/presentation/ml-status/README.md). Полная ML-документация: [ml/README.md](ml/README.md).

## Структура

```text
frontend/   Nuxt UI и server-side proxy к ML
ml/         обучение, benchmark, inference API, Docker
dataset/    неизменяемые исходные данные и real_photo
data/       reviewed-аннотации и catalog lookup
eval/       контракт и fixtures организатора
docs/       презентационные и проектные материалы
work/       локальные модели, кэши и отчёты; не коммитится
```

## Локальный запуск

Самый короткий путь для проверки приложения без GPU:

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
оригинальная фотография из `dataset/real_photo`, справа — поиск по всем 2 103 SKU.
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

На CUDA-хосте установите совместимый PyTorch и затем `./ml[siglip,api]`. Полная команда сервиса приведена в [ML README](ml/README.md#5-serve-the-organizer-endpoint).

## Production deployment

Runtime разделён на два контейнера: наружу публикуется только Nuxt, а один ML-процесс владеет одной GPU во внутренней сети. Обучение вынесено в отдельный image/profile.

1. Создайте self-contained release с gallery, проверенными reference images, adapter, cache и offline Hugging Face cache с закреплённым snapshot:

   ```bash
   .venv/bin/python ml/scripts/build_release.py \
     --adapter work/runpod-results/work/models/siglip2-field-adapter.safetensors \
     --cache-dir work/runpod-results/work/siglip-cache \
     --model-dir /path/to/huggingface-cache-root \
     --release-id siglip2-20260928 --output work/release
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
`eval/test/queries.tsv`. Затем на уже зафиксированной модели выполните:

```bash
make acceptance-preflight
make acceptance-run
```

Второй target проверяет входные SHA-256, записывает `/v1/metadata`, последовательно
вызывает organizer endpoint и валидирует итоговый JSONL. Evidence сохраняется в
игнорируемом `work/acceptance/`. Без answer labels этот прогон подтверждает только
целостность, контракт и latency — не accuracy. Полный протокол: [`eval/README.md`](eval/README.md).

## Stop-code

Перед публикацией финального репозитория:

1. Не менять модель, gallery, preprocessing и adapter после открытия test.
2. Выполнить `make release-check` на чистом checkout.
3. Выполнить acceptance run и сохранить receipts отдельно от Git.
4. Зафиксировать commit SHA, release ID, model metadata и hash test package.
5. Публиковать field accuracy только при наличии официальных answer labels/score.

Пошаговый RunPod и publication runbook: [`docs/STOP_CODE.md`](docs/STOP_CODE.md).

## Security

Секреты не хранятся в репозитории. RunPod API key, ранее попавший в notebook/чат, удалён из рабочей копии и должен быть отозван и перевыпущен в RunPod.
