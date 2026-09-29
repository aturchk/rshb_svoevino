import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readAnnotationState, saveAnnotation } from '../server/utils/annotation-store.ts'

const columns = [
  'query_id',
  'image_path',
  'image_sha256',
  'source_kind',
  'parent_query_id',
  'bottle_group_id',
  'split',
  'label_status',
  'true_slug',
  'review_status',
  'reviewer_ids',
  'adjudicator_id',
  'capture_session_id',
  'glare',
  'blur',
  'perspective',
  'occlusion',
  'lighting',
  'label_visibility',
  'multiple_bottles',
  'label_bbox_xyxy',
  'visible_year',
  'visible_text',
  'notes',
]

describe('annotation store', () => {
  let root = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'wine-annotation-'))
    process.env.ANNOTATION_REPO_ROOT = root
    await mkdir(join(root, 'data'), { recursive: true })
    await mkdir(join(root, 'dataset', 'real_photo'), { recursive: true })
    await writeFile(join(root, 'dataset', 'real_photo', 'query.webp'), 'image')
    await writeFile(
      join(root, 'data', 'catalog_lookup.tsv'),
      [
        'slug\twine_name\twinery\tcategory\tregion\tgrape\tgallery_state\treference_image_path',
        'wine-one\tВино один\tВинодельня\tКрасное\tКрым\tМерло\tindexed\t',
      ].join('\n') + '\n',
    )
    const values: Record<string, string> = {
      query_id: 'field-000001',
      image_path: 'dataset/real_photo/query.webp',
      image_sha256: 'a'.repeat(64),
      source_kind: 'field',
      split: 'pool',
      review_status: 'pending',
    }
    await writeFile(
      join(root, 'data', 'field_mapping.tsv'),
      `${columns.join('\t')}\n${columns.map((column) => values[column] ?? '').join('\t')}\n`,
    )
  })

  afterAll(async () => {
    delete process.env.ANNOTATION_REPO_ROOT
    await rm(root, { recursive: true, force: true })
  })

  it('atomically persists a reviewed exact catalog slug', async () => {
    const before = await readAnnotationState()
    expect(before.queries[0]?.reviewStatus).toBe('pending')

    const updated = await saveAnnotation({
      queryId: 'field-000001',
      imageSha256: 'a'.repeat(64),
      labelStatus: 'confirmed',
      trueSlug: 'wine-one',
      reviewerId: 'r01',
    })
    expect(updated).toMatchObject({
      labelStatus: 'confirmed',
      trueSlug: 'wine-one',
      reviewStatus: 'single_reviewed',
      reviewerIds: 'r01',
    })
    const source = await readFile(join(root, 'data', 'field_mapping.tsv'), 'utf8')
    expect(source).toContain('\tconfirmed\twine-one\tsingle_reviewed\tr01\t')
  })
})
