# Проверка сканера винных этикеток

## Требования

- Запустите свой сервис распознавания.
- Убедитесь, что установлены `bash`, `curl`, `jq` и `awk`.
- Контрольные изображения должны находиться в папке `queries/` и быть перечислены в `queries.tsv`.

Сервис должен принимать изображение в multipart-поле `image` и возвращать Top-1 `slug`:

```json
{"slug":"kokur-suhoe-2025"}
```

Также поддерживается ответ текущего API в виде массива: `[{"slug":"..."}]`.

## Запуск

```bash
chmod +x participant_test.sh

./participant_test.sh \
  --images-dir ./queries \
  --manifest ./queries.tsv \
  --endpoint 'http://127.0.0.1:8080/v1/eval/predict' \
  --output ./predictions.jsonl
```

Если `predictions.jsonl` уже существует, удалите или переименуйте его перед повторным запуском.

## Финальный acceptance run

До 1 октября 2026 года официального test package в репозитории нет. Три файла в
`eval/queries/` — только fixtures для проверки транспорта, у них нет answer labels.

Когда организатор выдаст test, положите его без переименования в `eval/test/` по
схеме из [`eval/test/README.md`](test/README.md). На уже замороженной модели:

```bash
make acceptance-preflight
make acceptance-run
```

Или с явными путями:

```bash
eval/run_acceptance.sh \
  --images-dir /path/to/test/images \
  --manifest /path/to/test/queries.tsv \
  --endpoint http://127.0.0.1:8080/v1/eval/predict \
  --metadata-url http://127.0.0.1:8080/v1/metadata \
  --output-dir work/acceptance-20261001
```

Wrapper до отправки запросов проверяет структуру, безопасные пути, уникальность,
декодирование и SHA-256 изображений. После прогона он проверяет порядок JSONL,
соответствие входным SHA-256, допустимость slug и latency, а также сохраняет
model metadata. Без официальных ответов receipt намеренно содержит
`accuracy_available=false`.

## Принцип работы

Скрипт обрабатывает фотографии по порядку из `queries.tsv`. Каждое изображение отправляется отдельно. Скрипт ждёт полный ответ сервиса, записывает результат и только после этого отправляет следующее изображение. Параллельных запросов и повторных попыток нет.

Результат сохраняется в `predictions.jsonl`, по одной JSON-строке на фотографию:

```json
{"query_id":"q-000001","image_path":"019c68d0.jpg","image_sha256":"8d9c821e...","predicted_slug":"kokur-suhoe-2025","latency_ms":842}
```

Если сервис не вернул корректный `slug`, значение `predicted_slug` будет `null`. После завершения передайте `predictions.jsonl` организатору. Правильные ответы и итоговый `confidence` находятся и рассчитываются только у организатора.
