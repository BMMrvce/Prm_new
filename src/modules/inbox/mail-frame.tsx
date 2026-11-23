'use client'

import { ImageOff } from 'lucide-react'
import { useState } from 'react'

/**
 * Remote mail HTML, rendered only here: a sandboxed iframe WITHOUT allow-scripts and
 * WITHOUT allow-same-origin, so the message runs in an opaque origin, cannot script, submit
 * forms, navigate the app or read anything of ours. A CSP inside the frame blocks every
 * fetch; remote images, styles and fonts load only when the reader asks (they are often
 * trackers). Links open in a new tab.
 *
 * Mail is authored for white paper and cannot read the app's tokens, so the frame keeps a
 * light canvas in both themes (system colors, no hex).
 */
function frameHead(remote: boolean) {
  const csp = remote
    ? "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src data: https:"
    : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"
  return (
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<meta name="referrer" content="no-referrer"><base target="_blank">' +
    '<style>html{color-scheme:light;-webkit-text-size-adjust:100%}' +
    'body{margin:0;padding:16px;font:14px/1.55 system-ui,sans-serif;color:CanvasText;background:Canvas;overflow-wrap:anywhere}' +
    'img{max-width:100%!important;height:auto!important}table{max-width:100%!important}pre{white-space:pre-wrap}</style>'
  )
}

const REMOTE = /(?:src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:|<link\b/i

export function MailFrame({ title, html }: { title: string; html: string }) {
  const [remote, setRemote] = useState(false)
  const hasRemote = REMOTE.test(html)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasRemote && !remote && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-surface-2 px-4 py-2 text-xs text-ink-2">
          <ImageOff size={14} aria-hidden />
          <span className="flex-1">Remote images are hidden to protect your privacy.</span>
          <button type="button" onClick={() => setRemote(true)} className="font-medium text-primary-ink hover:underline">
            Show images
          </button>
        </div>
      )}
      <iframe
        key={remote ? 'remote' : 'local'}
        title={`Message: ${title}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={`<!doctype html><html><head>${frameHead(remote)}</head><body>${html}</body></html>`}
        className="block min-h-[60vh] w-full flex-1 [color-scheme:light]"
      />
    </div>
  )
}
