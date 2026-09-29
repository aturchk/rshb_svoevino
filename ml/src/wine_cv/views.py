"""Deterministic image views for matching catalog bottles to field labels.

The transforms only crop pixels already present in the source. They do not
invent label detail, and the full image is always retained as a fallback.
"""

from __future__ import annotations

from PIL import Image, ImageChops


VIEW_TRANSFORM_VERSION = "bottle-bbox-label-crops-v1"
REFERENCE_VIEW_MODES = ("full", "full-label", "full-mid-label")
QUERY_VIEW_MODES = ("full", "full-center", "full-center-lower")


def _bottle_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Find a bottle on white only when the corners verify that background."""
    width, height = image.size
    corners = [image.getpixel(point)[:3] for point in
               ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))]
    if not all(min(pixel) >= 240 for pixel in corners):
        return (0, 0, width, height)
    difference = ImageChops.difference(image.convert("RGB"),
                                       Image.new("RGB", image.size, "white"))
    mask = difference.convert("L").point(lambda value: 255 if value > 22 else 0)
    bbox = mask.getbbox()
    if bbox is None or (bbox[2] - bbox[0] < width * 0.08 or
                        bbox[3] - bbox[1] < height * 0.30):
        return (0, 0, width, height)
    return bbox


def _detail_crop(image: Image.Image, bbox: tuple[int, int, int, int],
                 y_start: float, y_end: float) -> Image.Image:
    left, top, right, bottom = bbox
    bottle_width = right - left
    bottle_height = bottom - top
    center_x = (left + right) / 2
    center_y = top + bottle_height * (y_start + y_end) / 2
    side = min(round(max(bottle_width * 1.16,
                         bottle_height * (y_end - y_start))), image.width, image.height)
    crop_left = max(0, min(round(center_x - side / 2), image.width - side))
    crop_top = max(0, min(round(center_y - side / 2), image.height - side))
    return image.crop((crop_left, crop_top,
                       crop_left + side, crop_top + side))


def reference_views(image: Image.Image, mode: str) -> list[Image.Image]:
    """Return full bottle, lower label, and optionally mid-body detail."""
    if mode not in REFERENCE_VIEW_MODES:
        raise ValueError(f"Unknown reference view mode: {mode}")
    views = [image.copy()]
    if mode == "full":
        return views
    bbox = _bottle_bbox(image)
    if mode == "full-mid-label":
        views.append(_detail_crop(image, bbox, 0.29, 0.72))
    views.append(_detail_crop(image, bbox, 0.52, 0.97))
    return views


def query_views(image: Image.Image, mode: str) -> list[Image.Image]:
    """Keep original field photo and optionally remove its outer 12% border."""
    if mode not in QUERY_VIEW_MODES:
        raise ValueError(f"Unknown query view mode: {mode}")
    views = [image.copy()]
    if mode in {"full-center", "full-center-lower"}:
        width, height = image.size
        inset_x = round(width * 0.12)
        inset_y = round(height * 0.12)
        views.append(image.crop((inset_x, inset_y, width - inset_x, height - inset_y)))
        if mode == "full-center-lower":
            views.append(image.crop((inset_x, round(height * 0.30),
                                     width - inset_x, round(height * 0.98))))
    return views
