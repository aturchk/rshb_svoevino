"""Conservative SigLIP adapter training and deterministic proxy evaluation."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from .siglip import Siglip2Pipeline
from .views import VIEW_TRANSFORM_VERSION, reference_views


ADAPTER_FORMAT_VERSION = 1
AUGMENTATION_POLICIES = ("full-v1", "label-mix-v2")


def gallery_digest(gallery: list[dict]) -> str:
    payload = [{"slug": item["slug"], "sha256": item["image_sha256"]} for item in gallery]
    return hashlib.sha256(json.dumps(payload, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def field_augment(image: Image.Image, seed: int) -> Image.Image:
    """Apply mild deterministic distortions that resemble a handheld shelf photo."""
    rng = random.Random(seed)
    image = ImageOps.exif_transpose(image).convert("RGB")
    if max(image.size) > 1024:
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    width, height = image.size

    zoom = rng.uniform(0.78, 0.98)
    crop_w, crop_h = max(2, round(width * zoom)), max(2, round(height * zoom))
    left = rng.randint(0, max(0, width - crop_w))
    top = rng.randint(0, max(0, height - crop_h))
    image = image.crop((left, top, left + crop_w, top + crop_h)).resize(
        (width, height), Image.Resampling.BICUBIC)
    image = image.rotate(rng.uniform(-9.0, 9.0), Image.Resampling.BICUBIC,
                         expand=False, fillcolor=(245, 245, 245))
    image = ImageEnhance.Brightness(image).enhance(rng.uniform(0.72, 1.24))
    image = ImageEnhance.Contrast(image).enhance(rng.uniform(0.78, 1.28))
    image = ImageEnhance.Color(image).enhance(rng.uniform(0.78, 1.18))
    if rng.random() < 0.45:
        image = image.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 1.3)))

    if rng.random() < 0.35:
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        x = rng.randint(0, max(0, width - 1))
        band = max(2, round(width * rng.uniform(0.01, 0.035)))
        draw.polygon([(x, 0), (min(width, x + band), 0),
                      (max(0, x - band), height), (max(0, x - 2 * band), height)],
                     fill=(255, 255, 255, rng.randint(25, 75)))
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    if rng.random() < 0.25:
        draw = ImageDraw.Draw(image)
        box_w = max(2, round(width * rng.uniform(0.02, 0.07)))
        box_h = max(2, round(height * rng.uniform(0.02, 0.07)))
        x = rng.randint(0, max(0, width - box_w))
        y = rng.randint(0, max(0, height - box_h))
        draw.rectangle((x, y, x + box_w, y + box_h), fill=(235, 235, 235))
    return image


def label_field_augment(image: Image.Image, seed: int) -> Image.Image:
    """Mix whole bottles and source-pixel label crops; never use field/test photos."""
    rng = random.Random(seed)
    base = ImageOps.exif_transpose(image).convert("RGB")
    try:
        views = reference_views(base, "full-mid-label")
    finally:
        base.close()
    try:
        # Whole-bottle views keep the original domain represented, while label
        # crops teach the small adapter about the close framing seen in shops.
        choice = rng.choices((0, 1, 2), weights=(4, 3, 3), k=1)[0]
        return field_augment(views[choice], seed + 1_000_003)
    finally:
        for view in views:
            view.close()


def _encode_views(pipeline: Siglip2Pipeline, gallery: list[dict], views: int,
                  seed: int, stage: str, augmentation: str):
    torch = pipeline._torch
    features = []
    labels = []
    pending = []
    pending_labels = []

    def flush() -> None:
        if not pending:
            return
        features.append(pipeline._encode_images(pending))
        labels.extend(pending_labels)
        for current in pending:
            current.close()
        pending.clear()
        pending_labels.clear()

    augment = (field_augment if augmentation == "full-v1" else label_field_augment)
    for label, item in enumerate(gallery):
        with Image.open(item["image_path"]) as source:
            source.load()
            for view in range(views):
                view_seed = seed + label * 1009 + view * 9176
                pending.append(augment(source, view_seed))
                pending_labels.append(label)
                if len(pending) >= pipeline.batch_size:
                    flush()
        if (label + 1) % 100 == 0 or label + 1 == len(gallery):
            print(f"{stage}: encoded {label + 1}/{len(gallery)} catalog items", flush=True)
    flush()
    return torch.cat(features, dim=0), torch.tensor(labels, dtype=torch.long)


def _adapt(torch, features, down, up, scale):
    residual = (features @ down.T) @ up.T
    return torch.nn.functional.normalize(features + scale * residual, p=2, dim=-1)


def _accuracy(torch, queries, labels, prototypes, batch_size: int = 512) -> dict:
    top1 = 0
    top5 = 0
    for start in range(0, len(labels), batch_size):
        scores = queries[start:start + batch_size] @ prototypes.T
        indices = scores.topk(min(5, scores.shape[1]), dim=1).indices.cpu()
        truth = labels[start:start + batch_size].cpu().unsqueeze(1)
        top1 += int((indices[:, :1] == truth).any(dim=1).sum())
        top5 += int((indices == truth).any(dim=1).sum())
    return {"top1_accuracy": top1 / len(labels), "recall_at_5": top5 / len(labels)}


def train_adapter(gallery: list[dict], output: Path, *, model_id: str,
                  revision: str | None, device: str, precision: str, batch_size: int,
                  max_num_patches: int, attn_implementation: str, offline: bool,
                  train_views: int = 4, val_views: int = 1, rank: int = 64,
                  epochs: int = 15, learning_rate: float = 3e-4,
                  weight_decay: float = 1e-4, temperature: float = 0.05,
                  seed: int = 20260928, augmentation: str = "full-v1") -> dict:
    if train_views < 1 or val_views < 1 or rank < 1 or epochs < 1:
        raise ValueError("views, rank, and epochs must be positive")
    if augmentation not in AUGMENTATION_POLICIES:
        raise ValueError(f"Unsupported augmentation policy: {augmentation}")
    started = time.perf_counter()
    pipeline = Siglip2Pipeline(
        model_id=model_id, revision=revision, device=device, precision=precision,
        batch_size=batch_size, cache_policy="off", max_num_patches=max_num_patches,
        attn_implementation=attn_implementation, offline=offline)
    pipeline._load_backend()
    torch = pipeline._torch
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    reference_paths = [Path(item["image_path"]) for item in gallery]
    print(f"reference: encoding {len(reference_paths)} catalog images", flush=True)
    base_prototypes = pipeline._encode_paths(reference_paths).float()
    print("reference: complete", flush=True)
    train_features, train_labels = _encode_views(
        pipeline, gallery, train_views, seed, "train_views", augmentation)
    val_features, val_labels = _encode_views(
        pipeline, gallery, val_views, seed + 10_000_019,
        "validation_views", augmentation)
    dimension = base_prototypes.shape[1]
    effective_rank = min(rank, dimension)
    down = torch.nn.Parameter(torch.empty(effective_rank, dimension, device=pipeline._device))
    up = torch.nn.Parameter(torch.zeros(dimension, effective_rank, device=pipeline._device))
    torch.nn.init.normal_(down, std=0.01)
    scale = torch.tensor(1.0 / math.sqrt(effective_rank), device=pipeline._device)
    optimizer = torch.optim.AdamW([down, up], lr=learning_rate, weight_decay=weight_decay)
    base_prototypes = base_prototypes.to(pipeline._device)
    train_features = train_features.to(pipeline._device)
    train_labels = train_labels.to(pipeline._device)
    val_features = val_features.to(pipeline._device)
    best = None
    history = []

    baseline = _accuracy(torch, val_features, val_labels, base_prototypes)
    for epoch in range(1, epochs + 1):
        order = torch.randperm(len(train_labels), device=pipeline._device)
        loss_sum = 0.0
        samples = 0
        for start in range(0, len(order), batch_size):
            indices = order[start:start + batch_size]
            queries = _adapt(torch, train_features[indices], down, up, scale)
            prototypes = _adapt(torch, base_prototypes, down, up, scale)
            logits = queries @ prototypes.T / temperature
            loss = torch.nn.functional.cross_entropy(logits, train_labels[indices])
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_([down, up], max_norm=1.0)
            optimizer.step()
            loss_sum += float(loss.detach()) * len(indices)
            samples += len(indices)
        with torch.inference_mode():
            adapted_prototypes = _adapt(torch, base_prototypes, down, up, scale)
            adapted_val = _adapt(torch, val_features, down, up, scale)
            metrics = _accuracy(torch, adapted_val, val_labels, adapted_prototypes)
        row = {"epoch": epoch, "train_loss": loss_sum / samples, **metrics}
        history.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
        key = (metrics["top1_accuracy"], metrics["recall_at_5"], -row["train_loss"])
        if best is None or key > best[0]:
            best = (key, epoch, down.detach().cpu().clone(), up.detach().cpu().clone(), metrics)

    _, best_epoch, best_down, best_up, best_metrics = best
    output.parent.mkdir(parents=True, exist_ok=True)
    pipeline._save_file({"down": best_down.contiguous(), "up": best_up.contiguous(),
                         "scale": scale.detach().cpu().reshape(1)}, str(output))
    metadata = {
        "format": ADAPTER_FORMAT_VERSION,
        "method": "frozen_siglip2_low_rank_residual",
        "model_id": model_id,
        "requested_revision": revision,
        "resolved_revision": pipeline._resolved_revision,
        "gallery_sha256": gallery_digest(gallery),
        "gallery_size": len(gallery),
        "embedding_dimension": dimension,
        "rank": effective_rank,
        "train_views_per_item": train_views,
        "validation_views_per_item": val_views,
        "seed": seed,
        "augmentation": augmentation,
        "view_transform_version": (VIEW_TRANSFORM_VERSION
                                   if augmentation == "label-mix-v2" else None),
        "epochs": epochs,
        "best_epoch": best_epoch,
        "learning_rate": learning_rate,
        "weight_decay": weight_decay,
        "temperature": temperature,
        "baseline_proxy": baseline,
        "best_proxy": best_metrics,
        "history": history,
        "proxy_warning": (
            "Metrics use synthetic views of the same catalog images and are regression signals, "
            "not field-photo accuracy."
        ),
        "runtime": pipeline.metadata(),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
    }
    Path(str(output) + ".json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def make_proxy_eval(gallery: list[dict], output_dir: Path, seed: int = 20260929,
                    limit: int | None = None) -> dict:
    selected = gallery[:limit] if limit else gallery
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "queries.tsv"
    labels_path = output_dir / "labels.tsv"
    manifest_rows = []
    label_rows = []
    for index, item in enumerate(selected):
        query_id = f"proxy-{index:05d}"
        filename = f"{query_id}.jpg"
        destination = images_dir / filename
        with Image.open(item["image_path"]) as source:
            augmented = field_augment(source, seed + index * 1013)
            augmented.save(destination, format="JPEG", quality=82, optimize=True)
            augmented.close()
        manifest_rows.append({"query_id": query_id, "image_path": filename})
        label_rows.append({"query_id": query_id, "slug": item["slug"]})
    with manifest_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["query_id", "image_path"], delimiter="\t")
        writer.writeheader()
        writer.writerows(manifest_rows)
    with labels_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["query_id", "slug"], delimiter="\t")
        writer.writeheader()
        writer.writerows(label_rows)
    receipt = {
        "kind": "synthetic_proxy_only",
        "count": len(selected),
        "seed": seed,
        "manifest": str(manifest_path),
        "labels": str(labels_path),
        "images_dir": str(images_dir),
        "warning": "Do not report these metrics as real-photo quality.",
    }
    (output_dir / "receipt.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt
