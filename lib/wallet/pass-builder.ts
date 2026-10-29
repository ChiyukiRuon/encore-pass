import sharp from 'sharp'
import type { Sharp } from 'sharp'
import type { TicketDraft } from '@/lib/ticket/schema'
import { usesBackgroundMask } from '@/lib/ticket/validation'
import { passImageOutputs } from '@/lib/ticket/appearance'
import type { ImageOutput } from '@/lib/ticket/appearance'
import { mapPass } from './pass-mapper'
import type { Issuer } from './pass-mapper'
import { localSign } from './signers/local'
import { remoteSign as remoteSigner } from './signers/remote'
import { AppError } from '@/lib/server/errors'

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

type ImageSpec = (typeof passImageOutputs)[ImageOutput]

export function signingMode(): 'preview' | 'local' | 'remote' {
    const value = process.env.EncorePass_SIGNING_MODE || 'preview'
    return value === 'local' || value === 'remote' ? value : 'preview'
}

// Square artwork; Wallet rounds icon corners itself. One-colour brand mark
// (tilted ticket and sparkle), drawn on its 64-unit grid and scaled to fit.
function iconSvg({
    backgroundColor,
    foregroundColor,
}: TicketDraft['appearance']) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><rect width="38" height="38" fill="${backgroundColor}"/><g transform="translate(19 19.5) scale(0.62) translate(-32 -35)"><g transform="rotate(-10 32 35)"><path d="M23 16H26.8A5.2 5.2 0 0 0 37.2 16H41A5 5 0 0 1 46 21V49A5 5 0 0 1 41 54H23A5 5 0 0 1 18 49V21A5 5 0 0 1 23 16Z" fill="${foregroundColor}"/><path d="M22.5 45.5H41.5" stroke="${backgroundColor}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 3.8"/></g><path d="M46.5 4.5Q48.02 12.48 56 14Q48.02 15.52 46.5 23.5Q44.98 15.52 37 14Q44.98 12.48 46.5 4.5Z" fill="${foregroundColor}" stroke="${backgroundColor}" stroke-width="2.4" paint-order="stroke"/></g></svg>`,
    )
}

async function renderImage(
    source: Sharp,
    spec: ImageSpec,
    scale: number,
    blackOverlay = 0,
) {
    if (spec.fit === 'inside') {
        // Fit inside the slot without padding, except to reach its minimum width.
        const { data, info } = await source
            .resize(spec.width * scale, spec.height * scale, { fit: 'inside' })
            .png()
            .toBuffer({ resolveWithObject: true })
        const missing = (spec.minWidth ?? 0) * scale - info.width
        if (missing <= 0) return data
        return sharp(data)
            .extend({
                left: Math.floor(missing / 2),
                right: Math.ceil(missing / 2),
                background: transparent,
            })
            .png()
            .toBuffer()
    }
    let image = source.resize(spec.width * scale, spec.height * scale, {
        fit: 'cover',
    })
    if (spec.rounded) {
        // HIG: square thumbnail artwork with rounded corners, exported as transparent PNG.
        const size = spec.width * scale
        const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${12 * scale}"/></svg>`
        image = image
            .ensureAlpha()
            .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
    }
    if (blackOverlay > 0) {
        // The text mask is baked into the exported artwork, matching the preview.
        image = image.composite([
            {
                input: {
                    create: {
                        width: spec.width * scale,
                        height: spec.height * scale,
                        channels: 4,
                        background: {
                            r: 0,
                            g: 0,
                            b: 0,
                            alpha: blackOverlay,
                        },
                    },
                },
                blend: 'over',
            },
        ])
    }
    return image.png().toBuffer()
}

