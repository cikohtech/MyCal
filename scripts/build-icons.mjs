/** Renders the app mark to the PNG sizes the manifest and iOS ask for. */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const mark = readFileSync(new URL('./icon.svg', import.meta.url))
const maskable = readFileSync(new URL('./icon-maskable.svg', import.meta.url))

const jobs = [
  [mark, 192, 'public/icons/icon-192.png'],
  [mark, 512, 'public/icons/icon-512.png'],
  [mark, 180, 'public/icons/apple-touch-icon.png'],
  [maskable, 512, 'public/icons/icon-maskable-512.png'],
]

await Promise.all(jobs.map(([svg, size, out]) =>
  sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(out)))

console.log(`wrote ${jobs.length} icons`)
