# Отчёт о точности поиска на полевых фото

## Что требует ТЗ

Исходное задание — [`task/10. РСХБ.Цифра.pdf`](../../task/10.%20РСХБ.Цифра.pdf),
разделы 2, 4 и 6. Для демонстрации нужны доля точных совпадений `slug`
(цель 90–100%), F1 для Top-1 и Top-5, а также время ответа до 3 секунд.
Закрытый `confidence` организатор рассчитывает самостоятельно. Балл сходства
SigLIP и разница между первым и вторым кандидатами не являются F1.

Наше определение: для каждого фото ровно один правильный `slug` и один
обязательный ответ Top-1. Поэтому micro-F1@1 равен Top-1 accuracy. Для
Top-5 считаем средний set-F1: при попадании правильного вина это
`2/(k+1)`, иначе `0`, где `k` — фактическое число выданных кандидатов до пяти.
При пяти кандидатах максимум set-F1@5 равен 1/3. Поэтому рядом всегда
показывается более понятный Recall@5. Дополнительно сохраняются Recall@20,
p50/p95 задержки и доля запросов быстрее трёх секунд.

## Текущая доказательная база

Снимок от 29 сентября 2026 года: в `data/field_mapping.tsv` есть 100 реальных
фото, из них 64 `confirmed`, 35 `not_in_catalog` и одно `uncertain`.
Все строки остаются в `pool` после одного ревью; нет групп физических бутылок
и замороженного независимого `test`. Переносимый снимок допущенной галереи
`dataset/vino-svoe/gallery-reviewed-candidates.jsonl` содержит 1 936 SKU и по
текущим ответам покрывает 59 из 64 подтверждённых фото. Это предварительный
потолок 92,2% Top-1 на всех 64 фото для поиска только по этой галерее.
Предыдущая объединённая галерея из 1 925 SKU покрывала 56/64, или 87,5%.
Часть старых ответов и ссылок сайта на фото проходит повторную проверку;
после исправления разметки предел и метрики надо пересчитать.

Аудит полевых фото выявил шесть конкретных спорных ответов. У
`field-000045` и `field-000060` на этикетке читается «Цитрон / Шардоне /
белое полусладкое 2024»; их текущий slug, вероятно, следует заменить на
`zhemchuzhnaya-9-czitron-shardone-1`. У `field-000047` и `field-000069`
видно «2024 полусухое» вместо 2023 на эталоне базового slug; вероятный
ответ — `aratti-kaberne-po-belomu-1`. Ещё два фото сейчас размечены как
`not_in_catalog`, хотя на сайте появились подходящие карточки:
`field-000020` → `merlo-2` и `field-000084` → `kaberne-sovinon-3`.
Это сильные визуальные гипотезы, пока без независимого второго ревью; в
каноническом TSV они ещё не применены. Указанные два новых slug отсутствуют
в старом CSV, который использует текущий валидатор разметки.

| Исторический прогон на 56 покрытых фото | Top-1 / micro-F1@1 | Recall@5 | set-F1@5 | Recall@20 | p95 поиска |
| --- | ---: | ---: | ---: | ---: | ---: |
| dHash, контроль 29.09, Mac | 0/56 (0%) | 0% | 0% | 0% | 361,12 мс |
| SigLIP 2 B/16 384, полный кадр, MPS FP16 | 28/56 (50,0%) | 42/56 (75,0%) | 25,0% | 52/56 (92,9%) | 554,82 мс |

Контрольный dHash не распознаёт эти фото; его результат подтверждает разрыв
между изолированными изображениями бутылок и снимками у полки. Он не является
оценкой SigLIP. Базовый SigLIP поднял долю попаданий в Top-20 до 92,9%, но
точный Top-1 пока на 40 процентных пунктов ниже нижней границы цели ТЗ.
Все 56 внутренних SigLIP-запросов завершились за три секунды; медиана
поиска — 470,85 мс.
Модель — `google/siglip2-base-patch16-384`, revision
`f775b65a79762255128c981547af89addcfe0f88`, без адаптера и crop,
на Apple MPS с FP16. Сравнение скорости с dHash ограничено разными
реализациями и прогревом; ключевой факт — каждый метод измерен на тех же
изображениях и галерее.

