"""Interchangeable visual feature extractors with a common ranking contract."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageOps


@dataclass(frozen=True)
class Candidate:
    slug: str
    score: float  # Similarity score, not a calibrated probability or F1.


class Pipeline(Protocol):
    def fit(self, gallery: list[dict]) -> None: ...
    def predict(self, image: Path, top_k: int = 5) -> list[Candidate]: ...


class DHashPipeline:
    """Cheap visual baseline; useful for harness validation, weak on perspective."""

    def __init__(self, hash_size: int = 16):
        self.hash_size = hash_size
        self.references: list[tuple[str, int]] = []

    def _feature(self, path: Path) -> int:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("L")
            image = ImageOps.autocontrast(image)
            image = image.resize((self.hash_size + 1, self.hash_size), Image.Resampling.LANCZOS)
            pixels = list(image.getdata())
        bits = 0
        width = self.hash_size + 1
        for y in range(self.hash_size):
            for x in range(self.hash_size):
                bits = (bits << 1) | (pixels[y * width + x] > pixels[y * width + x + 1])
        return bits

    def fit(self, gallery: list[dict]) -> None:
        self.references = [(item["slug"], self._feature(Path(item["image_path"]))) for item in gallery]
        if not self.references:
            raise ValueError("Gallery is empty")

    def predict(self, image: Path, top_k: int = 5) -> list[Candidate]:
        if top_k < 1:
            raise ValueError("top_k must be positive")
        feature = self._feature(image)
        nbits = self.hash_size ** 2
        ranked = [Candidate(slug, 1 - (feature ^ reference).bit_count() / nbits)
                  for slug, reference in self.references]
        return sorted(ranked, key=lambda c: (-c.score, c.slug))[:top_k]


class OrbPipeline:
    """Local-feature baseline for angled photos; requires the `orb` extra."""

    def __init__(self):
        try:
            import cv2
        except ImportError as error:
            raise RuntimeError("Install the ORB dependencies: pip install -e './ml[orb]'") from error
        self.cv2 = cv2
        self.extractor = cv2.ORB_create(nfeatures=1200)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
        self.references: list[tuple[str, object]] = []
        self.reference_by_slug: dict[str, object] = {}

    def _feature(self, path: Path):
        # imdecode supports non-ASCII filesystem paths on all major platforms.
        import numpy as np
        image = self.cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), self.cv2.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(f"Cannot decode image: {path}")
        height, width = image.shape
        if max(height, width) > 768:
            scale = 768 / max(height, width)
            image = self.cv2.resize(image, (round(width * scale), round(height * scale)))
        image = self.cv2.createCLAHE(clipLimit=2, tileGridSize=(8, 8)).apply(image)
        return self.extractor.detectAndCompute(image, None)[1]

    def fit(self, gallery: list[dict]) -> None:
        self.references = [(item["slug"], self._feature(Path(item["image_path"]))) for item in gallery]
        if not self.references:
            raise ValueError("Gallery is empty")
        self.reference_by_slug = dict(self.references)

    def _score(self, query, reference) -> float:
        if query is None or reference is None or len(query) < 2 or len(reference) < 2:
            return 0.0
        pairs = self.matcher.knnMatch(query, reference, k=2)
        good = sum(1 for pair in pairs
                   if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance)
        return good / max(1, min(len(query), len(reference)))

    def score_slugs(self, image: Path, slugs: list[str]) -> dict[str, float]:
        query = self._feature(image)
        return {slug: self._score(query, self.reference_by_slug.get(slug)) for slug in slugs}

    def predict(self, image: Path, top_k: int = 5) -> list[Candidate]:
        if top_k < 1:
            raise ValueError("top_k must be positive")
        scores = self.score_slugs(image, [slug for slug, _ in self.references])
        ranked = [Candidate(slug, score) for slug, score in scores.items()]
        return sorted(ranked, key=lambda c: (-c.score, c.slug))[:top_k]


class SiglipOrbRerankPipeline:
    """SigLIP retrieval followed by scale-free ORB reciprocal-rank fusion."""

    def __init__(self, candidate_k: int = 50, orb_weight: float = 0.35,
                 rrf_k: int = 20, **siglip_options):
        if candidate_k < 2:
            raise ValueError("candidate_k must be at least 2")
        if orb_weight < 0:
            raise ValueError("orb_weight must be non-negative")
        if rrf_k < 1:
            raise ValueError("rrf_k must be positive")
        from .siglip import Siglip2Pipeline
        self.siglip = Siglip2Pipeline(**siglip_options)
        self.orb = OrbPipeline()
        self.candidate_k = candidate_k
        self.orb_weight = orb_weight
        self.rrf_k = rrf_k

    def fit(self, gallery: list[dict]) -> None:
        self.siglip.fit(gallery)
        self.orb.fit(gallery)

    def predict(self, image: Path, top_k: int = 5) -> list[Candidate]:
        if top_k < 1:
            raise ValueError("top_k must be positive")
        candidates = self.siglip.predict(image, max(top_k, self.candidate_k))
        orb_scores = self.orb.score_slugs(image, [item.slug for item in candidates])
        orb_order = sorted(orb_scores, key=lambda slug: (-orb_scores[slug], slug))
        orb_rank = {slug: index + 1 for index, slug in enumerate(orb_order)}
        fused = []
        for siglip_rank, item in enumerate(candidates, start=1):
            score = (1.0 / (self.rrf_k + siglip_rank) +
                     self.orb_weight / (self.rrf_k + orb_rank[item.slug]))
            fused.append(Candidate(item.slug, score))
        return sorted(fused, key=lambda item: (-item.score, item.slug))[:top_k]

    def synchronize(self) -> None:
        self.siglip.synchronize()

    def metadata(self) -> dict:
        return {
            **self.siglip.metadata(),
            "reranker": "orb_rrf",
            "candidate_k": self.candidate_k,
            "orb_weight": self.orb_weight,
            "rrf_k": self.rrf_k,
        }


PIPELINE_NAMES = ("dhash", "orb", "siglip2", "siglip2-orb")


def make_pipeline(name: str, **options) -> Pipeline:
    if name == "dhash":
        if options:
            raise ValueError(f"dhash does not accept pipeline options: {sorted(options)}")
        return DHashPipeline()
    if name == "orb":
        if options:
            raise ValueError(f"orb does not accept pipeline options: {sorted(options)}")
        return OrbPipeline()
    if name == "siglip2":
        from .siglip import Siglip2Pipeline
        return Siglip2Pipeline(**options)
    if name == "siglip2-orb":
        return SiglipOrbRerankPipeline(**options)
    raise ValueError(f"Unknown pipeline: {name}")
