# Live Svoe Vino catalog snapshot

The public [wine sitemap](https://vino-svoe.ru/wines-sitemap.xml) currently lists
2,110 wine pages and a high resolution image URL for each one. The site serves
the product attributes inside the server rendered `__NUXT_DATA__` JSON on each
page. `wine_cv.site_dataset` uses those two public sources, so it does not need
to scrape 132 paginated result pages or depend on an undocumented API.

Run from the repository root, through a Russian VPN if the site is unreachable:

```bash
PYTHONPATH=ml/src .venv/bin/python -m wine_cv.site_dataset --workers 8
```

The default destination is ignored `work/vino-svoe/`. `--output` selects another
directory. `--limit 10` is a smoke test and defaults to the separate
`work/vino-svoe-smoke/` directory. `--no-images` captures metadata only,
and `--no-normalize` skips the generated white-background views. Eight workers
is the default; raise to at most 32 only if the connection remains stable.
Rerun the same command after an interruption. Each page is checkpointed in
`items/<slug>.json`; downloaded files and SHA-256 values are verified on resume.
Use `--refresh` to refetch every product page even if its sitemap update time
has not changed; verified image files are still reused.
The process exits nonzero if any page failed, and `report.json` lists every
failure. Transient HTTP errors are retried with bounded exponential backoff.

## Snapshot contents

- `wines-sitemap.xml`: exact public source snapshot with URLs and update times.
- `items/<slug>.json`: all product fields published in that page's Nuxt wine
  object, including title, manufacturer, region, category, color, grapes,
  alcohol, serving temperature, food pairings, description, rating, and image
  relation when present. It also includes related wines, source URLs, fetch
  time, and image checksums and dimensions.
- `images/raw/`: exact downloaded bytes from the sitemap's 1920 pixel image
  endpoint. These are source evidence for the snapshot. No original images in
  `dataset/` are modified.
- `images/normalized/`: deterministic 768×768 lossless WebP views. The
  transform applies EXIF orientation, crops only transparent padding, keeps
  the bottle's aspect ratio, and centers it on white. Its version, crop box,
  and output hash are recorded per image. Opaque images are not auto-segmented.
- `catalog.jsonl`: one site record per slug; `merged.jsonl`: the same records
  joined to the older CSV only when slugs match exactly. Unmatched slugs stay
  visible in `report.json` for review.
- `gallery-site-candidates.jsonl`: an experimental, model-readable gallery
  using the normalized view when available. Exact duplicate photos, ambiguous
  same-name/manufacturer records, and disagreement between page and sitemap
  photo relations are excluded. Every row remains marked
  `site_linked_unreviewed`; this is not a reviewed benchmark gallery.
- `gallery-merged-candidates.jsonl`: the site candidates plus validated
  references from `work/gallery-strict.jsonl` for slugs absent from the live
  site, when that legacy gallery exists. Otherwise it equals the site gallery.
  Current site records take precedence;
  a site conflict is not hidden by falling back to an older photo. The legacy
  input can be selected with `--legacy-gallery`.

Every image is decoded and hashed after download. `report.json` records
coverage and shared-image collisions. If the site's schema changes and the
product data cannot be validated against the requested slug, the item fails
and the snapshot is marked incomplete instead of silently creating a record.

## Training and field photos

The new images add direct product-to-photo relations and much broader coverage.
They do not by themselves solve the gap between isolated bottle images and
handheld shelf photos. The practical evaluation path is:

1. Keep the original site image and the normalized view as paired references.
   Crop via alpha only; never stretch labels or invent missing detail by
   sharpening an image. Flag bottles with fewer than 128 source pixels on the
   short side for manual review and targeted replacement.
2. During training, composite transparent bottle cutouts onto diverse
   independently sourced shelf/background photos, and apply restrained scale,
   perspective, glare, blur, exposure, compression, and partial occlusion.
   Preserve identifying producer, cuvée, and vintage text. Treat every such
   image as a derivative of its source SKU and keep derivatives out of real
   photo test sets.
3. At inference, rank the full field photo and an automatically detected
   bottle/label crop against the same gallery. Merge candidate lists before
   reranking. Keep the full-image result when the crop detector is uncertain.
   Compare OCR producer and visible vintage only when both readings are
   reliable; avoid guessing a vintage from the page slug.
4. Tune view fusion and any adapter on an independently reviewed development
   split, with physical bottles and capture sessions grouped. Freeze the
   pipeline before testing on independent real photos. Synthetic proxy scores
   measure regression only, not field accuracy.

This workflow can be integrated with the existing `fit`/`predict` pipeline
without changing the current production gallery or evaluation labels.
