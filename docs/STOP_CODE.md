# Stop-code runbook

Финальная конфигурация: pinned `google/siglip2-base-patch16-384`, rank-64 adapter,
928-SKU strict gallery, exact cosine retrieval, ORB выключен. До официального
результата thresholds остаются пустыми, поэтому продуктовый API не выдаёт
некалиброванный `matched`.

## До открытия test

```bash
cd frontend && nvm use && cd ..
make release-check
git status --short
git rev-parse HEAD
```

Зафиксируйте commit SHA. После получения test нельзя менять gallery, adapter,
preprocessing, candidate-k, веса reranker или thresholds.

На RunPod используйте уже проверенный CUDA image/runtime из
[`ml/docs/RUNPOD_RESULTS.md`](../ml/docs/RUNPOD_RESULTS.md). После подготовки
артефактов `ml/scripts/runpod_train.sh` сервис запускается без повторного обучения:

```bash
ML_PORT=8080 ml/scripts/runpod_serve.sh /workspace/rshb_svoevino
```

Проверьте `/health/ready` и `/v1/metadata`. Не вставляйте RunPod API key в файлы,
notebook, аргументы команд или Git.

## Когда test появится 1 октября

1. Скопируйте изображения без переименования в `eval/test/images/`.
2. Сохраните manifest как `eval/test/queries.tsv`.
3. Выполните `make acceptance-preflight`; сохраните `package_sha256`.
4. На замороженном работающем сервисе выполните `make acceptance-run`.
5. Сохраните каталог `work/acceptance/` вне Git вместе с commit SHA и release ID.

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
публикуются model weights, Hugging Face cache, RunPod credentials, private test,
predictions и `work/`.

После получения официального результата обновите только фактические evidence и
model card. Не перезапускайте подбор параметров на том же test. Финальная формулировка
обязана отделять synthetic proxy, ручной development pool и официальный test.
