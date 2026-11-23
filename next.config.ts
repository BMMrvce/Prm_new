import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Node-only mail libraries; load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ['imapflow', 'mailparser', 'nodemailer'],
  turbopack: {
    root: path.resolve(dirname),
  },
  // `pnpm dev` only answers localhost by default. Allow Cloudflare quick tunnels
  // (`cloudflared tunnel --url http://localhost:3000`) plus any hosts listed in
  // ALLOWED_DEV_ORIGINS (comma-separated hostnames, e.g. "*.ngrok-free.app").
  allowedDevOrigins: [
    '*.trycloudflare.com',
    ...(process.env.ALLOWED_DEV_ORIGINS ?? '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  ],
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.SITE_URL || 'http://localhost:3000',
  },
}

export default nextConfig
