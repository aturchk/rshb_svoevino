# Live Svoe Vino catalog snapshot

The captured public [wine sitemap](https://vino-svoe.ru/wines-sitemap.xml) lists
2,110 wine pages and a high resolution image URL for each one. The site serves
the product attributes inside the server rendered `__NUXT_DATA__` JSON on each
page. `wine_cv.site_dataset` uses those two public sources, so it does not need
to scrape 132 paginated result pages or depend on an undocumented API.

## Portable repository snapshot

The checked-in `dataset/vino-svoe/` snapshot is about 352 MB. It contains all
2,110 captured wine cards, 2,110 original downloaded images, and 2,110
normalized images. Each `items/<slug>.json` record retains the product page and
image URLs, fetch time, image dimensions, normalization details, and SHA-256
values. The original and normalized files were independently checked against
all 4,220 recorded hashes. Source photos are kept byte-for-byte; the normalized
views are separate derived files.

`dataset/vino-svoe/gallery-reviewed-candidates.jsonl` contains 1,936
model-readable references after automatic conflict checks and decisions in
`data/site_reference_review.tsv`. Its `image_path` and `source_image_path`
values are repository-relative. The name means review decisions were applied;
it does not mean every wine photo received human review. The tracked
`legacy-gallery-strict.jsonl` supplies 16 references for wines absent from the
site sitemap, using source images already in `dataset/`. A fresh clone can read
the gallery without any files under `work/`.

To rebuild the JSONL galleries and report from the checked-in source snapshot
without a network request, run this from the repository root:

```bash
PYTHONPATH=ml/src .venv/bin/python - <<'PY'
from pathlib import Path
from wine_cv.site_dataset import build_outputs, parse_sitemap

snapshot = Path("dataset/vino-svoe")
entries = parse_sitemap((snapshot / "wines-sitemap.xml").read_bytes())
report = build_outputs(
    snapshot, entries, Path("dataset/strapi_output0709.csv"),
    snapshot / "legacy-gallery-strict.jsonl", {},
    review_manifest=Path("data/site_reference_review.tsv"),
)
assert report["complete"] and report["reviewed_gallery_candidate_count"] == 1936
PY
```

The live scraper below still writes to ignored `work/vino-svoe/` by default.
Use that directory for new captures and experiments; promote a refreshed
snapshot to `dataset/vino-svoe/` only after validating counts and hashes.

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
- `gallery-reviewed-candidates.jsonl`: the merged gallery plus explicitly
  allowed image relations from `data/site_reference_review.tsv`. Duplicate
  image bytes and page/sitemap image disagreements remain quarantined.

Every image is decoded and hashed after download. `report.json` records
coverage and shared-image collisions. If the site's schema changes and the
product data cannot be validated against the requested slug, the item fails
and the snapshot is marked incomplete instead of silently creating a record.

## Current training and field-photo use

The shipped adapter was trained only on deterministic derivatives of catalog
images: whole bottles and source-pixel label crops with restrained changes to
scale, rotation, light, blur, glare and occlusion. No field or closed-test photo
was used for fitting. Inference indexes a whole-bottle and label view per
reference but keeps the field query as a full image. Neither background
compositing, bottle detection nor OCR is part of this release.

Catalog-photo proxy scores are regression checks, not field accuracy. The
one-pass real-photo pool, its gallery coverage, benchmark results and known
label ambiguities are documented in
[FIELD_ACCURACY_REPORT.md](FIELD_ACCURACY_REPORT.md). A claim of production
accuracy requires a separately reviewed and frozen test set with capture
sessions or physical bottles grouped to prevent leakage.
