/** GET /api/health → liveness probe for hosting platforms (public, no data). */
export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() })
}
