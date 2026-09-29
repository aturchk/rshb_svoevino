import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, 'README-assets')
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')

const rows = readFileSync(join(root, 'training-curve.csv'), 'utf8')
  .trim().split('\n').slice(1).map((line) => {
    const [epoch, loss, top1, recall5] = line.split(',')
    return { epoch: Number(epoch), loss: loss ? Number(loss) : null, top1: Number(top1), recall5: Number(recall5) }
  })
const x = (epoch) => 82 + epoch * 42
const y = (value) => 300 - (value - 0.89) / 0.12 * 220
const top1 = rows.map((row) => `${x(row.epoch)},${y(row.top1).toFixed(1)}`).join(' ')
const recall = rows.map((row) => `${x(row.epoch)},${y(row.recall5).toFixed(1)}`).join(' ')
writeFileSync(join(out, 'training-curve.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="380" viewBox="0 0 820 380">
<rect width="820" height="380" rx="24" fill="#111827"/><text x="42" y="48" fill="#fff" font-family="system-ui" font-size="24" font-weight="700">Adapter converges by epoch 13–14</text>
<text x="42" y="74" fill="#9ca3af" font-family="system-ui" font-size="14">Synthetic training proxy — not field accuracy</text>
<line x1="82" y1="300" x2="712" y2="300" stroke="#374151"/><line x1="82" y1="80" x2="82" y2="300" stroke="#374151"/>
<polyline points="${top1}" fill="none" stroke="#34d399" stroke-width="4"/><polyline points="${recall}" fill="none" stroke="#60a5fa" stroke-width="4"/>
<circle cx="${x(14)}" cy="${y(rows[14].top1).toFixed(1)}" r="7" fill="#34d399"/><text x="${x(14)-15}" y="${y(rows[14].top1)-14}" fill="#fff" font-family="system-ui" font-size="14">95.04%</text>
<text x="82" y="326" fill="#9ca3af" font-family="system-ui" font-size="13">0</text><text x="700" y="326" fill="#9ca3af" font-family="system-ui" font-size="13">15 epochs</text>
<circle cx="90" cy="350" r="5" fill="#34d399"/><text x="104" y="355" fill="#d1d5db" font-family="system-ui" font-size="14">Top-1</text><circle cx="190" cy="350" r="5" fill="#60a5fa"/><text x="204" y="355" fill="#d1d5db" font-family="system-ui" font-size="14">Recall@5</text></svg>`)

const methods = [
  { name: 'Adapter-SigLIP', top1: 94.0733, p95: 84.89, color: '#34d399' },
  { name: 'SigLIP + ORB', top1: 94.181, p95: 133.5, color: '#f59e0b' },
]
const cards = methods.map((m, i) => `<g transform="translate(${50 + i * 365} 104)"><rect width="330" height="205" rx="20" fill="#1f2937" stroke="${m.color}" stroke-width="2"/><text x="24" y="42" fill="#fff" font-family="system-ui" font-size="20" font-weight="700">${esc(m.name)}</text><text x="24" y="92" fill="${m.color}" font-family="system-ui" font-size="38" font-weight="800">${m.top1.toFixed(2)}%</text><text x="24" y="116" fill="#9ca3af" font-family="system-ui" font-size="14">Top-1 · synthetic proxy</text><text x="24" y="166" fill="#fff" font-family="system-ui" font-size="30" font-weight="700">${m.p95.toFixed(1)} ms</text><text x="24" y="190" fill="#9ca3af" font-family="system-ui" font-size="14">p95 latency</text></g>`).join('')
writeFileSync(join(out, 'latency-vs-quality.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="380" viewBox="0 0 820 380"><rect width="820" height="380" rx="24" fill="#111827"/><text x="42" y="48" fill="#fff" font-family="system-ui" font-size="24" font-weight="700">ORB adds latency, not meaningful proxy quality</text><text x="42" y="74" fill="#9ca3af" font-family="system-ui" font-size="14">+0.108 pp Top-1 · +48.61 ms p95</text>${cards}<text x="50" y="348" fill="#d1d5db" font-family="system-ui" font-size="15">Decision: adapter-SigLIP is the production default; ORB stays a field-eval feature flag.</text></svg>`)

const gates = [
  ['Reproducible runtime', 'READY', '#34d399'],
  ['GPU latency proxy', 'READY', '#34d399'],
  ['100 real-photo labels', 'PENDING', '#f59e0b'],
  ['Field accuracy + thresholds', 'BLOCKED', '#ef4444'],
  ['Full 2,103 SKU coverage', 'BLOCKED', '#ef4444'],
]
const gateRows = gates.map(([label, status, color], i) => `<g transform="translate(54 ${95 + i * 52})"><rect width="712" height="40" rx="12" fill="#1f2937"/><circle cx="22" cy="20" r="7" fill="${color}"/><text x="42" y="26" fill="#fff" font-family="system-ui" font-size="16">${esc(label)}</text><text x="690" y="26" fill="${color}" text-anchor="end" font-family="system-ui" font-size="14" font-weight="700">${status}</text></g>`).join('')
writeFileSync(join(out, 'readiness-gates.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="400" viewBox="0 0 820 400"><rect width="820" height="400" rx="24" fill="#111827"/><text x="42" y="48" fill="#fff" font-family="system-ui" font-size="24" font-weight="700">Production readiness is now data-gated</text><text x="42" y="74" fill="#9ca3af" font-family="system-ui" font-size="14">Engineering candidate is integrated; claims wait for reviewed evidence.</text>${gateRows}</svg>`)

const files = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
  .filter((path) => !path.endsWith('MANIFEST.sha256'))
  .filter((path) => statSync(path).isFile())
  .sort()
const manifest = files(root).map((path) => {
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  return `${digest}  ${relative(root, path)}`
}).join('\n')
writeFileSync(join(root, 'MANIFEST.sha256'), `${manifest}\n`)
