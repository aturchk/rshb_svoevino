# Field-photo labeling and benchmark data

This document describes schema version 1 implemented in
[`field_data.py`](../src/wine_cv/field_data.py). Use it to map the field
photos to exact catalog slugs, validate the mapping, and export reproducible
development and test benchmarks.

Run every command below from the repository root.

## Files already prepared

- [`data/field_mapping.tsv`](data/field_mapping.tsv) is the canonical UTF-8,
  tab-separated annotation file. It currently contains one row for each of the
  100 images in `dataset/real_photo`. Stable query IDs, relative image paths and
  SHA-256 hashes are preserved. All rows have one-pass manual decisions and
  `review_status=single_reviewed`: 64 confirmed, 35 out of catalog and one
  uncertain. They remain in `split=pool`; do not present them as the final test.
- [`data/catalog_lookup.tsv`](data/catalog_lookup.tsv) is the read-only lookup
  sheet for manual matching. It contains all 2,103 distinct catalog slugs plus
  the wine name, winery, category, region, grape, gallery state, and reference
  image path when one is available.
- `work/gallery-strict.jsonl` is the current model-facing retrieval gallery. It
  contains 928 indexed slugs. The remaining 1,175 catalog slugs are marked
  `not_indexed` in the lookup because no trusted unique reference image is
  available in this checkout.

`make-field-template` created both TSV files. Do not rerun it with `--force`
because that replaces the reviewed `data/field_mapping.tsv`.
If new source photos must be inventoried, first save the annotated file under a
different name, then run:

```bash
.venv/bin/wine-cv make-field-template --force
```

## What must be labeled

The TSV header has 12 required schema columns. “Required” means the column must
exist. Some values are intentionally blank for original or unfinished rows.

| Column | Who fills it | Allowed value and rule |
| --- | --- | --- |
| `query_id` | Generated | Unique stable ID. Keep the existing `field-NNNNNN` value. |
| `image_path` | Generated | Unique nonempty path relative to the repository root. It must remain inside the data root and point to an existing file. |
| `image_sha256` | Generated | Lowercase 64-character SHA-256 of the original image. The validator recomputes it. |
| `source_kind` | Generated | `field`, `organizer`, `synthetic`, or `derived_crop`. Existing rows are `field`. |
| `parent_query_id` | Conditional | Blank for an original photo. Required for `synthetic` and `derived_crop`, and must name a row in the same manifest. |
| `bottle_group_id` | Manual | Stable ID for one physical bottle, for example `bottle-0042`. Required for every row assigned to `train`, `dev`, or `test`. |
| `split` | Manual | `pool`, `train`, `dev`, `test`, or `none`. Existing rows start in `pool`. |
| `label_status` | Manual | `confirmed`, `not_in_catalog`, `uncertain`, or `exclude`. Required for an active `train`, `dev`, or `test` row. |
| `true_slug` | Manual | Exact `slug` copied from `catalog_lookup.tsv` when `label_status=confirmed`; blank for every other label status. |
| `review_status` | Manual | `pending`, `single_reviewed`, `double_agreed`, or `adjudicated`. |
| `reviewer_ids` | Manual | Stable reviewer IDs separated with semicolons, such as `r01;r02`. `double_agreed` requires at least two IDs. |
| `adjudicator_id` | Conditional | Required for `adjudicated`; otherwise blank. |

Keep the file as UTF-8 TSV. Do not insert tabs or line breaks inside a value.
Copy slugs directly from the lookup instead of retyping or deriving them from a
filename.

Illustrative required-field rows (the real file continues with the optional
columns):

```tsv
query_id	image_path	image_sha256	source_kind	parent_query_id	bottle_group_id	split	label_status	true_slug	review_status	reviewer_ids	adjudicator_id
field-000001	dataset/real_photo/example-a.webp	<64 lowercase hex characters>	field		bottle-0001	dev	confirmed	<exact catalog slug>	double_agreed	r01;r02	
field-000002	dataset/real_photo/example-b.webp	<64 lowercase hex characters>	field		bottle-0002	test	not_in_catalog		adjudicated	r01;r02	r03
field-000003	dataset/real_photo/example-c.webp	<64 lowercase hex characters>	field		bottle-0003	pool	uncertain		pending		
```

