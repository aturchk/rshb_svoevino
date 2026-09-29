# Stop-code runbook

Финальная конфигурация: pinned `google/siglip2-base-patch16-384`, rank-64 adapter,
928-SKU strict gallery, exact cosine retrieval, ORB выключен. До официального
результата thresholds остаются пустыми, поэтому продуктовый API не выдаёт
некалиброванный `matched`.

## До открытия test

Всё выполняется на локальной машине. Отдельная внешняя инфраструктура не нужна.

```bash
cd frontend && nvm use && cd ..
make local-setup
make release-check
git status --short
git rev-parse HEAD
```

`make local-setup` создаёт host-local Python environment, strict gallery, adapter-bound
embedding-cache для доступного CUDA/MPS/CPU устройства и production build Nuxt.
Зафиксируйте commit SHA. После получения test нельзя менять gallery, adapter,
preprocessing, candidate-k, веса reranker или thresholds.

Обычный запуск всего приложения:

```bash
make local
```

Готовность проверяется через frontend `http://127.0.0.1:3000/api/v1/metadata`;
ML health endpoints доступны на `http://127.0.0.1:8080/health/ready`.

## Когда test появится 1 октября

1. Скопируйте изображения без переименования в `eval/test/images/`.
2. Сохраните manifest как `eval/test/queries.tsv`.
3. Остановите ранее запущенный `make local`, чтобы освободить порты 3000 и 8080.
4. Выполните одну команду: `make october-test`.
5. Сохраните созданный каталог `work/acceptance-<timestamp>/` вне Git вместе с
   commit SHA.

`make october-test` самостоятельно поднимает реальный ML + Nuxt локально, ждёт
readiness, проверяет package, выполняет последовательные запросы через frontend,
валидирует predictions и останавливает оба процесса.

Acceptance runner записывает:

- SHA-256 и размеры каждого входа;
- hash всего пакета;
- model/runtime metadata до прогона;
- последовательные Top-1 predictions и latency;
- итоговую проверку порядка, hashes и принадлежности slug каталогу.

Без answer labels или официального score он не вычисляет accuracy и не делает вид,
что transport-check является проверкой качества.

## Публикация

В Git публикуются код, reviewed development mapping, документация и тесты. Не
публикуются model weights, model cache, private test, predictions и `work/`.

После получения официального результата обновите только фактические evidence и
model card. Не перезапускайте подбор параметров на том же test. Финальная формулировка
обязана отделять synthetic proxy, ручной development pool и официальный test.
