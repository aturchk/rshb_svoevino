"""Reproducible diagnostic reports for reviewed real field photos.

The current annotation pool is single reviewed and has no frozen test split.
Reports produced from it are development diagnostics, never official scores.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path

from .catalog import read_jsonl
from .field_data import read_field_manifest, validate_field_manifest


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_tsv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows({field: row[field] for field in fields} for row in rows)


def prepare_field_sample(manifest: Path, catalog_csv: Path, gallery: Path,
                         data_root: Path, split: str, output_dir: Path) -> dict:
    """Export exact-SKU real photos, with an audit of every excluded row."""
    if split not in {"pool", "dev", "test"}:
        raise ValueError("split must be pool, dev or test")
    validation = validate_field_manifest(manifest, data_root, catalog_csv, gallery)
    if not validation["valid"]:
        raise ValueError(f"Field manifest is invalid: {validation['errors'][:3]}")
    rows, _ = read_field_manifest(manifest)
    gallery_rows = read_jsonl(gallery)
    gallery_slugs = {row["slug"] for row in gallery_rows}
    if len(gallery_slugs) != len(gallery_rows):
        raise ValueError("Gallery contains duplicate slugs")
    gallery_review_counts = Counter(
        str(row.get("review_status") or "unspecified") for row in gallery_rows)
    gallery_hashes = {row.get("image_sha256") for row in gallery_rows}
    selected: list[dict[str, str]] = []
    excluded: Counter[str] = Counter()
    confirmed_original_reviewed = 0
    covered_confirmed_original_reviewed = 0
    ungrouped_selected_count = 0
    review_counts: Counter[str] = Counter()
    for row in rows:
        if row["split"].strip() != split:
            continue
        source = row["source_kind"].strip()
        label = row["label_status"].strip()
        review = row["review_status"].strip()
        slug = row["true_slug"].strip()
        review_counts[review] += 1
        if source not in {"field", "organizer"}:
            excluded["derived_or_synthetic"] += 1
            continue
        if review not in {"single_reviewed", "double_agreed", "adjudicated"}:
            excluded["not_reviewed"] += 1
            continue
        if label != "confirmed":
            excluded[label or "unlabeled"] += 1
            continue
        confirmed_original_reviewed += 1
        if slug not in gallery_slugs:
            excluded["not_indexed"] += 1
            continue
        covered_confirmed_original_reviewed += 1
        if row["image_sha256"].strip() in gallery_hashes:
            excluded["identical_to_reference"] += 1
            continue
        selected.append({
            "query_id": row["query_id"].strip(),
            "image_path": row["image_path"].strip(),
            "image_sha256": row["image_sha256"].strip(),
            "slug": slug,
            "review_status": review,
        })
        if not row["bottle_group_id"].strip():
            ungrouped_selected_count += 1
    if not selected:
        raise ValueError(f"No eligible real photos in split {split}")
    output_dir.mkdir(parents=True, exist_ok=True)
    queries = output_dir / f"queries.{split}.tsv"
    labels = output_dir / f"labels.{split}.tsv"
    _write_tsv(queries, ["query_id", "image_path"], selected)
    _write_tsv(labels, ["query_id", "slug"], selected)
    selection = {
        "schema_version": 1,
        "split": split,
        "evidence_level": "single_reviewed_development_diagnostic" if split == "pool"
                          else "reviewed_split",
        "field_manifest": str(manifest),
        "field_manifest_sha256": _sha256(manifest),
        "catalog_csv_sha256": _sha256(catalog_csv),
        "gallery_sha256": _sha256(gallery),
        "query_manifest_sha256": _sha256(queries),
        "labels_sha256": _sha256(labels),
        "gallery_slug_count": len(gallery_slugs),
        "gallery_review_status_counts": dict(gallery_review_counts),
        "confirmed_original_reviewed": confirmed_original_reviewed,
        "covered_confirmed_original_reviewed": covered_confirmed_original_reviewed,
        "selected_count": len(selected),
        "ungrouped_selected_count": ungrouped_selected_count,
        "excluded": dict(excluded),
        "review_status_counts": dict(review_counts),
        "queries": str(queries),
        "labels": str(labels),
        "rows": selected,
    }
    selection_path = output_dir / f"selection.{split}.json"
    selection_path.write_text(json.dumps(selection, ensure_ascii=False, indent=2) + "\n",
                              encoding="utf-8")
    return selection


def _load_jsonl(path: Path) -> list[dict]:
    records = []
    with path.open(encoding="utf-8") as file:
        for line, raw in enumerate(file, 1):
            if not raw.strip():
                continue
            record = json.loads(raw)
            if not isinstance(record, dict):
                raise ValueError(f"Prediction line {line} is not an object")
            records.append(record)
    return records


def _percent(value: float) -> str:
    return f"{100 * value:.1f}%"


def score_field_sample(selection_path: Path, gallery: Path, predictions: Path,
                       benchmark_summary: Path, output_dir: Path) -> dict:
    """Verify benchmark provenance and compute the brief's retrieval metrics."""
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    summary = json.loads(benchmark_summary.read_text(encoding="utf-8"))
    if _sha256(Path(selection["field_manifest"])) != selection["field_manifest_sha256"]:
        raise ValueError("Field annotations changed after sample export")
    if _sha256(gallery) != selection["gallery_sha256"]:
        raise ValueError("Gallery changed after field sample export")
    for key, path_key in (("query_manifest_sha256", "queries"),
                          ("labels_sha256", "labels")):
        if _sha256(Path(selection[path_key])) != selection[key]:
            raise ValueError(f"{path_key} changed after field sample export")
    for key in ("gallery_sha256", "query_manifest_sha256", "labels_sha256"):
        if summary.get(key) != selection[key]:
            raise ValueError(f"Benchmark {key} does not match field sample")
    if summary.get("labels_available") is not True:
        raise ValueError("Benchmark lacks answer labels")
    if summary.get("query_count") != selection["selected_count"]:
        raise ValueError("Benchmark query count does not match field sample")
    depth = summary.get("ranking_depth")
    if not isinstance(depth, int) or depth < 5:
        raise ValueError("Benchmark ranking depth must be at least five")
    gallery_slugs = {row["slug"] for row in read_jsonl(gallery)}
    expected = {row["query_id"]: row for row in selection["rows"]}
    records = _load_jsonl(predictions)
    if len(records) != len(expected):
        raise ValueError("Prediction count does not match field sample")
    seen: set[str] = set()
    latencies: list[float] = []
    hits_at_1 = hits_at_5 = hits_at_20 = 0
    f1_at_5: list[float] = []
    errors: list[dict] = []
    for record in records:
        query_id = record.get("query_id")
        if query_id not in expected or query_id in seen:
            raise ValueError(f"Unknown or duplicate query_id: {query_id!r}")
        seen.add(query_id)
        answer = expected[query_id]
        if (record.get("image_path") != answer["image_path"] or
                record.get("image_sha256") != answer["image_sha256"] or
                record.get("true_slug", answer["slug"]) != answer["slug"]):
            raise ValueError(f"Prediction identity/label mismatch: {query_id}")
        latency = record.get("latency_ms")
        if (isinstance(latency, bool) or not isinstance(latency, (int, float)) or
                not math.isfinite(latency) or latency < 0):
            raise ValueError(f"Invalid latency: {query_id}")
        latencies.append(float(latency))
        ranking = record.get("ranking")
        if not isinstance(ranking, list) or not ranking or len(ranking) > depth:
            raise ValueError(f"Invalid ranking: {query_id}")
        ranked_slugs = [item.get("slug") for item in ranking if isinstance(item, dict)]
        if (len(ranked_slugs) != len(ranking) or
                len(set(ranked_slugs)) != len(ranked_slugs) or
                any(slug not in gallery_slugs for slug in ranked_slugs)):
            raise ValueError(f"Invalid or duplicate ranked slug: {query_id}")
        if record.get("predicted_slug") != ranked_slugs[0]:
            raise ValueError(f"Top-1 does not match ranking: {query_id}")
        hit1 = ranked_slugs[0] == answer["slug"]
        hit5 = answer["slug"] in ranked_slugs[:5]
        hit20 = answer["slug"] in ranked_slugs[:20]
        hits_at_1 += hit1
        hits_at_5 += hit5
        hits_at_20 += hit20
        f1_at_5.append(2 / (min(5, len(ranked_slugs)) + 1) if hit5 else 0.0)
        if not hit1:
            errors.append({"query_id": query_id, "true_slug": answer["slug"],
                           "predicted_slug": ranked_slugs[0], "in_top5": hit5,
                           "in_top20": hit20})
    n = len(records)
    ordered_latencies = sorted(latencies)
    covered = selection["covered_confirmed_original_reviewed"]
    confirmed = selection["confirmed_original_reviewed"]
    metrics = {
        "top1_accuracy": hits_at_1 / n,
        "micro_f1_at_1": hits_at_1 / n,
        "recall_at_5": hits_at_5 / n,
        "recall_at_20": hits_at_20 / n if depth >= 20 else None,
        "mean_set_f1_at_5": statistics.mean(f1_at_5),
        "mean_latency_ms": statistics.mean(latencies),
        "p50_latency_ms": statistics.median(latencies),
        "p95_latency_ms": ordered_latencies[math.ceil(0.95 * n) - 1],
        "within_3s_rate": sum(value <= 3000 for value in latencies) / n,
        "gallery_coverage_of_confirmed": covered / confirmed if confirmed else None,
        "retrieval_only_top1_ceiling_on_confirmed": covered / confirmed if confirmed else None,
    }
    for summary_key, metric_key in (
            ("top1_accuracy", "top1_accuracy"),
            ("micro_f1_at_1", "micro_f1_at_1"),
            ("recall_at_5", "recall_at_5"),
            ("recall_at_20", "recall_at_20"),
            ("mean_f1_at_5", "mean_set_f1_at_5")):
        reported = summary.get(summary_key)
        measured = metrics[metric_key]
        if reported is not None and measured is not None and not math.isclose(
                float(reported), measured, abs_tol=0.00001):
            raise ValueError(f"Benchmark {summary_key} contradicts predictions")
    report = {
        "schema_version": 1,
        "split": selection["split"],
        "evidence_level": selection["evidence_level"],
        "pipeline": summary.get("pipeline"),
        "pipeline_runtime": summary.get("pipeline_runtime"),
        "sample_size": n,
        "ungrouped_selected_count": selection["ungrouped_selected_count"],
        "confirmed_original_reviewed": confirmed,
        "covered_confirmed_original_reviewed": covered,
        "excluded": selection["excluded"],
        "review_status_counts": selection["review_status_counts"],
        "gallery_review_status_counts": selection["gallery_review_status_counts"],
        "hits_at_1": hits_at_1,
        "hits_at_5": hits_at_5,
        "hits_at_20": hits_at_20 if depth >= 20 else None,
        "answer_rank_buckets": {
            "rank_1": hits_at_1,
            "rank_2_to_5": hits_at_5 - hits_at_1,
            "rank_6_to_20": hits_at_20 - hits_at_5 if depth >= 20 else None,
            "below_20": n - hits_at_20 if depth >= 20 else None,
        },
        "metrics": metrics,
        "errors": errors,
        "provenance": {
            "selection_sha256": _sha256(selection_path),
            "gallery_sha256": selection["gallery_sha256"],
            "field_manifest_sha256": selection["field_manifest_sha256"],
            "catalog_csv_sha256": selection["catalog_csv_sha256"],
            "query_manifest_sha256": selection["query_manifest_sha256"],
            "labels_sha256": selection["labels_sha256"],
            "predictions_sha256": _sha256(predictions),
            "benchmark_summary_sha256": _sha256(benchmark_summary),
        },
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "accuracy.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    scope = ("Однопроходная разметка, development pool; не официальный test."
             if selection["split"] == "pool" else
             "Проверенный split; сравнивать с официальным test можно только при одинаковом протоколе.")
    runtime = report["pipeline_runtime"] or {}
    runtime_fields = ("model_id", "resolved_revision", "device", "precision", "torch",
                      "cuda_runtime", "cuda_device_name", "adapter_sha256",
                      "reference_view_mode", "query_view_mode", "view_transform_version")
    runtime_lines = [f"- {key}: `{runtime[key]}`" for key in runtime_fields
                     if runtime.get(key) is not None]
    coverage_note = (
        "Даже идеальное ранжирование этой галереи не может достичь цели 90% на всех "
        "текущих confirmed-фото."
        if metrics["retrieval_only_top1_ceiling_on_confirmed"] < 0.9 else
        "Покрытие галереи само по себе не препятствует цели 90% на текущей разметке."
    )
    lines = [
        "# Метрики поиска вина по полевым фото",
        "",
        f"**Статус:** {scope}",
        "",
        f"Пайплайн: `{report['pipeline']}`. Размеченных запросов в прогоне: **{n}**; "
        f"подтверждённых оригинальных полевых фото в группе: **{confirmed}**. "
        f"По текущей разметке галерея покрывает **{covered}/{confirmed} "
        f"({_percent(metrics['gallery_coverage_of_confirmed'])})** подтверждённых фото. "
        "Это предварительная верхняя граница Top-1 для поиска только по этой галерее; "
        f"она изменится при исправлении ошибочных ответов или ссылок на фото. {coverage_note}",
        "",
        "| Показатель из ТЗ / диагностический | Результат |",
        "| --- | ---: |",
        f"| Точные совпадения Top-1 | {hits_at_1}/{n} ({_percent(metrics['top1_accuracy'])}) |",
        f"| Micro-F1@1 | {_percent(metrics['micro_f1_at_1'])} |",
        f"| Recall@5 | {hits_at_5}/{n} ({_percent(metrics['recall_at_5'])}) |",
        f"| Средний set-F1@5 | {_percent(metrics['mean_set_f1_at_5'])} |",
        f"| Recall@20 | {str(hits_at_20) + '/' + str(n) + ' (' + _percent(metrics['recall_at_20']) + ')' if depth >= 20 else 'не измерен: ranking_depth < 20'} |",
        f"| p50 / p95 поиска | {metrics['p50_latency_ms']:.1f} / {metrics['p95_latency_ms']:.1f} мс |",
        f"| Ответы до 3 секунд | {_percent(metrics['within_3s_rate'])} |",
        "",
        (f"Ранг правильного ответа: №1 — {hits_at_1}; места 2–5 — "
         f"{hits_at_5 - hits_at_1}; места 6–20 — {hits_at_20 - hits_at_5}; "
         f"ниже 20-го места — {n - hits_at_20}." if depth >= 20 else
         f"Ранг правильного ответа: №1 — {hits_at_1}; места 2–5 — "
         f"{hits_at_5 - hits_at_1}."),
        "",
        "Micro-F1@1 равен доле точных ответов, потому что на каждый запрос требуется ровно один slug. "
        "Set-F1@5 считается для множества первых пяти кандидатов и одного правильного slug: "
        "2/(k+1) при попадании, иначе 0; k — фактическое число кандидатов (не более 5). "
        "При пяти кандидатах его максимум — 33,3%, поэтому для поиска Top-5 рядом дан Recall@5. "
        "Балл сходства и отрыв между кандидатами не являются F1 или вероятностью правильного ответа.",
        "",
        f"Цель ТЗ: 90–100% точных совпадений и ответ до 3 секунд. "
        f"Текущий прогон {'достигает' if metrics['top1_accuracy'] >= 0.9 else 'не достигает'} "
        "порога 90% на покрытой части; этот результат нельзя переносить на официальный приватный набор.",
        "",
        f"Исключения из этой группы: `{json.dumps(selection['excluded'], ensure_ascii=False)}`. "
        "Отказы на отсутствующих в каталоге винах, ошибки похожих серий и задержка полного HTTP-сервиса "
        "этим прогоном не измерены.",
        "",
        "Разметка и связи сайта с фотографиями ещё проходят аудит: "
        f"review-статусы полевых фото `{json.dumps(selection['review_status_counts'], ensure_ascii=False)}`, "
        f"галереи `{json.dumps(selection['gallery_review_status_counts'], ensure_ascii=False)}`. "
        f"Без `bottle_group_id` осталось {selection['ungrouped_selected_count']} из {n} "
        "запросов; независимость похожих кадров не подтверждена. "
        "Подозрительные SKU/годы нужно перепроверить по исходной карточке и этикетке, затем пересчитать отчёт. "
        "Ни этот pool, ни фотографии каталога нельзя выдавать за закрытую контрольную выборку.",
        "",
        "## Воспроизводимость",
        "",
        f"- SHA-256 галереи: `{selection['gallery_sha256']}`",
        f"- SHA-256 разметки: `{selection['field_manifest_sha256']}`",
        f"- SHA-256 каталога CSV: `{selection['catalog_csv_sha256']}`",
        f"- SHA-256 списка запросов: `{selection['query_manifest_sha256']}`",
        f"- SHA-256 ответов: `{selection['labels_sha256']}`",
        f"- SHA-256 предсказаний: `{report['provenance']['predictions_sha256']}`",
        f"- SHA-256 сводки бенчмарка: `{report['provenance']['benchmark_summary_sha256']}`",
        "",
    ]
    if runtime_lines:
        lines.extend(["Модель и оборудование:", "", *runtime_lines, ""])
    (output_dir / "accuracy.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m wine_cv.field_report")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Export reviewed real-photo queries")
    prepare.add_argument("--manifest", type=Path, default=Path("data/field_mapping.tsv"))
    prepare.add_argument("--catalog-csv", type=Path,
                         default=Path("dataset/strapi_output0709.csv"))
    prepare.add_argument("--gallery", type=Path, required=True)
    prepare.add_argument("--data-root", type=Path, default=Path("."))
    prepare.add_argument("--split", choices=["pool", "dev", "test"], default="pool")
    prepare.add_argument("--output-dir", type=Path, default=Path("work/field-report"))
    score = commands.add_parser("score", help="Verify predictions and write accuracy report")
    score.add_argument("--selection", type=Path, required=True)
    score.add_argument("--gallery", type=Path, required=True)
    score.add_argument("--predictions", type=Path, required=True)
    score.add_argument("--benchmark-summary", type=Path, required=True)
    score.add_argument("--output-dir", type=Path, default=Path("work/field-report"))
    args = parser.parse_args()
    if args.command == "prepare":
        result = prepare_field_sample(args.manifest, args.catalog_csv, args.gallery,
                                      args.data_root, args.split, args.output_dir)
        print(json.dumps({key: value for key, value in result.items() if key != "rows"},
                         ensure_ascii=False, indent=2))
    else:
        result = score_field_sample(args.selection, args.gallery, args.predictions,
                                    args.benchmark_summary, args.output_dir)
        print(json.dumps({key: value for key, value in result.items() if key != "errors"},
                         ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
