# ML status: сильный reproducible candidate, field-quality ещё не доказана

Snapshot: **29 сентября 2026**. Этот каталог — компактный source-backed набор для презентации и технического due diligence.

## Executive summary

- Из 4 147 строк каталога удалено 2 044 полных дубля; осталось 2 103 SKU.
- Строгая searchable gallery содержит 928 SKU / 928 уникальных изображений — 44,13% каталога. Остальные 1 175 SKU модель сейчас вернуть не может.
- Production candidate: pinned SigLIP 2 + rank-64 adapter + exact cosine retrieval. ORB по умолчанию выключен.
- Adapter-SigLIP показал **94,07% Top-1, 99,89% Recall@5 и p95 84,89 мс** на отдельном synthetic JPEG proxy из 928 запросов.
- ORB поднял Top-1 только до 94,18% (+0,108 п.п.), но увеличил p95 до 133,50 мс (+48,61 мс).
- Это **не точность на фото из магазинов**. Ручной pool просмотрен, но официального test ещё нет; field Top-1, OOD/rejection и production thresholds не измерены.
- Reference GPU runtime закреплён: model revision, BF16, CUDA/PyTorch/Transformers, gallery/cache/adapter hashes. 11/11 сохранённых SHA-256 были проверены локально; production launch теперь полностью host-local.

## Что можно честно говорить на слайде

> Воспроизводимый SigLIP 2 pipeline достиг 94,1% Top-1 на synthetic regression proxy при p95 84,9 мс. Продовый default выбран без ORB. 100 полевых фото просмотрены вручную; официальный frozen acceptance test ожидается 1 октября.

Нельзя говорить: «точность на фото из магазинов — 94,1%» или «распознаём весь каталог».

## Содержимое

| Файл | Для чего |
|---|---|
| [storyline.md](storyline.md) | готовый сценарий шести слайдов |
| [status.json](status.json) | machine-readable snapshot с claim boundaries |
| [metrics.csv](metrics.csv) | chart-ready сравнение качества и latency |
| [training-curve.csv](training-curve.csv) | 15 эпох adapter training |
| [model-card.md](model-card.md) | intended use, runtime и ограничения |
| [architecture.mmd](architecture.mmd) | редактируемая Mermaid-схема |
| `README-assets/*.svg` | готовые векторные иллюстрации |
| `evidence/*.json` | неизменённые первичные evidence-файлы |
| `MANIFEST.sha256` | контроль целостности всего dump |

## Release decision

Инженерная часть и acceptance runner готовы. Заявление о production-quality блокируют
официальный закрытый test и trusted references для 1 175 SKU вне strict gallery. В
ручном pool: 64 exact-SKU, 35 отсутствующих в каталоге и 1 uncertain; лишь 23 из 64
подтверждений доступны текущему индексу.
