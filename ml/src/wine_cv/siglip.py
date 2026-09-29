"""SigLIP 2 image retrieval with exact cosine search and a portable cache."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from .pipelines import Candidate
from .views import (QUERY_VIEW_MODES, REFERENCE_VIEW_MODES, VIEW_TRANSFORM_VERSION,
                    query_views, reference_views)

DEFAULT_MODEL_ID = "google/siglip2-base-patch16-384"
CACHE_FORMAT_VERSION = 3
DECODE_MAX_SIDE = 1536


class Siglip2Pipeline:
    """Frozen SigLIP 2 vision encoder plus exhaustive cosine retrieval."""

    def __init__(self, model_id: str = DEFAULT_MODEL_ID, revision: str | None = None,
                 device: str = "auto", precision: str = "auto", batch_size: int = 16,
                 cache_dir: Path = Path("work/siglip-cache"), cache_policy: str = "auto",
                 max_num_patches: int = 256, attn_implementation: str = "sdpa",
                 offline: bool = False, adapter_path: Path | None = None,
                 reference_view_mode: str = "full", query_view_mode: str = "full"):
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        if precision not in {"auto", "float32", "float16", "bfloat16"}:
            raise ValueError(f"Unsupported precision: {precision}")
        if cache_policy not in {"auto", "refresh", "require", "off"}:
            raise ValueError(f"Unsupported cache policy: {cache_policy}")
        if max_num_patches < 1:
            raise ValueError("max_num_patches must be positive")
        if reference_view_mode not in REFERENCE_VIEW_MODES:
            raise ValueError(f"Unsupported reference view mode: {reference_view_mode}")
        if query_view_mode not in QUERY_VIEW_MODES:
            raise ValueError(f"Unsupported query view mode: {query_view_mode}")
        self.model_id = model_id
        self.revision = revision
        self.device_requested = device
        self.precision_requested = precision
        self.batch_size = batch_size
        self.cache_dir = Path(cache_dir)
        self.cache_policy = cache_policy
        self.max_num_patches = max_num_patches
        self.attn_implementation = attn_implementation
        self.offline = offline
        self.adapter_path = Path(adapter_path) if adapter_path else None
        self.reference_view_mode = reference_view_mode
        self.query_view_mode = query_view_mode
        self._views_per_reference = {"full": 1, "full-label": 2,
                                     "full-mid-label": 3}[reference_view_mode]
        self.slugs: list[str] = []
        self.embeddings = None
        self.cache_hit = False
        self._model = None
        self._processor = None
        self._torch = None
        self._device = None
        self._dtype = None
        self._resolved_revision = None
        self._adapter = None
        self._adapter_sha256 = None
        self._cache_path: Path | None = None
        self._predict_lock = threading.Lock()
        self._model_load_ms = None
        self._gallery_encode_ms = None
        self._cache_load_ms = None
        self._cache_load_error = None

    def _load_backend(self) -> None:
        if self._model is not None:
            return
        try:
            import torch
            from safetensors.torch import load_file, save_file
            import transformers
            from transformers import (AutoConfig, AutoImageProcessor, Siglip2VisionModel,
                                      SiglipVisionModel)
        except ImportError as error:
            raise RuntimeError(
                "Install SigLIP dependencies and a CUDA-enabled PyTorch build: "
                "pip install -e './ml[siglip]'"
            ) from error

        if self.device_requested == "auto":
            if torch.cuda.is_available():
                device_name = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                device_name = "mps"
            else:
                device_name = "cpu"
        else:
            device_name = self.device_requested
        device = torch.device(device_name)
        if device.type == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false")

        precision = self.precision_requested
        if precision == "auto":
            precision = "float16" if device.type in {"cuda", "mps"} else "float32"
        if precision == "float16" and device.type == "cpu":
            raise ValueError("float16 inference is not supported by this pipeline on CPU")
        if precision == "bfloat16" and device.type == "cuda" and not torch.cuda.is_bf16_supported():
            raise ValueError("bfloat16 was requested but this CUDA device does not support it")
        dtype = {"float32": torch.float32, "float16": torch.float16,
                 "bfloat16": torch.bfloat16}[precision]

        load_started = time.perf_counter()
        load_args = {"local_files_only": self.offline}
        if self.revision:
            load_args["revision"] = self.revision
        config = AutoConfig.from_pretrained(self.model_id, **load_args)
        resolved_revision = getattr(config, "_commit_hash", None) or self.revision or "main"
        if resolved_revision != "main":
            load_args["revision"] = resolved_revision
        vision_config = getattr(config, "vision_config", config)
        vision_type = getattr(vision_config, "model_type", "")
        if vision_type == "siglip_vision_model":
            model_class = SiglipVisionModel
        elif vision_type == "siglip2_vision_model":
            model_class = Siglip2VisionModel
        else:
            raise RuntimeError(f"Unsupported vision model type for SigLIP pipeline: {vision_type}")

        processor = AutoImageProcessor.from_pretrained(self.model_id, **load_args)
        model, loading_info = model_class.from_pretrained(
            self.model_id, config=vision_config, attn_implementation=self.attn_implementation,
            dtype=dtype, output_loading_info=True, **load_args)
        missing = loading_info.get("missing_keys", [])
        mismatched = loading_info.get("mismatched_keys", [])
        if missing or mismatched:
            raise RuntimeError(
                "SigLIP vision checkpoint did not load completely; "
                f"missing={list(missing)[:5]}, mismatched={list(mismatched)[:5]}"
            )
        model.eval().to(device=device)
        self._torch = torch
        self._load_file = load_file
        self._save_file = save_file
        self._device = device
        self._dtype = dtype
        self._precision = precision
        self._torch_version = str(torch.__version__)
        self._cuda_runtime = torch.version.cuda
        self._cuda_device_name = (torch.cuda.get_device_name(device)
                                  if device.type == "cuda" else None)
        self._processor = processor
        self._model = model
        self._resolved_revision = resolved_revision
        self._transformers_version = transformers.__version__
        processor_config = processor.to_dict() if hasattr(processor, "to_dict") else repr(processor)
        self._processor_fingerprint = hashlib.sha256(json.dumps(
            processor_config, ensure_ascii=False, sort_keys=True, default=str
        ).encode("utf-8")).hexdigest()
        self._is_naflex = vision_type == "siglip2_vision_model"
        self._expected_dimension = getattr(vision_config, "hidden_size", None)
        self._load_adapter()
        self._model_load_ms = round((time.perf_counter() - load_started) * 1000, 2)

    def _load_adapter(self) -> None:
        if self.adapter_path is None:
            return
        if not self.adapter_path.is_file():
            raise FileNotFoundError(f"SigLIP adapter not found: {self.adapter_path}")
        tensors = self._load_file(str(self.adapter_path), device="cpu")
        down = tensors.get("down")
        up = tensors.get("up")
        scale = tensors.get("scale")
        if down is None or up is None or scale is None:
            raise ValueError("Adapter must contain down, up, and scale tensors")
        dimension = self._expected_dimension
        if (down.ndim != 2 or up.ndim != 2 or scale.numel() != 1 or
                (dimension is not None and down.shape[1] != dimension) or
                up.shape != (down.shape[1], down.shape[0])):
            raise ValueError(
                f"Adapter tensor shapes are incompatible: down={tuple(down.shape)}, "
                f"up={tuple(up.shape)}, expected_dimension={dimension}"
            )
        metadata_path = Path(str(self.adapter_path) + ".json")
        if metadata_path.is_file():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata.get("model_id") not in {None, self.model_id}:
                raise ValueError("Adapter model_id does not match the requested SigLIP model")
            adapter_revision = metadata.get("resolved_revision")
            if adapter_revision and adapter_revision != self._resolved_revision:
                raise ValueError(
                    "Adapter checkpoint revision does not match the loaded SigLIP revision: "
                    f"{adapter_revision} != {self._resolved_revision}"
                )
        self._adapter_sha256 = hashlib.sha256(self.adapter_path.read_bytes()).hexdigest()
        self._adapter = {
            "down": down.float().to(self._device),
            "up": up.float().to(self._device),
            "scale": scale.float().to(self._device),
        }

    def _apply_adapter(self, features):
        if self._adapter is None:
            return features
        residual = (features @ self._adapter["down"].T) @ self._adapter["up"].T
        return features + self._adapter["scale"] * residual

    def _image_digest(self, item: dict) -> str:
        digest = item.get("image_sha256")
        if digest:
            return digest
        return hashlib.sha256(Path(item["image_path"]).read_bytes()).hexdigest()

    def _fingerprint(self, gallery: list[dict]) -> str:
        payload = {
            "format": CACHE_FORMAT_VERSION,
            "model_id": self.model_id,
            "revision": self._resolved_revision,
            "precision": self._precision,
            "batch_size": self.batch_size,
            "torch": self._torch_version,
            "transformers": self._transformers_version,
            "processor_fingerprint": self._processor_fingerprint,
            "attn_implementation": self.attn_implementation,
            "max_num_patches": self.max_num_patches if self._is_naflex else None,
            "decode_max_side": DECODE_MAX_SIDE,
            "adapter_sha256": self._adapter_sha256,
            "items": [{"slug": item["slug"], "image_sha256": self._image_digest(item)}
                      for item in gallery],
        }
        if self.reference_view_mode != "full":
            payload["reference_view_mode"] = self.reference_view_mode
            payload["view_transform_version"] = VIEW_TRANSFORM_VERSION
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True,
                             separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _cache_files(self, fingerprint: str) -> tuple[Path, Path]:
        model_name = re.sub(r"[^A-Za-z0-9._-]+", "_", self.model_id).strip("_")
        base = self.cache_dir / f"{model_name}-{fingerprint[:20]}"
        return Path(str(base) + ".safetensors"), Path(str(base) + ".json")

    @staticmethod
    def _pooled_tensor(output):
        if hasattr(output, "pooler_output") and output.pooler_output is not None:
            return output.pooler_output
        if isinstance(output, tuple) and len(output) > 1:
            return output[1]
        raise RuntimeError("SigLIP vision model did not return pooled image features")

    def _encode_images(self, images: list[Image.Image], return_cpu: bool = True):
        torch = self._torch
        batches = []
        for start in range(0, len(images), self.batch_size):
            batch_images = images[start:start + self.batch_size]
            try:
                processor_args = {"images": batch_images, "return_tensors": "pt"}
                if self._is_naflex:
                    processor_args["max_num_patches"] = self.max_num_patches
                inputs = self._processor(**processor_args)
            except (OSError, ValueError) as error:
                raise ValueError("Cannot preprocess SigLIP image batch") from error
            model_inputs = {
                key: (value.to(device=self._device, dtype=self._dtype)
                      if value.is_floating_point() else value.to(device=self._device))
                for key, value in inputs.items()
            }
            with torch.inference_mode():
                output = self._model(**model_inputs)
                features = self._pooled_tensor(output).float()
                features = self._apply_adapter(features)
                features = torch.nn.functional.normalize(features, p=2, dim=-1)
            batches.append(features.cpu() if return_cpu else features)
        return torch.cat(batches, dim=0)

    def _encode_paths(self, paths: list[Path], return_cpu: bool = True):
        batches = []
        for start in range(0, len(paths), self.batch_size):
            chunk = paths[start:start + self.batch_size]
            images = []
            try:
                for path in chunk:
                    with Image.open(path) as source:
                        image = ImageOps.exif_transpose(source).convert("RGB")
                        image.load()
                        if max(image.size) > DECODE_MAX_SIDE:
                            image.thumbnail((DECODE_MAX_SIDE, DECODE_MAX_SIDE),
                                            Image.Resampling.LANCZOS)
                        images.append(image)
                batches.append(self._encode_images(images, return_cpu=return_cpu))
            except (OSError, ValueError) as error:
                first = chunk[0] if chunk else "<empty>"
                raise ValueError(
                    f"Cannot preprocess SigLIP image batch beginning with {first}") from error
            finally:
                for image in images:
                    image.close()
        if not batches:
            raise ValueError("Cannot encode an empty image path list")
        return self._torch.cat(batches, dim=0)

    def _encode_view_paths(self, paths: list[Path], *, reference: bool,
                           return_cpu: bool = True):
        """Encode derived views in small batches instead of retaining the gallery in RAM."""
        pending: list[Image.Image] = []
        batches = []

        def flush() -> None:
            if pending:
                batches.append(self._encode_images(pending, return_cpu=return_cpu))
                for view in pending:
                    view.close()
                pending.clear()

        try:
            for path in paths:
                with Image.open(path) as source:
                    image = ImageOps.exif_transpose(source).convert("RGB")
                    image.load()
                    if max(image.size) > DECODE_MAX_SIDE:
                        image.thumbnail((DECODE_MAX_SIDE, DECODE_MAX_SIDE),
                                        Image.Resampling.LANCZOS)
                    views = (reference_views(image, self.reference_view_mode) if reference
                             else query_views(image, self.query_view_mode))
                    image.close()
                for view in views:
                    pending.append(view)
                    if len(pending) >= self.batch_size:
                        flush()
            flush()
            return self._torch.cat(batches, dim=0)
        except (OSError, ValueError) as error:
            first = paths[0] if paths else "<empty>"
            raise ValueError(f"Cannot preprocess SigLIP image batch beginning with {first}") from error
        finally:
            for view in pending:
                view.close()

    def fit(self, gallery: list[dict]) -> None:
        if not gallery:
            raise ValueError("Gallery is empty")
        slugs = [item["slug"] for item in gallery]
        if len(slugs) != len(set(slugs)):
            raise ValueError("Gallery slugs must be unique")
        self.cache_hit = False
        self._cache_load_error = None
        self._cache_load_ms = None
        self._gallery_encode_ms = None
        self._load_backend()
        for item in gallery:
            actual = hashlib.sha256(Path(item["image_path"]).read_bytes()).hexdigest()
            declared = item.get("image_sha256")
            if declared and actual != declared:
                raise ValueError(f"Gallery image SHA-256 mismatch for slug {item['slug']}")
            item["image_sha256"] = actual
        fingerprint = self._fingerprint(gallery)
        tensor_path, metadata_path = self._cache_files(fingerprint)
        self._cache_path = tensor_path
        embeddings = None
        cache_files_present = tensor_path.is_file() and metadata_path.is_file()
        if self.cache_policy in {"auto", "require"} and cache_files_present:
            cache_started = time.perf_counter()
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                if not isinstance(metadata, dict):
                    raise ValueError("cache metadata must be a JSON object")
                if (metadata.get("format") == CACHE_FORMAT_VERSION and
                        metadata.get("fingerprint") == fingerprint and
                        metadata.get("slugs") == slugs):
                    candidate = self._load_file(str(tensor_path), device="cpu").get("embeddings")
                    if (candidate is not None and candidate.ndim == 2 and
                            candidate.shape[0] == len(slugs) * self._views_per_reference):
                        candidate = candidate.float()
                        dimension_ok = (self._expected_dimension is None or
                                        candidate.shape[1] == self._expected_dimension)
                        finite = bool(self._torch.isfinite(candidate).all())
                        norms = candidate.norm(dim=1)
                        normalized = bool(self._torch.allclose(
                            norms, self._torch.ones_like(norms), atol=1e-4, rtol=1e-4))
                        if dimension_ok and finite and normalized:
                            embeddings = candidate
                            self.cache_hit = True
                if embeddings is None:
                    self._cache_load_error = "cache metadata or embeddings failed validation"
            except Exception as error:
                self._cache_load_error = f"{type(error).__name__}: {error}"
            finally:
                self._cache_load_ms = round((time.perf_counter() - cache_started) * 1000, 2)
        if embeddings is None and self.cache_policy == "require":
            if cache_files_present:
                raise RuntimeError(
                    f"Required SigLIP cache is invalid: {tensor_path} "
                    f"({self._cache_load_error}). Run `wine-cv build-index` to rebuild it."
                )
            raise FileNotFoundError(
                f"Required SigLIP cache not found or incomplete: {tensor_path}. "
                "Run `wine-cv build-index` first."
            )
        if embeddings is None:
            encode_started = time.perf_counter()
            paths = [Path(item["image_path"]) for item in gallery]
            embeddings = (self._encode_paths(paths) if self.reference_view_mode == "full"
                          else self._encode_view_paths(paths, reference=True))
            self._gallery_encode_ms = round((time.perf_counter() - encode_started) * 1000, 2)
            self.cache_hit = False
            if self.cache_policy != "off":
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                token = uuid.uuid4().hex
                tensor_tmp = Path(str(tensor_path) + f".{token}.tmp")
                metadata_tmp = Path(str(metadata_path) + f".{token}.tmp")
                tensor_tmp.unlink(missing_ok=True)
                metadata_tmp.unlink(missing_ok=True)
                self._save_file({"embeddings": embeddings.contiguous()}, str(tensor_tmp))
                metadata_tmp.write_text(json.dumps({
                    "format": CACHE_FORMAT_VERSION,
                    "fingerprint": fingerprint,
                    "model_id": self.model_id,
                    "requested_revision": self.revision,
                    "resolved_revision": self._resolved_revision,
                    "precision": self._precision,
                    "batch_size": self.batch_size,
                    "torch": self._torch_version,
                    "cuda_runtime": self._cuda_runtime,
                    "cuda_device_name": self._cuda_device_name,
                    "transformers": self._transformers_version,
                    "processor_fingerprint": self._processor_fingerprint,
                    "attn_implementation": self.attn_implementation,
                    "max_num_patches": self.max_num_patches if self._is_naflex else None,
                    "decode_max_side": DECODE_MAX_SIDE,
                    "adapter_path": str(self.adapter_path) if self.adapter_path else None,
                    "adapter_sha256": self._adapter_sha256,
                    "reference_view_mode": self.reference_view_mode,
                    "view_transform_version": (VIEW_TRANSFORM_VERSION
                                               if self.reference_view_mode != "full" else None),
                    "views_per_reference": self._views_per_reference,
                    "slugs": slugs,
                    "embedding_dimension": embeddings.shape[1],
                }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                os.replace(tensor_tmp, tensor_path)
                os.replace(metadata_tmp, metadata_path)
        self.slugs = slugs
        self.embeddings = embeddings.to(self._device)
        self.synchronize()

    def predict(self, image: Path, top_k: int = 5) -> list[Candidate]:
        if self.embeddings is None:
            raise RuntimeError("Pipeline must be fitted before prediction")
        if top_k < 1:
            raise ValueError("top_k must be positive")
        with self._predict_lock:
            query = (self._encode_paths([image], return_cpu=False)
                     if self.query_view_mode == "full" else
                     self._encode_view_paths([image], reference=False, return_cpu=False))
            similarities = query @ self.embeddings.T
            scores = similarities.reshape(
                query.shape[0], len(self.slugs), self._views_per_reference
            ).amax(dim=(0, 2)).cpu().tolist()
        ranked = sorted(zip(self.slugs, scores), key=lambda pair: (-pair[1], pair[0]))
        return [Candidate(slug, float(score)) for slug, score in ranked[:top_k]]

    def synchronize(self) -> None:
        if self._torch is not None and self._device.type == "cuda":
            self._torch.cuda.synchronize(self._device)

    def metadata(self) -> dict:
        return {
            "model_id": self.model_id,
            "requested_revision": self.revision,
            "resolved_revision": self._resolved_revision,
            "device": str(self._device) if self._device is not None else None,
            "precision": getattr(self, "_precision", None),
            "torch": getattr(self, "_torch_version", None),
            "cuda_runtime": getattr(self, "_cuda_runtime", None),
            "cuda_device_name": getattr(self, "_cuda_device_name", None),
            "batch_size": self.batch_size,
            "max_num_patches": self.max_num_patches if getattr(self, "_is_naflex", False) else None,
            "attn_implementation": self.attn_implementation,
            "offline": self.offline,
            "adapter_path": str(self.adapter_path) if self.adapter_path else None,
            "adapter_sha256": self._adapter_sha256,
            "reference_view_mode": self.reference_view_mode,
            "query_view_mode": self.query_view_mode,
            "view_transform_version": VIEW_TRANSFORM_VERSION,
            "views_per_reference": self._views_per_reference,
            "cache_hit": self.cache_hit,
            "cache_path": str(self._cache_path) if self._cache_path else None,
            "embedding_dimension": int(self.embeddings.shape[1]) if self.embeddings is not None else None,
            "model_load_ms": self._model_load_ms,
            "cache_load_ms": self._cache_load_ms,
            "cache_load_error": self._cache_load_error,
            "gallery_encode_ms": self._gallery_encode_ms,
        }