Машинные отчёты и полный список ошибок лежат в игнорируемых
`work/field-report/dhash-report/accuracy.{json,md}` и
`work/field-report/siglip-baseline/accuracy.{json,md}`. В них зафиксированы
SHA-256 разметки, галереи, запросов, ответов, предсказаний и сводки
бенчмарка. SHA-256 галереи этого сравнения:
`f74ad9388c974862b7f3f214e775f22835254d714d348112830d5a84f705f4bd`.

Результаты на 35 отсутствующих в каталоге винах пока не измеряют поведение
отказа или предложения аналога. Внутреннее время поиска не включает HTTP и
рендеринг мобильного интерфейса; для SLA нужен отдельный прогон сервиса
организаторским скриптом. Три фото из `eval/queries/` не имеют ответов и
подходят только для проверки транспорта.

Прежний разрыв с продуктовым каталогом устранён для 75 точных site-only slug,
которые входят в reviewed-галерею и отсутствовали в старом CSV: они добавлены
в статический индекс и карточки Nuxt вместе с локальными изображениями.
Проверка `frontend/tests/site-catalog.test.ts` подтверждает наличие каждого
из этих slug в индексе и полноту карточек. ML-бенчмарк всё ещё измеряет только
поиск; маршрут фото → ML → JSON-карточка и полный HTTP SLA требуют отдельного
сквозного прогона.

## Воспроизведение исторического SigLIP-прогона

Из корня репозитория, на машине с установленным `ml[siglip,api]`:

```bash
PYTHONPATH=ml/src .venv/bin/python -m wine_cv.field_report prepare \
  --gallery work/vino-svoe/gallery-merged-candidates.jsonl \
  --output-dir work/field-report

.venv/bin/wine-cv benchmark \
  --pipeline siglip2 \
  --gallery work/vino-svoe/gallery-merged-candidates.jsonl \
  --data-root . \
  --manifest work/field-report/queries.pool.tsv \
  --images-dir . \
  --labels work/field-report/labels.pool.tsv \
  --device cuda --precision bfloat16 --top-k 20 \
  --output work/field-report/siglip-predictions.jsonl \
  --summary work/field-report/siglip-summary.json

PYTHONPATH=ml/src .venv/bin/python -m wine_cv.field_report score \
  --selection work/field-report/selection.pool.json \
  --gallery work/vino-svoe/gallery-merged-candidates.jsonl \
  --predictions work/field-report/siglip-predictions.jsonl \
  --benchmark-summary work/field-report/siglip-summary.json \
  --output-dir work/field-report/siglip-report
```

Выберите нужные закреплённые revision, adapter и cache через штатные флаги
`wine-cv benchmark`. Одинаковые запросы и ответы позволяют сравнить варианты
модели; при изменении исходной разметки или галереи команда `score` откажется
считать устаревший прогон. `pool` остаётся диагностикой даже после удачного
SigLIP-прогона. Официальную точность надо получать на независимой размеченной
контрольной выборке либо из результата организатора, не из синтетического
proxy и не из каталожных фотографий.

## RunPod RTX 5090: полевые фото и воспроизводимость

Галерея после ручного допуска 11 новых эталонов содержит 1 936 SKU. Во время
обучения и бенчмарка на RunPod использовался файл
`work/vino-svoe/gallery-reviewed-candidates.jsonl` с SHA-256
`d9ddfbc13848545836e7f59f788a6a8949b2fe29242cf6eaceb49d952c400266`.
Переносимый tracked-снимок в
`dataset/vino-svoe/gallery-reviewed-candidates.jsonl` имеет другой файловый
SHA-256 — `b9d65766946257d0ad4eba2fda7f97ab389a57c03fa926ac639e8e3f0b28a445`:
в его 1 936 упорядоченных строках заменены только префиксы
`work/vino-svoe/` на `dataset/vino-svoe/` в `image_path` и
`source_image_path`. Порядок slug и SHA-256 изображений не изменились;
проверенный на обеих галереях digest этого содержимого равен
`22fd16912871143c4a3f8b369cbc748528d63f196391c83d6c6995f4e9e09836`.
Исторические RunPod receipts остаются привязаны к SHA исходного файла
`d9dd…`; их нельзя переписывать на `b9d…` или передавать переносимый файл
в `field_report score` без нового бенчмарка.
По текущим меткам она покрывает 59/64 подтверждённых полевых фото. На RunPod
RTX 5090 обучен низкоранговый адаптер SigLIP с `augmentation=label-mix-v2`:
он видит синтетически искажённые полные бутылки и кропы исходных каталожных
изображений, но не получает полевые фото как обучающие примеры. Его
`best_proxy` из training receipt измеряет устойчивость к производным того
же каталога и не является полевой точностью. Обучение длилось 343,742 с,
лучшей выбрана эпоха 15; proxy Top-1 вырос с 66,27% до 79,08%.
Зафиксированный на Pod SHA-256 адаптера:
`bde343102f06d5e4fe02df953ecce622e2725deb800a0fa57eb34b99d3bf9701`.
Локальная повторная проверка весов дала тот же SHA. JSON sidecar имеет SHA-256
`547b6a41d41c79a064e82a720e30bca33df63fb3d6a6374d9020ccec6d36dfa3`.
Внутренний digest галереи в sidecar определён по slug и SHA изображений,
поэтому отличается по смыслу от SHA-256 всего файла JSONL. Runtime обучения:
Torch `2.8.0+cu128`, CUDA 12.8, NVIDIA GeForce RTX 5090, FP16,
batch size 32. Архив переданного на Pod исходного кода и галереи
`work/runpod/site-training.tar` имеет SHA-256
`d9513e9c7c2cd37ad1fdda17171751a6ed2cb1820cdc445e6e5d0afe0c21db81`;
он фиксирует код, запущенный после commit `833d7cd`, включая тогда ещё не
закоммиченные изменения.

