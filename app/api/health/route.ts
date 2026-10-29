import { signingMode } from '@/lib/wallet/pass-builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET() {
    return Response.json(
        { status: 'ok', signingMode: signingMode() },
        { headers: { 'Cache-Control': 'no-store' } },
    )
}
