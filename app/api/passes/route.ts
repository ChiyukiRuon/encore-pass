import { exportTicketSchema, barcodeSchema } from '@/lib/ticket/schema'
import { barcodeProblem } from '@/lib/ticket/validation'
import { buildPass, signingMode } from '@/lib/wallet/pass-builder'
import { AppError, errorResponse } from '@/lib/server/errors'
import { readLimitedJson, reserveGeneration } from '@/lib/server/limits'
import { remoteDownloadUrl } from '@/lib/wallet/signers/remote'

export const runtime = 'nodejs'

export async function POST(request: Request) {
    let release: (() => void) | undefined
    try {
        const origin = request.headers.get('origin')
        if (origin) {
            let allowed = false
            try {
                const parsedOrigin = new URL(origin)
                allowed = process.env.APP_ORIGIN
                    ? origin === new URL(process.env.APP_ORIGIN).origin
                    : ['http:', 'https:'].includes(parsedOrigin.protocol) &&
                      parsedOrigin.host ===
                          (request.headers.get('host') ||
                              new URL(request.url).host)
            } catch {
                /* Malformed origins are denied. */
            }
            if (!allowed)
                return errorResponse(403, 'FORBIDDEN', '禁止跨来源导出')
        }
        if (
            !request.headers.get('content-type')?.startsWith('application/json')
        )
            return errorResponse(400, 'INVALID_TICKET', '仅接受 JSON 请求')
        release = reserveGeneration()
        const body = await readLimitedJson(request)
        if (
            body &&
            typeof body === 'object' &&
            'barcodeEnabled' in body &&
            body.barcodeEnabled === true &&
            'barcode' in body &&
            body.barcode !== undefined
        ) {
            const parsed = barcodeSchema.safeParse(body.barcode)
            if (!parsed.success)
                return errorResponse(
                    422,
                    'UNSUPPORTED_BARCODE',
                    '条码格式或编码无效',
                )
            const problem = barcodeProblem(parsed.data)
            if (problem)
                return errorResponse(422, 'UNSUPPORTED_BARCODE', problem)
        }
        const parsed = exportTicketSchema.safeParse(body)
        if (!parsed.success)
            return errorResponse(
                400,
                'INVALID_TICKET',
                '请检查票卡字段',
                parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            )
        // Retain the concurrency slot until background work actually ends, even after a deadline response.
        const finish = release
        release = undefined
        const remoteSign =
            request.headers.get('x-encore-remote-sign') === 'walletmcppass'
        if (signingMode() === 'remote' && !remoteSign) {
            finish()
            throw new AppError(
                400,
                'REMOTE_CONSENT_REQUIRED',
                '请先确认将票卡发送到第三方',
            )
        }
        const job = buildPass(parsed.data, remoteSign).finally(finish)
        let timer: ReturnType<typeof setTimeout> | undefined
        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(
                        new AppError(
                            503,
                            'SIGNING_UNAVAILABLE',
                            '生成超时，请稍后重试',
                        ),
                    ),
                20_000,
            )
        })
        const result = await Promise.race([job, deadline]).finally(() =>
            clearTimeout(timer),
        )
        return new Response(new Uint8Array(result), {
            headers: {
                'Content-Type': 'application/vnd.apple.pkpass',
                'Content-Disposition': 'attachment; filename="ticket.pkpass"',
                'Cache-Control': 'no-store',
                ...(remoteDownloadUrl(result)
                    ? { 'X-Wallet-Download-Url': remoteDownloadUrl(result)! }
                    : {}),
            },
        })
    } catch (error) {
        if (error instanceof AppError)
            return errorResponse(error.status, error.code, error.message)
        return errorResponse(
            500,
            'PASS_GENERATION_FAILED',
            '票卡生成失败，请检查服务端配置',
        )
    } finally {
        release?.()
    }
}