Точная команда обучения на Pod из корня распакованного проекта:

```bash
wine-cv train-adapter \
  --gallery work/vino-svoe/gallery-reviewed-candidates.jsonl \
  --data-root . \
  --output /workspace/models/siglip2-site-label-adapter.safetensors \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device cuda --precision float16 --batch-size 32 \
  --train-views 4 --val-views 1 --rank 64 --epochs 15 \
  --augmentation label-mix-v2 --seed 20260929
```

Прочие гиперпараметры из sidecar: learning rate `3e-4`, weight decay
`1e-4`, temperature `0.05`. Исходный sidecar и веса сохранены в
`work/runpod/models/`.

На том же Pod прогнаны frozen SigLIP и обученный адаптер на *одних и тех же*
59 покрытых фото из однопроходного development pool, галерее 1 936 SKU и
политике эталонов `full-label` (полная бутылка плюс кроп этикетки) / запросов
`full`. Обе сводки и каждое предсказание прошли проверку `field_report score`:
SHA-256 галереи, запросов, ответов и изображений совпали; метрики пересчитаны
по ранжированию, а не приняты из сводки на веру.

| RunPod, 59 покрытых фото | Top-1 = micro-F1@1 | Recall@5 | set-F1@5 | Recall@20 | p50 / p95 поиска | До 3 с |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen SigLIP | 39/59 (66,10%) | 51/59 (86,44%) | 28,81% | 55/59 (93,22%) | 197,03 / 232,25 мс | 59/59 |
| SigLIP + label-mix-v2 адаптер | 41/59 (69,49%) | 53/59 (89,83%) | 29,94% | 55/59 (93,22%) | 198,03 / 237,50 мс | 59/59 |

Адаптер добавил два точных Top-1 и два попадания в Top-5, то есть по
3,39 процентного пункта на этом небольшом наборе; Top-20 не изменился.
Если учитывать также пять подтверждённых, но не представленных в галерее
фото как промахи, точный результат на всех текущих `confirmed` был бы
39/64 (60,94%) и 41/64 (64,06%) соответственно. Это арифметическая
экстраполяция на текущую разметку, а не отдельный прогон или официальный
результат. Ни один вариант не достиг порога ТЗ 90% Top-1 на покрытой части.
Разница по 59 запросам слишком мала для вывода о стабильном преимуществе
адаптера вне этого pool.

Точная команда frozen-бенчмарка на Pod из корня распакованного проекта:

```bash
wine-cv benchmark \
  --pipeline siglip2 \
  --gallery work/vino-svoe/gallery-reviewed-candidates.jsonl --data-root . \
  --manifest work/field-report/reviewed/queries.pool.tsv --images-dir . \
  --labels work/field-report/reviewed/labels.pool.tsv \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device cuda --precision float16 --batch-size 32 \
  --reference-view-mode full-label --query-view-mode full \
  --top-k 20 --warmup 3 --cache-dir work/runpod-eval/cache \
  --cache-policy refresh --offline \
  --output work/runpod-eval/frozen-full-label-predictions.jsonl \
  --summary work/runpod-eval/frozen-full-label-summary.json
```

