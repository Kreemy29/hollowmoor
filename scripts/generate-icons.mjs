/**
 * Generates the PWA/notification icons and the favicon.
 *
 * The icon is a real Kindred drawn by the same procedural generator the game
 * uses (app/lib/sprite.ts), so the app's mark and its creatures can never drift
 * apart stylistically. Run with `npm run icons`.
 */
import { build } from 'esbuild'
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(path.join(root, '.scratch'), { recursive: true })

await build({
  entryPoints: [path.join(root, 'app/lib/sprite.ts')],
  bundle: true,
  format: 'esm',
  outfile: path.join(root, '.scratch/sprite-icons.mjs'),
  logLevel: 'error',
})
const sprite = await import(pathToFileURL(path.join(root, '.scratch/sprite-icons.mjs')).href)

const BG = [11, 7, 22] // --color-haze-950

function hslToRgb(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function parseColor(css) {
  if (css.startsWith('#')) {
    const n = parseInt(css.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m = css.match(/hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/)
  if (m) return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]))
  return [255, 255, 255]
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Minimal 8-bit RGB PNG encoder — enough for a flat pixel-art icon. */
function encodePng(pixels, size) {
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function renderIcon(size, speciesId, archetype, stage, hue) {
  const grid = sprite.buildSprite(speciesId, archetype, stage)
  const pal = sprite.palette(hue, false)
  const colors = {
    [sprite.OUTLINE]: parseColor(pal.outline),
    [sprite.SHADOW]: parseColor(pal.shadow),
    [sprite.BASE]: parseColor(pal.base),
    [sprite.LIGHT]: parseColor(pal.light),
    [sprite.EYE]: parseColor(pal.eye),
    [sprite.ACCENT]: parseColor(pal.accent),
  }

  const pixels = Buffer.alloc(size * size * 3)
  // 12.5% padding so the creature isn't jammed against the icon edge.
  const inset = Math.round(size * 0.125)
  const scale = (size - inset * 2) / sprite.GRID

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - inset) / scale)
      const gy = Math.floor((y - inset) / scale)
      let rgb = BG
      if (gx >= 0 && gy >= 0 && gx < sprite.GRID && gy < sprite.GRID) {
        const slot = grid[gy * sprite.GRID + gx]
        if (slot !== sprite.EMPTY) rgb = colors[slot] ?? BG
      }
      const i = (y * size + x) * 3
      pixels[i] = rgb[0]
      pixels[i + 1] = rgb[1]
      pixels[i + 2] = rgb[2]
    }
  }
  return encodePng(pixels, size)
}

// Forgewarden — the fully-grown Emberkin. The thing you're working toward.
const SPEC = { id: 'emberkin', archetype: 'beast', stage: 3, hue: 22 }

for (const size of [192, 512]) {
  const png = renderIcon(size, SPEC.id, SPEC.archetype, SPEC.stage, SPEC.hue)
  writeFileSync(path.join(root, 'public', `icon-${size}.png`), png)
  console.log(`public/icon-${size}.png (${png.length} bytes)`)
}

// The favicon is SVG so it stays crisp at 16px in a browser tab.
const grid = sprite.buildSprite(SPEC.id, SPEC.archetype, SPEC.stage)
const paths = sprite.spritePaths(grid, sprite.palette(SPEC.hue, false))
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<rect width="16" height="16" fill="#0b0716"/>
${paths.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('\n')}
</svg>
`
writeFileSync(path.join(root, 'public', 'favicon.svg'), svg)
console.log('public/favicon.svg')