## Full catalog and current gallery are different

The manual answer describes the wine; gallery state describes whether the
current model can retrieve it.

- Use `confirmed` when the exact product exists anywhere in
  `catalog_lookup.tsv`. Fill `true_slug` even if that lookup row says
  `gallery_state=not_indexed`.
- Use `not_in_catalog` only after checking the full 2,103-row lookup and
  establishing that the exact product is absent. Leave `true_slug` blank.
- Use `uncertain` when a likely family, winery, or product is visible but the
  exact variant, vintage, color, or category cannot be established. Leave
  `true_slug` blank instead of choosing a nearby product.
- Use `exclude` when the photo cannot serve as a single-wine query, for example
  because it is unreadable, has no usable label, or has several bottles with no
  clear target. Leave `true_slug` blank.

Validation derives gallery membership from `work/gallery-strict.jsonl`. A confirmed
slug in the gallery counts as `indexed`. A confirmed catalog slug outside the
gallery counts as `not_indexed`: this is valid and produces a warning, because
the label is useful for coverage and future out-of-gallery work. It cannot be a
fair closed-set retrieval query against the current gallery and is therefore
left out of benchmark exports.

Do not encode an absent wine with a fake slug such as `unknown`. The current
Top-1, micro-F1, Recall@5, and Recall@20 metrics require one exact indexed slug
per exported query. Out-of-gallery false-accept and reject metrics need a
separate threshold evaluation that is not part of `export-field-eval` yet.

## Manual mapping workflow

1. Open the field image named by `image_path` and search
   `data/catalog_lookup.tsv` by visible producer, label name, winery, grape,
   category, and year. For an indexed result, use `reference_image_path` to
   inspect the exact gallery image.
2. Assign a `bottle_group_id`. Every burst photo, saved crop, resized copy, or
   synthetic derivative of the same physical bottle must use the same group.
   Different physical bottles of the same slug should use different group IDs.
   If it is unclear whether two shots show the same bottle, group them
   conservatively.
3. Set `label_status` and, only for `confirmed`, copy the exact `true_slug` from
   the lookup. A catalog match remains `confirmed` when its gallery state is
   `not_indexed`.
4. Record the review. Use `single_reviewed` after one reviewer has checked the
   answer. Use `double_agreed` only when two reviewers independently reached
   the same exact status and slug, and list both IDs. If they disagree, have an
   adjudicator choose the final status and slug, set `review_status=adjudicated`,
   and fill `adjudicator_id`.
5. Assign the split at the bottle-group level. Keep all views and derivatives
   of one physical bottle together. Use `dev` for crop, model, fusion, and
   threshold choices; keep `test` frozen until the final comparison. Use
   `train` only for data used to fit an adapter or other learned component,
   `pool` while work is unfinished, and `none` for retained rows that should
   not enter a split.
6. Validate after each annotation batch. Resolve every error before exporting.
   Review warnings about confirmed slugs outside the current gallery; those
   warnings do not invalidate a correct label.

For `train`, `dev`, and `test`, the validator requires both a nonempty
`bottle_group_id` and `label_status`. A confirmed or `not_in_catalog` row in an
active split cannot remain `pending`. Every test row must be either
`double_agreed` or `adjudicated`. The code permits `single_reviewed` development
rows; fill `reviewer_ids` for auditability even though it is only enforced for
`double_agreed`.

The validator also rejects conflicting slugs or multiple active splits within
one bottle group, exact image hashes used across active splits, a duplicate
`query_id` or `image_path`, an active query identical to a gallery reference,
missing parents, and an active child whose parent is in another split. It warns
when one `capture_session_id` spans active splits. Assign the whole group
together rather than leaving some of its rows in `pool` after the group becomes
active.

## Nice-to-have fields

The remaining columns are optional. They do not affect current export
eligibility, but they make error slices and later crop/OCR experiments much
more useful.