Точная команда бенчмарка адаптера:

```bash
wine-cv benchmark \
  --pipeline siglip2 \
  --gallery work/vino-svoe/gallery-reviewed-candidates.jsonl --data-root . \
  --manifest work/field-report/reviewed/queries.pool.tsv --images-dir . \
  --labels work/field-report/reviewed/labels.pool.tsv \
  --model-id google/siglip2-base-patch16-384 \
  --model-revision f775b65a79762255128c981547af89addcfe0f88 \
  --device cuda --precision float16 --batch-size 32 \
  --adapter-path /workspace/models/siglip2-site-label-adapter.safetensors \
  --reference-view-mode full-label --query-view-mode full \
  --top-k 20 --warmup 3 --cache-dir work/runpod-eval/cache \
  --cache-policy refresh --offline \
  --output work/runpod-eval/adapter-full-label-predictions.jsonl \
  --summary work/runpod-eval/adapter-full-label-summary.json
```

Локальные копии результатов находятся в `work/runpod/runpod-eval/`. Компактные
предсказания, summary, запросы, ответы, selection и проверенные отчёты с
полным списком ошибок также отслеживаются Git в
`ml/reports/runpod-2026-09-29/`. Predictions JSONL и summary JSON скопированы
из Pod побайтно; в tracked-копии `selection.pool.json` изменены только пути
к копиям TSV внутри этого каталога, после чего `accuracy.json/md` пересчитаны
без изменения метрик. SHA-256 tracked selection —
`dd8d6e1524cdb0ad3dc6d62f983b50a7e66fbe0323439a9ca237c072310b18bf`.
Кеши и веса в отчётный каталог не включены. Для
повторной проверки одного варианта на исторической work-галерее:

```bash
PYTHONPATH=ml/src .venv/bin/python -m wine_cv.field_report score \
  --selection ml/reports/runpod-2026-09-29/selection.pool.json \
  --gallery work/vino-svoe/gallery-reviewed-candidates.jsonl \
  --predictions ml/reports/runpod-2026-09-29/adapter/predictions.jsonl \
  --benchmark-summary ml/reports/runpod-2026-09-29/adapter/summary.json \
  --output-dir work/field-report/recheck-adapter
```

SHA-256 запроса `d0c7ac162c2f06cfb2ae909159be1b120ccba6957a594e0f00e23a8b8462d6be`,
ответов `d2daf031820b5772a51cfae9177802fcc90d1dfa7d6031a2477fe11200e8fbe6`;
предсказаний frozen `0f75c926c686a340baa0c115b36f45931c7edb5001b7c5643edfeb33a9f9762d`,
adapter `7114f96a186613a05a6d8ecc6ecfbe5d93d708693f56cdbca95878fcf2fb3bc7`;
сводок frozen `f57b2f927f6e9d07d0258a0f4a1cfb8f52ac35ef174113dc967a3d30ddb993b1`,
adapter `7740fe820014908e44a461a6c0052b79ed0cca72c1e82c4f9d307490037737ca`.
Ключи кеша эталонов из runtime: frozen
`google_siglip2-base-patch16-384-443bfb0a9319169b6b8f.safetensors`,
adapter `google_siglip2-base-patch16-384-b5d70a2f72e9fbeefa6e.safetensors`;
оба индекса перестроены (`cache_hit=false`). Время построения индекса —
71,06 и 67,91 с соответственно, оно не входит в задержку на запрос.
Среда: образ `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`, Python 3.12.3,
Transformers 5.17.0, Torch 2.8.0+cu128, CUDA 12.8, NVIDIA GeForce RTX 5090.

Внутренний бенчмарк не включает сетевой HTTP-маршрут и рендеринг; задержку
сервиса надо проверять скриптом из `eval/`. Прежний MPS baseline на другой
галерее, 56 фото и другом view policy нельзя напрямую сравнивать с RunPod
как эффект обучения. Разметка на 59 фото всё ещё однопроходная и не
сгруппирована по физическим бутылкам, а шесть известных спорных ответов
ожидают второго ревью. Результат на `not_in_catalog` и независимом
закрытом `test` отсутствует; перед публичным заявлением о точности нужны
второе ревью, группировка и отдельный замороженный тест.
