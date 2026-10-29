import sharp from 'sharp'
import { AppError } from '@/lib/server/errors'

// Keep the entire JSON (including base64 expansion) below a conservative
// reverse-proxy request budget. The provider does not publish its ingress cap.
export const remoteRequestBudget = 900 * 1024

export async function serializeRemotePayload(payload: Record<string, unknown>) {
    const request = { ...payload }
    let body = JSON.stringify(request)
    if (Buffer.byteLength(body) <= remoteRequestBudget) return body

    const images = Object.entries(payload)
        .filter(
            ([key, value]) =>
                key.endsWith('_png_b64') && typeof value === 'string',
        )
        .map(
            ([key, value]) =>
                [key, Buffer.from(value as string, 'base64')] as const,
        )

    // Always render from the original PNG, never from a previous quantized
    // result. Small logos and thumbnails retain their original dimensions.
    for (const [colours, ratio] of [
        [256, 1],
        [128, 0.75],
        [128, 0.5],
        [64, 0.35],
    ]) {
        for (const [key, source] of images) {
            if (source.length < 16 * 1024) continue
            const input = sharp(source, {
                limitInputPixels: 16_000_000,
            }).timeout({ seconds: 5 })
            const metadata = await input.metadata()
            const large =
                Math.max(metadata.width ?? 0, metadata.height ?? 0) > 400
            const width = large
                ? Math.max(1, Math.round(metadata.width! * ratio))
                : metadata.width
            request[key] = (
                await input
                    .resize({ width, withoutEnlargement: true })
                    .png({
                        palette: true,
                        colours,
                        dither: 0.5,
                        compressionLevel: 9,
                        effort: 1,
                    })
                    .toBuffer()
            ).toString('base64')
        }
        body = JSON.stringify(request)
        if (Buffer.byteLength(body) <= remoteRequestBudget) return body
    }
    throw new AppError(
        413,
        'REMOTE_PAYLOAD_TOO_LARGE',
        '图片压缩后仍超过远程签发请求限制，请减少图片或选择更小的图片',
    )
}