| Column | Recommended content |
| --- | --- |
| `capture_session_id` | One ID for a shooting session or store visit; useful for detecting background leakage. |
| `glare` | Blank, `none`, `mild`, or `strong`. Enforced by the validator. |
| `blur` | Blank, `none`, `mild`, or `strong`. Enforced by the validator. |
| `perspective` | Blank, `none`, `mild`, or `strong`. Enforced by the validator. |
| `occlusion` | Blank, `none`, `mild`, or `strong`. Enforced by the validator. |
| `lighting` | Blank, `normal`, `low`, `harsh`, or `mixed`. Enforced by the validator. |
| `label_visibility` | Blank, `full`, `partial`, `tiny`, or `none`. Enforced by the validator. |
| `multiple_bottles` | Blank, `yes`, or `no`. Enforced by the validator. A `yes` row without a target box produces a warning. |
| `label_bbox_xyxy` | Label box in original-image pixels as `x1,y1,x2,y2`. The validator checks integer order and image bounds. |
| `visible_year` | Year visibly printed on the photographed label; do not infer it. |
| `visible_text` | Short manual transcription of decisive label text. |
| `notes` | Ambiguity, damage, glare, competing slugs, or the reason for exclusion. |

Manually entered boxes, years, and text are annotations for analysis or an
explicit oracle experiment. Feeding them into a test prediction would overstate
production performance unless an automatic detector or OCR system supplies the
same information at inference time.

Useful additions to the dataset, in priority order, are independent field
photos of confusing sibling products and vintages, photos from multiple
physical bottles per important slug, realistic out-of-catalog wine labels,
label boxes for detector training, and varied glare, angle, blur, distance, and
lighting conditions. Crops and augmentations do not count as independent test
examples.

## Validate the mapping

Run:

```bash
.venv/bin/wine-cv validate-field \
  --manifest data/field_mapping.tsv \
  --report work/field-validation.json
```

The command prints the same JSON report to the terminal and exits with status 1
when `valid` is false. The report contains row count, errors, warnings, label and
split counts, derived gallery-state counts, catalog count, and gallery count.
An untouched template can validate while all rows remain in `pool`; validation
checks consistency, while export additionally requires eligible rows in the
requested active split.

## Export benchmark inputs

After validation, export development and test inputs separately:

```bash
.venv/bin/wine-cv export-field-eval \
  --manifest data/field_mapping.tsv \
  --split dev \
  --output-dir work/field-eval

.venv/bin/wine-cv export-field-eval \
  --manifest data/field_mapping.tsv \
  --split test \
  --output-dir work/field-eval
```

Each export validates the entire master manifest first. It then selects rows
that satisfy all of these conditions:

- the requested `dev` or `test` split;
- `label_status=confirmed`;
- `true_slug` is present in the current 928-slug gallery;
- `source_kind` is `field` or `organizer`.

Synthetic images and saved crops are excluded as independent benchmark
queries. So are `not_in_catalog`, `uncertain`, `exclude`, and confirmed but
currently `not_indexed` rows.

The command writes:

- `work/field-eval/queries.<split>.tsv` with `query_id` and `image_path`;
- `work/field-eval/labels.<split>.tsv` with `query_id` and exact `slug`;
- `work/field-eval/export.<split>.json` with exported and excluded counts.

It refuses to export an invalid manifest or a split with no eligible rows. The
query and label files contain exactly the same IDs, as required by the benchmark
runner.

Because exported image paths remain relative to the repository root, use
`--images-dir .` when benchmarking them. For example, on the GPU VM:

```bash
.venv/bin/wine-cv benchmark \
  --pipeline siglip2 \
  --gallery work/gallery-strict.jsonl \
  --data-root . \
  --manifest work/field-eval/queries.dev.tsv \
  --images-dir . \
  --labels work/field-eval/labels.dev.tsv \
  --device cuda \
  --precision float16 \
  --batch-size 16 \
  --top-k 20 \
  --output work/siglip2-dev-predictions.jsonl \
  --summary work/siglip2-dev-summary.json
```

Use the same gallery, model revision, preprocessing, and hardware settings when
comparing runs. Tune on `dev`; run `test` only after the configuration is
frozen.

The official test expected on 1 October is a separate sealed package governed by
[`eval/README.md`](../../eval/README.md). Do not copy it into this development
manifest or relabel it after inspecting predictions.
