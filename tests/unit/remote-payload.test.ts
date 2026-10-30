import { expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { remotePayloadBodies } from '@/lib/wallet/remote-payload'

it('sends the original above the former budget without decoding images', async () => {
    const payload = {
        description: 'x'.repeat(1_000_000),
        logo_png_b64: 'not decoded yet',
    }
    const bodies = remotePayloadBodies(payload)
    expect((await bodies.next()).value).toBe(JSON.stringify(payload))
    await bodies.return()
})

it('offers lossless optimization only after rejection', async () => {
    const pixels = Buffer.alloc(1035 * 1515 * 4)
    for (let i = 0; i < pixels.length; i++) pixels[i] = i % 251
    const png = await sharp(pixels, {
        raw: { width: 1035, height: 1515, channels: 4 },
    })
        .png({ compressionLevel: 0 })
        .toBuffer()
    const payload = {
        background_png_b64: png.toString('base64'),
        barcode_message: 'SYNTHETIC-ONLY',
    }
    const bodies = remotePayloadBodies(payload)
    const original = (await bodies.next()).value!
    const optimized = (await bodies.next()).value!
    expect(optimized.length).toBeLessThan(original.length)
    const result = JSON.parse(optimized)
    expect(result.barcode_message).toBe(payload.barcode_message)
    expect(
        await sharp(Buffer.from(result.background_png_b64, 'base64'))
            .raw()
            .toBuffer(),
    ).toEqual(pixels)
    expect(JSON.stringify(payload)).toBe(original)
    await bodies.return()
})

it('offers finitely many smaller alternatives, protects logos and stops at @2x', async () => {
    const png = await sharp(randomBytes(1074 * 1344 * 3), {
        raw: { width: 1074, height: 1344, channels: 3 },
    })
        .png()
        .toBuffer()
    const logo = await sharp({
        create: {
            width: 480,
            height: 150,
            channels: 4,
            background: { r: 60, g: 80, b: 100, alpha: 0.5 },
        },
    })
        .png()
        .toBuffer()
    const payload = {
        artwork_png_b64: png.toString('base64'),
        logo_png_b64: logo.toString('base64'),
        thumbnail_png_b64: logo.toString('base64'),
    }
    const bodies: string[] = []
    for await (const body of remotePayloadBodies(payload)) bodies.push(body)
    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < bodies.length; i++) {
        expect(bodies[i].length).toBeLessThan(bodies[i - 1].length)
        const result = JSON.parse(bodies[i])
        expect(result.logo_png_b64).toBe(payload.logo_png_b64)
        expect(result.thumbnail_png_b64).toBe(payload.thumbnail_png_b64)
        const meta = await sharp(
            Buffer.from(result.artwork_png_b64, 'base64'),
        ).metadata()
        expect(meta.width).toBeGreaterThanOrEqual(716)
        expect(meta.height).toBeGreaterThanOrEqual(896)
    }
    expect(JSON.parse(bodies[0])).toEqual(payload)
}, 20_000)

it('does not repeat identical requests without compressible images', async () => {
    const payload = { description: 'x'.repeat(1_000_000) }
    const bodies = []
    for await (const body of remotePayloadBodies(payload)) bodies.push(body)
    expect(bodies).toEqual([JSON.stringify(payload)])
})
