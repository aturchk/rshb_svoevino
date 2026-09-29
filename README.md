# «Своё Вино»: scanner + SigLIP 2 retrieval

Единый репозиторий мобильного Nuxt-приложения и воспроизводимого ML-контура для распознавания российских вин по полевой фотографии.

## Текущий статус

- frontend: mobile-first Nuxt 4, каталог на 2 103 SKU, камера, история и карточки;
- ML: `google/siglip2-base-patch16-384` + rank-64 adapter, точный cosine retrieval;
- production default: adapter-SigLIP без ORB;
- strict searchable gallery: 928 из 2 103 SKU;
- 94,1% Top-1 и p95 84,9 мс измерены **только на synthetic proxy**, не на фото из магазинов;
- 100 реальных фото сейчас размечаются. До их проверки API честно выдаёт `low_confidence`, а не некалиброванный `matched`.

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
make test
make check-secrets
```

Пороговые переменные `ML_*_THRESHOLD` намеренно пусты. Их можно заполнить только вместе с `ML_THRESHOLD_VERSION` после разметки и frozen-evaluation реальных фото. ORB включается как отдельная абляция: на proxy он дал лишь +0,11 п.п. Top-1 при +48,6 мс к p95.

## Security

Секреты не хранятся в репозитории. RunPod API key, ранее попавший в notebook/чат, удалён из рабочей копии и должен быть отозван и перевыпущен в RunPod.
