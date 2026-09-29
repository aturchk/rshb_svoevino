"""Command-line entry point for catalog preparation, benchmarks, and local API."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from .benchmark import run_benchmark
from .catalog import (STRICT_MIN_PIXELS, STRICT_MIN_SHORT_SIDE, build_gallery,
                      build_strict_gallery, read_gallery, write_jsonl)
from .field_data import (export_field_eval, make_catalog_lookup, make_field_template,
                         validate_field_manifest)
from .eval_data import validate_eval_package, validate_eval_predictions
from .pipelines import PIPELINE_NAMES, make_pipeline
from .training import AUGMENTATION_POLICIES
from .views import QUERY_VIEW_MODES, REFERENCE_VIEW_MODES


def add_siglip_arguments(parser: argparse.ArgumentParser, cache_policy: str) -> None:
    parser.add_argument("--model-id", default="google/siglip2-base-patch16-384")
    parser.add_argument("--model-revision", help="Immutable Hugging Face commit; recommended for final runs")
    parser.add_argument("--device", default="auto", help="auto, cuda, cuda:0, mps, or cpu")
    parser.add_argument("--precision", choices=["auto", "float32", "float16", "bfloat16"],
                        default="auto")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--cache-dir", type=Path, default=Path("work/siglip-cache"))
    parser.add_argument("--cache-policy", choices=["auto", "refresh", "require", "off"],
                        default=cache_policy)
    parser.add_argument("--max-num-patches", type=int, default=256,
                        help="NaFlex only; ignored by fixed-resolution checkpoints")
    parser.add_argument("--attn-implementation", default="sdpa")
    parser.add_argument("--offline", action="store_true",
                        help="Forbid model/config downloads and use the local HF cache only")
    parser.add_argument("--adapter-path", type=Path,
                        help="Optional trained low-rank SigLIP adapter (.safetensors)")
    parser.add_argument("--reference-view-mode", choices=REFERENCE_VIEW_MODES,
                        default="full", help="Index full bottles and optional label crops")
    parser.add_argument("--query-view-mode", choices=QUERY_VIEW_MODES,
                        default="full", help="Search full field photo and optional center crop")
    parser.add_argument("--candidate-k", type=int, default=50,
                        help="SigLIP candidates retained by the ORB reranker")
    parser.add_argument("--orb-weight", type=float, default=0.35)
    parser.add_argument("--rrf-k", type=int, default=20)


def pipeline_options(args) -> dict:
    if args.pipeline not in {"siglip2", "siglip2-orb"}:
        return {}
    options = {
        "model_id": args.model_id,
        "revision": args.model_revision,
        "device": args.device,
        "precision": args.precision,
        "batch_size": args.batch_size,
        "cache_dir": args.cache_dir,
        "cache_policy": args.cache_policy,
        "max_num_patches": args.max_num_patches,
        "attn_implementation": args.attn_implementation,
        "offline": args.offline,
        "adapter_path": args.adapter_path,
        "reference_view_mode": args.reference_view_mode,
        "query_view_mode": args.query_view_mode,
    }
    if args.pipeline == "siglip2-orb":
        options.update({"candidate_k": args.candidate_k, "orb_weight": args.orb_weight,
                        "rrf_k": args.rrf_k})
    return options


def add_prepare_arguments(parser: argparse.ArgumentParser, *, strict: bool) -> None:
    parser.add_argument("--csv", type=Path, default=Path("dataset/strapi_output0709.csv"))
    parser.add_argument("--uploads", type=Path, nargs="+", default=[
        Path(f"dataset/prod-svoe-vino-{i}/uploads") for i in (1, 2, 3)])
    parser.add_argument("--data-root", type=Path, default=Path("."))
    if strict:
        parser.add_argument("--output", type=Path, default=Path("work/gallery-strict.jsonl"))
        parser.add_argument("--report", type=Path, default=Path("work/catalog-strict-report.json"))
        parser.add_argument("--min-short-side", type=int, default=STRICT_MIN_SHORT_SIDE)
        parser.add_argument("--min-pixels", type=int, default=STRICT_MIN_PIXELS)
    else:
        parser.add_argument("--output", type=Path, default=Path("work/gallery.jsonl"))
        parser.add_argument("--report", type=Path, default=Path("work/catalog-linkage.json"))


def main() -> None:
    parser = argparse.ArgumentParser(prog="wine-cv")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Deduplicate CSV and link reference photos")
    add_prepare_arguments(prepare, strict=False)
    prepare_strict = commands.add_parser(
        "prepare-strict", help="Build a model gallery with risky references quarantined")
    add_prepare_arguments(prepare_strict, strict=True)

    benchmark = commands.add_parser("benchmark", help="Run a pipeline on query images")
    benchmark.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    benchmark.add_argument("--data-root", type=Path, default=Path("."))
    benchmark.add_argument("--manifest", type=Path, default=Path("eval/queries.tsv"))
    benchmark.add_argument("--images-dir", type=Path, default=Path("eval/queries"))
    benchmark.add_argument("--labels", type=Path)
    benchmark.add_argument("--pipeline", choices=PIPELINE_NAMES, required=True)
    benchmark.add_argument("--output", type=Path, required=True)
    benchmark.add_argument("--summary", type=Path, required=True)
    benchmark.add_argument("--top-k", type=int, default=20)
    benchmark.add_argument("--warmup", type=int, default=1)
    add_siglip_arguments(benchmark, "auto")

    build_index = commands.add_parser("build-index", help="Build and cache gallery embeddings")
    build_index.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    build_index.add_argument("--data-root", type=Path, default=Path("."))
    build_index.add_argument("--pipeline", choices=["siglip2"], default="siglip2")
    add_siglip_arguments(build_index, "refresh")

    train = commands.add_parser(
        "train-adapter", help="Train a conservative low-rank adapter on synthetic field views")
    train.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    train.add_argument("--data-root", type=Path, default=Path("."))
    train.add_argument("--output", type=Path,
                       default=Path("work/models/siglip2-field-adapter.safetensors"))
    train.add_argument("--pipeline", choices=["siglip2"], default="siglip2")
    add_siglip_arguments(train, "off")
    train.add_argument("--train-views", type=int, default=4)
    train.add_argument("--val-views", type=int, default=1)
    train.add_argument("--augmentation", choices=AUGMENTATION_POLICIES,
                       default="full-v1", help="Synthetic views used for adapter training")
    train.add_argument("--rank", type=int, default=64)
    train.add_argument("--epochs", type=int, default=15)
    train.add_argument("--learning-rate", type=float, default=3e-4)
    train.add_argument("--weight-decay", type=float, default=1e-4)
    train.add_argument("--temperature", type=float, default=0.05)
    train.add_argument("--seed", type=int, default=20260928)

    proxy = commands.add_parser(
        "make-proxy-eval", help="Create deterministic synthetic queries for regression testing")
    proxy.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    proxy.add_argument("--data-root", type=Path, default=Path("."))
    proxy.add_argument("--output-dir", type=Path, default=Path("work/proxy-eval"))
    proxy.add_argument("--seed", type=int, default=20260929)
    proxy.add_argument("--limit", type=int)

    serve = commands.add_parser("serve", help="Start local endpoint for participant_test.sh")
    serve.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    serve.add_argument("--data-root", type=Path, default=Path("."))
    serve.add_argument("--pipeline", choices=PIPELINE_NAMES, required=True)
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)
    serve.add_argument("--max-upload-mb", type=int, default=12)
    serve.add_argument("--product-top-k", type=int, default=5)
    serve.add_argument("--not-found-score-threshold", type=float)
    serve.add_argument("--matched-score-threshold", type=float)
    serve.add_argument("--matched-margin-threshold", type=float)
    serve.add_argument("--threshold-version")
    add_siglip_arguments(serve, "require")

    field_template = commands.add_parser(
        "make-field-template", help="Create a manual annotation sheet and catalog lookup")
    field_template.add_argument("--images-dir", type=Path, default=Path("dataset/real_photo"))
    field_template.add_argument("--data-root", type=Path, default=Path("."))
    field_template.add_argument("--output", type=Path, default=Path("data/field_mapping.tsv"))
    field_template.add_argument("--lookup-output", type=Path, default=Path("data/catalog_lookup.tsv"))
    field_template.add_argument("--catalog-csv", type=Path,
                                default=Path("dataset/strapi_output0709.csv"))
    field_template.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    field_template.add_argument("--source-kind", default="field")
    field_template.add_argument("--force", action="store_true")

    validate_field = commands.add_parser("validate-field", help="Validate manual field-photo labels")
    validate_field.add_argument("--manifest", type=Path, default=Path("data/field_mapping.tsv"))
    validate_field.add_argument("--data-root", type=Path, default=Path("."))
    validate_field.add_argument("--catalog-csv", type=Path,
                                default=Path("dataset/strapi_output0709.csv"))
    validate_field.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    validate_field.add_argument("--report", type=Path)

    export_field = commands.add_parser("export-field-eval", help="Export a validated dev/test benchmark")
    export_field.add_argument("--manifest", type=Path, default=Path("data/field_mapping.tsv"))
    export_field.add_argument("--data-root", type=Path, default=Path("."))
    export_field.add_argument("--catalog-csv", type=Path,
                              default=Path("dataset/strapi_output0709.csv"))
    export_field.add_argument("--gallery", type=Path, default=Path("work/gallery-strict.jsonl"))
    export_field.add_argument("--split", choices=["dev", "test"], required=True)
    export_field.add_argument("--output-dir", type=Path, default=Path("work/field-eval"))

    validate_eval = commands.add_parser(
        "validate-eval-package", help="Validate a sealed organizer query package")
    validate_eval.add_argument("--manifest", type=Path, required=True)
    validate_eval.add_argument("--images-dir", type=Path, required=True)
    validate_eval.add_argument("--report", type=Path)

    validate_predictions = commands.add_parser(
        "validate-eval-predictions", help="Validate organizer-compatible prediction JSONL")
    validate_predictions.add_argument("--manifest", type=Path, required=True)
    validate_predictions.add_argument("--images-dir", type=Path, required=True)
    validate_predictions.add_argument("--predictions", type=Path, required=True)
    validate_predictions.add_argument("--catalog-csv", type=Path,
                                      default=Path("dataset/strapi_output0709.csv"))
    validate_predictions.add_argument("--report", type=Path)
    args = parser.parse_args()

    if args.command in {"prepare", "prepare-strict"}:
        if args.command == "prepare-strict":
            gallery, report = build_strict_gallery(
                args.csv, args.uploads, args.data_root,
                min_short_side=args.min_short_side, min_pixels=args.min_pixels)
        else:
            gallery, report = build_gallery(args.csv, args.uploads, args.data_root)
        write_jsonl(args.output, gallery)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items()
                          if key not in {"issues", "slug_match_candidates", "shared_assets",
                                         "shared_content", "semantic_ambiguity_groups",
                                         "strict_exclusions"}},
                         ensure_ascii=False))
    elif args.command == "benchmark":
        summary = run_benchmark(args.gallery, args.manifest, args.images_dir,
                                args.pipeline, args.output, args.summary, args.labels,
                                data_root=args.data_root,
                                pipeline_options=pipeline_options(args), top_k=args.top_k,
                                warmup=args.warmup)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    elif args.command == "build-index":
        pipeline = make_pipeline(args.pipeline, **pipeline_options(args))
        started = time.perf_counter()
        pipeline.fit(read_gallery(args.gallery, args.data_root))
        if hasattr(pipeline, "synchronize"):
            pipeline.synchronize()
        result = pipeline.metadata() if hasattr(pipeline, "metadata") else {}
        result["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "train-adapter":
        from .training import train_adapter
        if args.adapter_path:
            raise ValueError("--adapter-path is not valid while training a new adapter")
        gallery = read_gallery(args.gallery, args.data_root)
        result = train_adapter(
            gallery, args.output, model_id=args.model_id, revision=args.model_revision,
            device=args.device, precision=args.precision, batch_size=args.batch_size,
            max_num_patches=args.max_num_patches,
            attn_implementation=args.attn_implementation, offline=args.offline,
            train_views=args.train_views, val_views=args.val_views, rank=args.rank,
            epochs=args.epochs, learning_rate=args.learning_rate,
            weight_decay=args.weight_decay, temperature=args.temperature, seed=args.seed,
            augmentation=args.augmentation)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "make-proxy-eval":
        from .training import make_proxy_eval
        result = make_proxy_eval(read_gallery(args.gallery, args.data_root),
                                 args.output_dir, seed=args.seed, limit=args.limit)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "serve":
        try:
            import uvicorn
        except ImportError as error:
            raise RuntimeError("Install API dependencies: pip install -e './ml[api]'") from error
        from .api import create_app
        threshold_values = (
            args.not_found_score_threshold,
            args.matched_score_threshold,
            args.matched_margin_threshold,
        )
        if any(value is not None for value in threshold_values):
            if not all(value is not None for value in threshold_values):
                raise ValueError("All three calibrated thresholds must be supplied together")
            thresholds = {
                "not_found_score": args.not_found_score_threshold,
                "matched_score": args.matched_score_threshold,
                "matched_margin": args.matched_margin_threshold,
            }
        else:
            thresholds = None
        uvicorn.run(
            create_app(
                args.gallery,
                args.pipeline,
                args.data_root,
                pipeline_options(args),
                max_upload_bytes=args.max_upload_mb * 1024 * 1024,
                product_top_k=args.product_top_k,
                thresholds=thresholds,
                threshold_version=args.threshold_version,
            ),
            host=args.host,
            port=args.port,
            workers=1,
        )
    elif args.command == "make-field-template":
        count = make_field_template(args.images_dir, args.data_root, args.output,
                                    args.source_kind, args.force)
        lookup_count = make_catalog_lookup(args.catalog_csv, args.gallery, args.lookup_output)
        print(json.dumps({"field_rows": count, "manifest": str(args.output),
                          "catalog_rows": lookup_count, "lookup": str(args.lookup_output)},
                         ensure_ascii=False, indent=2))
    elif args.command == "validate-field":
        report = validate_field_manifest(args.manifest, args.data_root,
                                         args.catalog_csv, args.gallery)
        rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(rendered, encoding="utf-8")
        print(rendered, end="")
        if not report["valid"]:
            raise SystemExit(1)
    elif args.command == "export-field-eval":
        receipt = export_field_eval(args.manifest, args.data_root, args.catalog_csv,
                                    args.gallery, args.split, args.output_dir)
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
    elif args.command == "validate-eval-package":
        result = validate_eval_package(args.manifest, args.images_dir)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(
                json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        result = validate_eval_predictions(
            args.manifest, args.images_dir, args.predictions, args.catalog_csv)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(
                json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
