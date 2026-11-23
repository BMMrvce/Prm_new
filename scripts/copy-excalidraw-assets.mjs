// Copies the whiteboard's fonts into public/excalidraw/ so they are served from our own
// origin (the Content Security Policy only allows same-origin fonts). Runs after install.
// The large CJK font (Xiaolai, ~13 MB) is skipped; those characters fall back to system fonts.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const target = path.join(root, 'public/excalidraw/fonts')

if (!existsSync(source)) {
  console.warn('[excalidraw] fonts not found; skipping (is @excalidraw/excalidraw installed?)')
  process.exit(0)
}
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const family of readdirSync(source)) {
  if (family === 'Xiaolai') continue
  cpSync(path.join(source, family), path.join(target, family), { recursive: true })
}
console.log('[excalidraw] fonts copied to public/excalidraw/fonts')