export async function buildResources(ticket: TicketDraft, issuer: Issuer) {
    const { appearance } = ticket
    const files: Record<string, Buffer> = {
        'pass.json': Buffer.from(JSON.stringify(mapPass(ticket, issuer))),
    }
    for (const scale of [1, 2, 3])
        files[`icon${scale === 1 ? '' : `@${scale}x`}.png`] = await sharp(
            iconSvg(appearance),
        )
            .resize(38 * scale, 38 * scale)
            .png()
            .toBuffer()

    const sources = {
        logo: appearance.logoDataUrl,
        thumbnail:
            ticket.passStyle === 'posterGeneric' && appearance.backgroundDataUrl
                ? undefined
                : appearance.thumbnailDataUrl || appearance.heroDataUrl,
        secondaryLogo:
            ticket.passStyle === 'posterGeneric'
                ? undefined
                : appearance.secondaryLogoDataUrl,
        background: appearance.backgroundDataUrl,
    }
    const decoded = new Map<keyof typeof sources, Sharp>()
    for (const [key, data] of Object.entries(sources) as [
        keyof typeof sources,
        string | undefined,
    ][]) {
        if (!data) continue
        const bytes = Buffer.from(data.split(',')[1], 'base64')
        if (bytes.length > 2 * 1024 * 1024)
            throw new AppError(413, 'PAYLOAD_TOO_LARGE', '图片不能超过 2 MB')
        try {
            const source = sharp(bytes, {
                limitInputPixels: 16_000_000,
                animated: false,
            })
                .timeout({ seconds: 5 })
                .rotate()
            const metadata = await source.metadata()
            if (!['png', 'jpeg', 'webp'].includes(metadata.format || ''))
                throw new Error('format')
            decoded.set(key, source)
        } catch {
            throw new AppError(400, 'INVALID_TICKET', '图片无效或像素数量超限')
        }
    }

    // One upload feeds both layouts: the classic logo/background and the poster
    // primaryLogo/artwork, plus the generic fallback for earlier iOS releases.
    const outputs: [ImageOutput, keyof typeof sources][] = [
        ['logo', 'logo'],
        ['primaryLogo', 'logo'],
        ['thumbnail', 'thumbnail'],
        ['secondaryLogo', 'secondaryLogo'],
        ['background', 'background'],
        ['artwork', 'background'],
    ]
    for (const [output, sourceKey] of outputs) {
        const source = decoded.get(sourceKey)
        if (!source) continue
        const overlay =
            usesBackgroundMask(ticket) &&
            (output === 'background' || output === 'artwork')
                ? appearance.backgroundMaskOpacity
                : 0
        for (const scale of [2, 3])
            files[`${output}@${scale}x.png`] = await renderImage(
                source.clone(),
                output === 'background' && ticket.passStyle === 'posterGeneric'
                    ? {
                          ...passImageOutputs.background,
                          width: 345,
                          height: 505,
                      }
                    : passImageOutputs[output],
                scale,
                overlay,
            )
    }
    return files
}

export async function buildPass(ticket: TicketDraft, remoteSign = false) {
    const mode = remoteSign ? 'remote' : signingMode()
    if (mode === 'preview')
        throw new AppError(
            503,
            'SIGNING_UNAVAILABLE',
            '当前为预览模式，配置 Apple 签名证书后才能导出 Wallet 票卡',
        )
    if (mode === 'remote') {
        return remoteSigner(
            await buildResources(ticket, {
                passTypeIdentifier: 'pass.com.arshwaraich.vps',
                teamIdentifier: '6U9WK83U3W',
                organizationName:
                    process.env.PASS_ORGANIZATION_NAME || 'EncorePass',
            }),
        )
    }
    const issuer = {
        passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || '',
        teamIdentifier: process.env.APPLE_TEAM_ID || '',
        organizationName: process.env.PASS_ORGANIZATION_NAME || 'EncorePass',
    }
    if (!issuer.passTypeIdentifier || !issuer.teamIdentifier)
        throw new AppError(503, 'SIGNING_UNAVAILABLE', '未配置签发者标识')
    return localSign(await buildResources(ticket, issuer), issuer)
}
