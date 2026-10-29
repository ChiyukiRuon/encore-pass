import { expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import {
    remoteRequestBudget,
    serializeRemotePayload,
} from '@/lib/wallet/remote-payload'

it('leaves a small request unchanged', async () => {
    const payload = {
        style: 'eventTicket',
        description: '合成测试',
        background_png_b64: 'AA==',
    }
    expect(await serializeRemotePayload(payload)).toBe(JSON.stringify(payload))
})

it('bounds a photographic-sized PNG request including base64 and preserves fields', async () => {
    const png = await sharp(randomBytes(1035 * 1515 * 3), {
        raw: { width: 1035, height: 1515, channels: 3 },
    })
        .png()
        .toBuffer()
    const payload = {
        style: 'generic',
        poster: true,
        description: '合成测试',
        barcode_message: 'SYNTHETIC-ONLY',
        primary_fields: [{ key: 'event', value: '保留原始文字' }],
        background_png_b64: png.toString('base64'),
    }
    const original = JSON.stringify(payload)
    expect(Buffer.byteLength(original)).toBeGreaterThan(remoteRequestBudget)
    const body = await serializeRemotePayload(payload)
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(remoteRequestBudget)
    expect(JSON.stringify(payload)).toBe(original)
    const result = JSON.parse(body)
    expect(result).toMatchObject({
        ...payload,
        background_png_b64: expect.any(String),
    })
    const metadata = await sharp(
        Buffer.from(result.background_png_b64, 'base64'),
    ).metadata()
    expect(metadata.format).toBe('png')
    expect(metadata.width! / metadata.height!).toBeCloseTo(1035 / 1515, 2)
    expect(metadata.width).toBeLessThanOrEqual(1035)
}, 20_000)

it('rejects oversized non-image data before making a request', async () => {
    await expect(
        serializeRemotePayload({
            description: 'x'.repeat(remoteRequestBudget),
        }),
    ).rejects.toMatchObject({ status: 413, code: 'REMOTE_PAYLOAD_TOO_LARGE' })
})
