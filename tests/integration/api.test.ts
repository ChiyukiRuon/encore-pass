import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/passes/route'
import { GET } from '@/app/api/health/route'
import { buildResources } from '@/lib/wallet/pass-builder'
import { ticket } from '../fixtures/ticket'
import sharp from 'sharp'

const issuer = {
    passTypeIdentifier: 'pass.test',
    teamIdentifier: 'TEST',
    organizationName: 'Test',
}
async function imageUrl(width: number, height: number) {
    const png = await sharp({
        create: { width, height, channels: 3, background: '#226644' },
    })
        .png()
        .toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
}
async function size(file: Buffer) {
    const metadata = await sharp(file).metadata()
    return [metadata.width, metadata.height]
}

it.each([false, true])(
    'exports generic thumbnails only without background (background: %s)',
    async (hasBackground) => {
        const dataUrl = await imageUrl(64, 32)
        for (const barcodeEnabled of [false, true]) {
            const files = await buildResources(
                {
                    ...ticket,
                    passStyle: 'posterGeneric',
                    barcodeEnabled,
                    appearance: {
                        ...ticket.appearance,
                        backgroundDataUrl: hasBackground ? dataUrl : undefined,
                        thumbnailDataUrl: dataUrl,
                        heroDataUrl: dataUrl,
                        secondaryLogoDataUrl: dataUrl,
                    },
                },
                issuer,
            )
            expect(
                Object.keys(files).some((name) => /secondaryLogo/.test(name)),
            ).toBe(false)
            for (const scale of [2, 3]) {
                expect(!!files[`thumbnail@${scale}x.png`]).toBe(!hasBackground)
            }
        }
    },
)

it('exports HIG-sized logo, corner thumbnail, footer mark and background together', async () => {
    const dataUrl = await imageUrl(640, 320)
    const files = await buildResources(
        {
            ...ticket,
            appearance: {
                ...ticket.appearance,
                logoDataUrl: dataUrl,
                thumbnailDataUrl: dataUrl,
                secondaryLogoDataUrl: dataUrl,
                backgroundDataUrl: dataUrl,
            },
        },
        issuer,
    )
    for (const scale of [2, 3]) {
        expect(await size(files[`logo@${scale}x.png`])).toEqual([
            100 * scale,
            50 * scale,
        ])
        expect(await size(files[`thumbnail@${scale}x.png`])).toEqual([
            90 * scale,
            90 * scale,
        ])
        expect(await size(files[`secondaryLogo@${scale}x.png`])).toEqual([
            24 * scale,
            12 * scale,
        ])
        expect(await size(files[`background@${scale}x.png`])).toEqual([
            343 * scale,
            503 * scale,
        ])
    }
    const { data, info } = await sharp(files['thumbnail@2x.png'])
        .raw()
        .toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    expect(data[3]).toBe(0)
    expect(data[(90 * 180 + 90) * 4 + 3]).toBe(255)
    expect(files['background.png']).toBeUndefined()
    expect(files['strip.png']).toBeUndefined()
})

it.each(['eventTicket', 'posterEventTicket'] as const)(
    'composites the black background mask into %s backgrounds and artwork',
    async (passStyle) => {
        const files = await buildResources(
            {
                ...ticket,
                passStyle,
                appearance: {
                    ...ticket.appearance,
                    backgroundDataUrl: await imageUrl(640, 320),
                    backgroundMaskOpacity: 0.5,
                },
            },
            issuer,
        )
        for (const file of ['background@2x.png', 'artwork@2x.png']) {
            const { data } = await sharp(files[file])
                .raw()
                .toBuffer({ resolveWithObject: true })
            expect(Math.abs(data[0] - 17)).toBeLessThanOrEqual(1)
            expect(Math.abs(data[1] - 51)).toBeLessThanOrEqual(1)
            expect(Math.abs(data[2] - 34)).toBeLessThanOrEqual(1)
        }
    },
)

it.each(['posterEventTicket', 'posterGeneric'] as const)(
    'ignores retained background masks for %s in the poster layout',
    async (passStyle) => {
        const files = await buildResources(
            {
                ...ticket,
                passStyle,
                barcodeEnabled: true,
                appearance: {
                    ...ticket.appearance,
                    backgroundDataUrl: await imageUrl(640, 320),
                    backgroundMaskOpacity: 0.5,
                },
            },
            issuer,
        )
        for (const name of ['background', 'artwork']) {
            for (const scale of [2, 3]) {
                const data = await sharp(files[`${name}@${scale}x.png`])
                    .raw()
                    .toBuffer()
                expect([...data.subarray(0, 3)]).toEqual([34, 102, 68])
            }
        }
    },
)

