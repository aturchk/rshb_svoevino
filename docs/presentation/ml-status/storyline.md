# Сторилайн презентации: 6 слайдов

## 1. Из сырого экспорта — в проверяемый индекс

4 147 строк исходного CSV содержали 2 044 полных дубля. Детерминированный linkage и quarantine не меняют source images, фиксируют SHA-256 и отделяют missing, ambiguous и shared media.

**Визуал:** 4 147 → 2 103 unique SKU → 1 014 linked → 928 strict.

## 2. Почему модель видит 928, а не 2 103 товара

Strict gallery покрывает 44,13% каталога. Мы исключили semantic collisions и low-resolution references вместо того, чтобы обучать на потенциально неверных парах. Это повышает доверие к индексу, но ограничивает recall по полному каталогу.

**Визуал:** `README-assets/readiness-gates.svg`.

## 3. Архитектура production candidate

Полевое фото проходит официальную SigLIP 2 preprocessing, frozen vision tower и rank-64 residual adapter. 768-мерный embedding сравнивается exact cosine с 928 gallery embeddings. ORB может rerank только Top-50, но выключен по умолчанию.

**Визуал:** `architecture.mmd`.

## 4. Что уже доказано

Pinned model revision, deterministic seeds, offline cache, hash-validated artifacts и один и тот же контракт для benchmark и API. RunPod: RTX PRO 4500 Blackwell, BF16, PyTorch 2.8.0+cu128, CUDA 12.8, Transformers 5.17.0. Все 928 proxy-запросов уложились в 3 секунды.

**Визуал:** `README-assets/training-curve.svg`.

## 5. Почему ORB не вошёл в default

Adapter-SigLIP: 94,07% Top-1, p95 84,89 мс. С ORB: 94,18%, p95 133,50 мс. Улучшение +0,108 п.п. не оправдывает +48,61 мс на synthetic proxy.

**Визуал:** `README-assets/latency-vs-quality.svg`.

## 6. Следующий честный acceptance gate

100 real photos нужно разметить по exact SKU, заморозить bottle-grouped dev/test split и измерить Top-1, Recall@5, latency и rejection. После этого фиксируются threshold version и решение по ORB. Параллельно нужен trusted reference plan для 1 175 SKU вне индекса.

**Финальная фраза:** модель и deployment-путь готовы к проверке; production-accuracy будет фактом только после field benchmark.
