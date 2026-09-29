import sharp from 'sharp'

/** Deterministic 16×16 difference hash shared by the index builder and server. */
export async function imageDhash(image: Uint8Array): Promise<string> {
  const { data, info } = await sharp(image, { failOn: 'error' })
    .rotate()
    .greyscale()
    .normalize()
    .resize(17, 16, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== 17 || info.height !== 16 || info.channels !== 1) {
    throw new Error('Unexpected image hash dimensions')
  }
  let bits = 0n
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      bits = (bits << 1n) | BigInt(data[y * 17 + x]! > data[y * 17 + x + 1]! ? 1 : 0)
    }
  }
  return bits.toString(16).padStart(64, '0')
}

export function dhashSimilarity(left: string, right: string): number {
  let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
  let mismatches = 0
  while (difference) {
    difference &= difference - 1n
    mismatches++
  }
  return 1 - mismatches / 256
}