it('keeps narrow logos at the minimum width and maps legacy strips to thumbnails', async () => {
    const files = await buildResources(
        {
            ...ticket,
            appearance: {
                ...ticket.appearance,
                logoDataUrl: await imageUrl(100, 400),
                heroDataUrl: await imageUrl(750, 196),
            },
        },
        issuer,
    )
    expect(await size(files['logo@2x.png'])).toEqual([100, 100])
    expect(await size(files['thumbnail@3x.png'])).toEqual([270, 270])
    expect(files['strip@2x.png']).toBeUndefined()
})

afterEach(() => vi.unstubAllEnvs())
function request(body: unknown, headers = {}) {
    return new Request('http://localhost/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    })
}

describe('pass API', () => {
    it('accepts the browser Host when Next uses a different internal URL', async () => {
        vi.stubEnv('EncorePass_SIGNING_MODE', 'preview')
        const response = await POST(
            request(ticket, {
                Host: '127.0.0.1:3000',
                Origin: 'http://127.0.0.1:3000',
            }),
        )
        expect(response.status).toBe(503)
        expect((await response.json()).error.code).toBe('SIGNING_UNAVAILABLE')
    })
    it('enforces a configured external origin', async () => {
        vi.stubEnv('APP_ORIGIN', 'https://tickets.example.test')
        expect(
            (
                await POST(
                    request(ticket, {
                        Host: 'localhost',
                        Origin: 'http://localhost',
                    }),
                )
            ).status,
        ).toBe(403)
    })
    it('returns non-secret health and refuses preview exports', async () => {
        vi.stubEnv('EncorePass_SIGNING_MODE', 'preview')
        expect(await GET().json()).toEqual({
            status: 'ok',
            signingMode: 'preview',
        })
        const response = await POST(request(ticket))
        expect(response.status).toBe(503)
        expect((await response.json()).error.code).toBe('SIGNING_UNAVAILABLE')
    })
    it('rejects client identity injection', async () =>
        expect(
            (await POST(request({ ...ticket, teamIdentifier: 'evil' }))).status,
        ).toBe(400))
    it('rejects oversized payloads before parsing', async () =>
        expect(
            (await POST(request(ticket, { 'Content-Length': '999999999' })))
                .status,
        ).toBe(413))
    it('rejects malformed JSON', async () =>
        expect(
            (
                await POST(
                    new Request('http://localhost/api/passes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{',
                    }),
                )
            ).status,
        ).toBe(400))
    it('rejects unsupported barcodes separately when the switch is on', async () =>
        expect(
            (
                await POST(
                    request({
                        ...ticket,
                        barcodeEnabled: true,
                        barcode: { ...ticket.barcode, format: 'EAN13' },
                    }),
                )
            ).status,
        ).toBe(422))
    it('rejects cross-origin exports', async () =>
        expect(
            (await POST(request(ticket, { Origin: 'https://other.test' })))
                .status,
        ).toBe(403))
    it('refuses unavailable local keys without exposing paths', async () => {
        vi.stubEnv('EncorePass_SIGNING_MODE', 'local')
        vi.stubEnv('PASS_TYPE_IDENTIFIER', 'pass.test')
        vi.stubEnv('APPLE_TEAM_ID', 'TEST')
        vi.stubEnv('PASS_CERT_PATH', '')
        expect((await POST(request(ticket))).status).toBe(503)
    })
})

it('builds unsigned assets without pretending they are installable', async () => {
    const files = await buildResources(ticket, {
        passTypeIdentifier: 'pass.test',
        teamIdentifier: 'TEST',
        organizationName: 'Test',
    })
    expect(Object.keys(files)).toEqual([
        'pass.json',
        'icon.png',
        'icon@2x.png',
        'icon@3x.png',
    ])
    const pass = JSON.parse(files['pass.json'].toString())
    expect(pass.eventTicket.primaryFields[0].value).toBe(ticket.eventName)
    expect(pass.barcodes).toBeUndefined()
})

it('rejects an image data URL with invalid content', async () => {
    await expect(
        buildResources(
            {
                ...ticket,
                appearance: {
                    ...ticket.appearance,
                    logoDataUrl: 'data:image/png;base64,aGVsbG8=',
                },
            },
            {
                passTypeIdentifier: 'pass.test',
                teamIdentifier: 'TEST',
                organizationName: 'Test',
            },
        ),
    ).rejects.toThrow('图片无效')
})
