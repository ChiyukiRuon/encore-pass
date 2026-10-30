import sharp from 'sharp'
// Lazy alternatives: advance only after an upstream HTTP 413. There is no
// guessed request-size cap and no compression before the first request.
export async function* remotePayloadBodies(payload: Record<string, unknown>) {
    const request = { ...payload }
    let body = JSON.stringify(request)
    yield body
    let previousLength = Buffer.byteLength(body)

    const images = Object.entries(payload)
        .filter(
            ([key, value]) =>
                key.endsWith('_png_b64') && typeof value === 'string',
        )
        .map(
            ([key, value]) =>
                [key, Buffer.from(value as string, 'base64')] as const,
        )

    // Try lossless optimization first. Keep the smallest encoding per image.
    for (const [key, source] of images) {
        if (source.length < 16 * 1024) continue
        const input = sharp(source, {
            limitInputPixels: 16_000_000,
        }).timeout({ seconds: 5 })
        const optimized = await input
            .png({
                compressionLevel: 9,
                adaptiveFiltering: true,
            })
            .toBuffer()
        if (optimized.length < source.length)
            request[key] = optimized.toString('base64')
    }
    body = JSON.stringify(request)
    if (Buffer.byteLength(body) < previousLength) {
        previousLength = Buffer.byteLength(body)
        yield body
    }

    // Compress photographic surfaces only; logos, icons and thumbnails retain
    // their lossless @3x pixels. Each attempt starts from the original, and
    // the final size floor is @2x (the input is rendered at @3x).
    const artwork = images.filter(
        ([key]) => key === 'artwork_png_b64' || key === 'background_png_b64',
    )
    for (const [colours, scale] of [
        [256, 1],
        [128, 1],
        [128, 2 / 3],
    ]) {
        for (const [key, source] of artwork) {
            const input = sharp(source, {
                limitInputPixels: 16_000_000,
            }).timeout({ seconds: 5 })
            const metadata = await input.metadata()
            const compressed = await input
                .resize({
                    width: Math.max(1, Math.round(metadata.width! * scale)),
                    withoutEnlargement: true,
                })
                .png({
                    palette: true,
                    colours,
                    dither: 0.5,
                    effort: 1,
                    compressionLevel: 9,
                })
                .toBuffer()
            const encoded = compressed.toString('base64')
            if (encoded.length < (request[key] as string).length)
                request[key] = encoded
        }
        body = JSON.stringify(request)
        if (Buffer.byteLength(body) < previousLength) {
            previousLength = Buffer.byteLength(body)
            yield body
        }
    }
}
