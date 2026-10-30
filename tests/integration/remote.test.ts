import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import sharp from 'sharp'
import { POST } from '@/app/api/passes/route'
import { ticket } from '../fixtures/ticket'
import { buildResources } from '@/lib/wallet/pass-builder'
import { remoteSign } from '@/lib/wallet/signers/remote'
import { eventFieldKeys } from '@/lib/ticket/event-fields'

function signedFixture(pass: Record<string, unknown>) {
    const json = Buffer.from(JSON.stringify(pass))
    return new Response(
        new Uint8Array(
            zipSync({
                'pass.json': json,
                'manifest.json': Buffer.from(
                    JSON.stringify({
                        'pass.json': createHash('sha1')
                            .update(json)
                            .digest('hex'),
                    }),
                ),
                signature: Buffer.from('synthetic-signature'),
            }),
        ),
        { headers: { 'Content-Type': 'application/vnd.apple.pkpass' } },
    )
}

it('forwards enabled event details, semantic metadata and guide links to the signer', async () => {
    const png = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
    })
        .png()
        .toBuffer()
    const resources = await buildResources(
        {
            ...ticket,
            passStyle: 'posterEventTicket',
            barcodeEnabled: true,
            eventType: 'sports',
            eventFields: eventFieldKeys.filter((key) => key !== 'attendeeName'),
            eventInfo: {
                homeTeamAbbreviation: 'HME',
                awayTeamAbbreviation: 'AWY',
                admissionLevel: 'VIP',
                price: '120.50',
                currency: 'CNY',
                transitUrl: 'https://example.com/transit',
                attendeeName: 'PRIVATE-HIDDEN',
            },
            customFields: [
                {
                    id: ticket.id,
                    label: '集合地点',
                    value: '北广场',
                    enabled: true,
                },
            ],
            appearance: {
                ...ticket.appearance,
                backgroundDataUrl: `data:image/png;base64,${png.toString('base64')}`,
            },
        },
        {
            passTypeIdentifier: 'pass.com.arshwaraich.vps',
            teamIdentifier: 'TEST',
            organizationName: 'Synthetic',
        },
    )
    const pass = JSON.parse(resources['pass.json'].toString())
    let payload: Record<string, unknown> = {}
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockImplementationOnce(async (_url, init) => {
                payload = JSON.parse(init.body)
                return Response.json({
                    download_url:
                        'https://walletmcppass.com/download/event-details',
                })
            })
            .mockImplementationOnce(async () => signedFixture(pass)),
    )
    await remoteSign(resources)
    expect(payload.semantics).toMatchObject({
        eventType: 'PKEventTypeSports',
        homeTeamAbbreviation: 'HME',
        awayTeamAbbreviation: 'AWY',
        totalPrice: { amount: '120.50', currencyCode: 'CNY' },
    })
    expect(payload.info_links).toEqual({
        transitInformationURL: 'https://example.com/transit',
    })
    expect(JSON.stringify(payload)).toContain('北广场')
    expect(JSON.stringify(payload)).not.toContain('PRIVATE-HIDDEN')
})

it.each(['eventTicket', 'posterEventTicket', 'posterGeneric'] as const)(
    'uses the documented style and image contract for %s in all background/barcode states',
    async (passStyle) => {
        const png = await sharp({
            create: {
                width: 20,
                height: 20,
                channels: 3,
                background: '#abcdef',
            },
        })
            .png()
            .toBuffer()
        const data = `data:image/png;base64,${png.toString('base64')}`
        for (const background of [false, true])
            for (const barcodeEnabled of [false, true]) {
                const native = background && passStyle === 'posterGeneric'
                const semantic =
                    background &&
                    barcodeEnabled &&
                    passStyle === 'posterEventTicket'
                const resources = await buildResources(
                    {
                        ...ticket,
                        passStyle,
                        barcodeEnabled,
                        performer: '',
                        venueName: '',
                        appearance: {
                            ...ticket.appearance,
                            backgroundDataUrl: background ? data : undefined,
                            thumbnailDataUrl: data,
                            logoDataUrl: data,
                            secondaryLogoDataUrl: data,
                        },
                    },
                    {
                        passTypeIdentifier: 'pass.com.arshwaraich.vps',
                        teamIdentifier: 'TEST',
                        organizationName: 'Test',
                    },
                )
                const expected = JSON.parse(resources['pass.json'].toString())
                let payload: Record<string, unknown> = {}
                const fetchMock = vi
                    .fn()
                    .mockImplementationOnce(async (_url, init) => {
                        payload = JSON.parse(init.body)
                        const outputs = {
                            logo: 'logo',
                            primary_logo: 'primaryLogo',
                            secondary_logo: 'secondaryLogo',
                            thumbnail: 'thumbnail',
                            artwork: 'artwork',
                            background: 'background',
                        }
                        for (const [parameter, output] of Object.entries(
                            outputs,
                        )) {
                            const sent = payload[`${parameter}_png_b64`]
                            if (sent)
                                expect(
                                    Buffer.from(sent as string, 'base64'),
                                ).toEqual(resources[`${output}@3x.png`])
                        }
                        expect(payload.style).toBe(
                            native ? 'generic' : 'eventTicket',
                        )
                        expect(payload.poster === true).toBe(native)
                        expect(payload.semantic_layout === true).toBe(semantic)
                        expect(!!payload.barcode_message).toBe(barcodeEnabled)
                        expect(!!payload.secondary_logo_png_b64).toBe(semantic)
                        expect(!!payload.thumbnail_png_b64).toBe(
                            !native && !semantic,
                        )
                        if (semantic)
                            expect(payload.semantics).toMatchObject({
                                eventType: 'PKEventTypeGeneric',
                                eventName: ticket.eventName,
                                venueName: '',
                                venueRegionName: '',
                                venueRoom: '',
                            })
                        if (native) {
                            expect(payload.primary_fields).toHaveLength(4)
                            // The venue is the only footer field; this
                            // fixture has none, so the optional key is absent.
                            expect(payload.footer_fields).toBeUndefined()
                            const meta = await sharp(
                                Buffer.from(
                                    payload.background_png_b64 as string,
                                    'base64',
                                ),
                            ).metadata()
                            expect([meta.width, meta.height]).toEqual([
                                1035, 1515,
                            ])
                        }
                        return Response.json({
                            download_url:
                                'https://walletmcppass.com/download/matrix',
                            expires_in_seconds: 3600,
                            serial_number: expected.serialNumber,
                            pass_type_identifier: expected.passTypeIdentifier,
                        })
                    })
                    .mockImplementationOnce(() => signedFixture(expected))
                vi.stubGlobal('fetch', fetchMock)
                await expect(remoteSign(resources)).resolves.toBeInstanceOf(
                    Buffer,
                )
                expect(fetchMock).toHaveBeenCalledTimes(2)
            }
    },
)

it.each(['中文', 'é'])(
    'rejects UTF-8 barcode bytes the provider cannot preserve',
    async (message) => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const response = await POST(
            barcodeRequest({
                format: 'QR',
                message,
                encoding: 'utf-8',
                userConfirmed: true,
            }),
        )
        expect(response.status).toBe(422)
        expect(fetchMock).not.toHaveBeenCalled()
    },
)

it('rejects a signed response that changes the selected layout', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    download_url:
                        'https://walletmcppass.com/download/wrong-style',
                }),
            )
            .mockResolvedValueOnce(
                signedFixture({
                    passTypeIdentifier: 'pass.com.arshwaraich.vps',
                    generic: {},
                    posterGeneric: {},
                }),
            ),
    )
    expect((await POST(request())).status).toBe(503)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

function request(remote = true) {
    const draft = { ...ticket, barcode: undefined }
    return new Request('http://localhost/api/passes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(remote ? { 'X-Encore-Remote-Sign': 'walletmcppass' } : {}),
        },
        body: JSON.stringify(draft),
    })
}

it('exports the edited fields and all images through the remote provider', async () => {
    vi.stubEnv('EncorePass_SIGNING_MODE', 'preview')
    const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
    })
        .png()
        .toBuffer()
    const data = `data:image/png;base64,${image.toString('base64')}`
    let payload: Record<string, unknown> = {}
    const fetchMock = vi
        .fn()
        .mockImplementationOnce(async (_url, init) => {
            payload = JSON.parse(init.body)
            return Response.json({
                download_url: 'https://walletmcppass.com/download/test-token',
            })
        })
        .mockImplementationOnce(async () => {
            const pass = Buffer.from(
                JSON.stringify({
                    passTypeIdentifier: 'pass.com.arshwaraich.vps',
                    eventTicket: { primaryFields: payload.primary_fields },
                }),
            )
            const manifest = Buffer.from(
                JSON.stringify({
                    'pass.json': createHash('sha1').update(pass).digest('hex'),
                }),
            )
            // Structural fixture only; Apple trust is verified on the device.
            const archive = zipSync({
                'pass.json': pass,
                'manifest.json': manifest,
                signature: Buffer.from('synthetic-signature'),
            })
            return new Response(new Uint8Array(archive), {
                headers: { 'Content-Type': 'application/vnd.apple.pkpass' },
            })
        })
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(
        new Request('http://localhost/api/passes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Encore-Remote-Sign': 'walletmcppass',
            },
            body: JSON.stringify({
                ...ticket,
                eventName: '页面编辑的活动',
                barcode: undefined,
                appearance: {
                    ...ticket.appearance,
                    logoDataUrl: data,
                    thumbnailDataUrl: data,
                    backgroundDataUrl: data,
                    secondaryLogoDataUrl: data,
                },
            }),
        }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-wallet-download-url')).toContain(
        '/download/test-token',
    )
    expect(payload.primary_fields).toEqual([
        { key: 'event', label: '活动', value: '页面编辑的活动' },
    ])
    for (const slot of ['logo', 'thumbnail', 'background'])
        expect(typeof payload[`${slot}_png_b64`]).toBe('string')
    expect(payload.barcode_message).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('requests the shared poster layout for 通用凭证 without a barcode', async () => {
    const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
    })
        .png()
        .toBuffer()
    const data = `data:image/png;base64,${image.toString('base64')}`
    let payload: Record<string, unknown> = {}
    const fetchMock = vi
        .fn()
        .mockImplementationOnce(async (_url, init) => {
            payload = JSON.parse(init.body)
            return Response.json({
                download_url: 'https://walletmcppass.com/download/poster-token',
            })
        })
        .mockImplementationOnce(async () => {
            const pass = Buffer.from(
                JSON.stringify({
                    passTypeIdentifier: 'pass.com.arshwaraich.vps',
                    generic: { primaryFields: payload.primary_fields },
                    posterGeneric: {
                        primaryFields: payload.primary_fields,
                        footerFields: payload.footer_fields,
                    },
                }),
            )
            const manifest = Buffer.from(
                JSON.stringify({
                    'pass.json': createHash('sha1').update(pass).digest('hex'),
                }),
            )
            const archive = zipSync({
                'pass.json': pass,
                'manifest.json': manifest,
                signature: Buffer.from('synthetic-signature'),
            })
            return new Response(new Uint8Array(archive), {
                headers: { 'Content-Type': 'application/vnd.apple.pkpass' },
            })
        })
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(
        new Request('http://localhost/api/passes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Encore-Remote-Sign': 'walletmcppass',
            },
            body: JSON.stringify({
                ...ticket,
                passStyle: 'posterGeneric',
                barcode: undefined,
                appearance: {
                    ...ticket.appearance,
                    logoDataUrl: data,
                    thumbnailDataUrl: data,
                    backgroundDataUrl: data,
                },
            }),
        }),
    )
    expect(response.status).toBe(200)
    expect(payload.style).toBe('generic')
    expect(payload.semantic_layout).toBeUndefined()
    expect(payload.semantics).toBeUndefined()
    expect(payload.poster).toBe(true)
    expect((payload.primary_fields as unknown[])[0]).toEqual({
        key: 'event',
        label: '活动',
        value: ticket.eventName,
    })
    expect(payload.primary_fields).toHaveLength(4)
    expect(payload.footer_fields).toEqual([
        { key: 'venue', label: '场馆', value: ticket.venueName },
    ])
    expect(payload.secondary_fields).toHaveLength(2)
    expect(payload.auxiliary_fields).toHaveLength(3)
    expect(payload.barcode_message).toBeUndefined()
    expect(typeof payload.primary_logo_png_b64).toBe('string')
    expect(typeof payload.background_png_b64).toBe('string')
    expect(typeof payload.logo_png_b64).toBe('string')
    expect(payload.artwork_png_b64).toBeUndefined()
    expect(payload.secondary_logo_png_b64).toBeUndefined()
})

it('requests the poster layout with barcode and sharp artwork for 活动门票', async () => {
    const image = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#abcdef' },
    })
        .png()
        .toBuffer()
    const data = `data:image/png;base64,${image.toString('base64')}`
    let payload: Record<string, unknown> = {}
    const fetchMock = vi
        .fn()
        .mockImplementationOnce(async (_url, init) => {
            payload = JSON.parse(init.body)
            return Response.json({
                download_url:
                    'https://walletmcppass.com/download/poster-event-token',
            })
        })
        .mockImplementationOnce(async () => {
            const pass = Buffer.from(
                JSON.stringify({
                    passTypeIdentifier: 'pass.com.arshwaraich.vps',
                    eventTicket: { primaryFields: payload.primary_fields },
                    preferredStyleSchemes: ['posterEventTicket', 'eventTicket'],
                    barcodes: [
                        {
                            format: 'PKBarcodeFormatQR',
                            message: ticket.barcode!.message,
                            altText: '仅供展示',
                        },
                    ],
                }),
            )
            const manifest = Buffer.from(
                JSON.stringify({
                    'pass.json': createHash('sha1').update(pass).digest('hex'),
                }),
            )
            const archive = zipSync({
                'pass.json': pass,
                'manifest.json': manifest,
                signature: Buffer.from('synthetic-signature'),
            })
            return new Response(new Uint8Array(archive), {
                headers: { 'Content-Type': 'application/vnd.apple.pkpass' },
            })
        })
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(
        new Request('http://localhost/api/passes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Encore-Remote-Sign': 'walletmcppass',
            },
            body: JSON.stringify({
                ...ticket,
                barcodeEnabled: true,
                passStyle: 'posterEventTicket',
                appearance: {
                    ...ticket.appearance,
                    logoDataUrl: data,
                    thumbnailDataUrl: data,
                    backgroundDataUrl: data,
                    secondaryLogoDataUrl: data,
                },
            }),
        }),
    )
    expect(response.status).toBe(200)
    expect(payload.style).toBe('eventTicket')
    expect(payload.semantic_layout).toBe(true)
    expect(payload.semantics).toMatchObject({
        eventType: 'PKEventTypeLivePerformance',
        eventName: ticket.eventName,
    })
    expect(payload.barcode_format).toBe('QR')
    expect(payload.barcode_message).toBe(ticket.barcode!.message)
    expect(payload.primary_fields).toEqual([
        { key: 'event', label: '活动', value: ticket.eventName },
    ])
    for (const slot of [
        'logo',
        'primary_logo',
        'secondary_logo',
        'artwork',
        'background',
    ])
        expect(typeof payload[`${slot}_png_b64`]).toBe('string')
    expect(payload.poster).toBeUndefined()
})

function barcodeRequest(barcode: Record<string, unknown>) {
    return new Request('http://localhost/api/passes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Encore-Remote-Sign': 'walletmcppass',
        },
        body: JSON.stringify({
            ...ticket,
            barcodeEnabled: true,
            barcode,
        }),
    })
}

function providerPass(barcodes?: unknown[]) {
    const pass = Buffer.from(
        JSON.stringify({
            passTypeIdentifier: 'pass.com.arshwaraich.vps',
            eventTicket: { primaryFields: [{ key: 'event', value: 'Test' }] },
            ...(barcodes ? { barcodes } : {}),
        }),
    )
    const manifest = Buffer.from(
        JSON.stringify({
            'pass.json': createHash('sha1').update(pass).digest('hex'),
        }),
    )
    return new Response(
        new Uint8Array(
            zipSync({
                'pass.json': pass,
                'manifest.json': manifest,
                signature: Buffer.from('synthetic-signature'),
            }),
        ),
        { headers: { 'Content-Type': 'application/vnd.apple.pkpass' } },
    )
}

it.each([
    ['QR', 'PKBarcodeFormatQR', 'QR'],
    ['CODE128', 'PKBarcodeFormatCode128', 'Code128'],
])(
    'forwards the %s barcode to the provider and verifies the signed pass',
    async (format, appleFormat, providerFormat) => {
        const barcode = {
            format,
            message: `ENCORE-${format}-REMOTE-TEST`,
            encoding: 'utf-8',
            userConfirmed: true,
        }
        let payload: Record<string, unknown> = {}
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockImplementationOnce(async (_url, init) => {
                    payload = JSON.parse(init.body)
                    return Response.json({
                        download_url:
                            'https://walletmcppass.com/download/barcode-token',
                    })
                })
                .mockImplementationOnce(async () =>
                    providerPass([
                        {
                            format: appleFormat,
                            message: barcode.message,
                            altText: '仅供展示',
                        },
                    ]),
                ),
        )
        const response = await POST(barcodeRequest(barcode))
        expect(response.status).toBe(200)
        expect(payload.barcode_format).toBe(providerFormat)
        expect(payload.barcode_message).toBe(barcode.message)
        expect(payload.barcode_alt_text).toBe('仅供展示')
    },
)

it('rejects a provider pass whose barcode was dropped or changed', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    download_url:
                        'https://walletmcppass.com/download/barcode-token',
                }),
            )
            .mockResolvedValueOnce(
                providerPass([
                    {
                        format: 'PKBarcodeFormatQR',
                        message: 'CHANGED',
                        altText: '仅供展示',
                    },
                ]),
            ),
    )
    const response = await POST(
        barcodeRequest({
            format: 'QR',
            message: 'ENCORE-REMOTE-TEST',
            encoding: 'utf-8',
            userConfirmed: true,
        }),
    )
    expect(response.status).toBe(503)
})

it.each([402, 429, 500])(
    'handles provider HTTP %s without payments or retries',
    async (status) => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response('', { status }))
        vi.stubGlobal('fetch', fetchMock)
        const response = await POST(request())
        expect(response.status).toBe(503)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    },
)

it('rejects off-site download URLs', async () => {
    const fetchMock = vi
        .fn()
        .mockResolvedValue(
            Response.json({ download_url: 'http://localhost/secrets' }),
        )
    vi.stubGlobal('fetch', fetchMock)
    expect((await POST(request())).status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('rejects unsigned archives', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    download_url: 'https://walletmcppass.com/download/unsigned',
                }),
            )
            .mockResolvedValueOnce(
                new Response(
                    new Uint8Array(zipSync({ 'pass.json': Buffer.from('{}') })),
                    {
                        headers: {
                            'Content-Type': 'application/vnd.apple.pkpass',
                        },
                    },
                ),
            ),
    )
    expect((await POST(request())).status).toBe(503)
})

it('requires consent even when the server is configured for remote signing', async () => {
    vi.stubEnv('EncorePass_SIGNING_MODE', 'remote')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await POST(request(false))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
})

it('handles network failures without leaking provider errors', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('private upstream detail')),
    )
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private upstream detail')
})

it.each(['EACCES', 'ECONNREFUSED', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT'])(
    'reports safe transport code %s without leaking upstream details',
    async (code) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(
                new TypeError('private payload', {
                    cause: { code, message: 'private URL' },
                }),
            ),
        )
        const response = await POST(request())
        const body = await response.json()
        expect(body.error.code).toBe('REMOTE_NETWORK_ERROR')
        expect(body.error.message).toContain(code)
        expect(JSON.stringify(body)).not.toContain('private')
    },
)

it('distinguishes invalid provider JSON from connection errors', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html>private</html>')),
    )
    const response = await POST(request())
    expect((await response.json()).error.code).toBe('REMOTE_RESPONSE_INVALID')
})

it('distinguishes a failed download after successful creation', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({
                    download_url: 'https://walletmcppass.com/download/expired',
                }),
            )
            .mockResolvedValueOnce(new Response('', { status: 404 })),
    )
    const response = await POST(request())
    const body = await response.json()
    expect(body.error.code).toBe('REMOTE_DOWNLOAD_FAILED')
    expect(body.error.message).toContain('404')
})

it('reports timeouts separately', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new DOMException('private', 'TimeoutError')),
    )
    expect((await (await POST(request())).json()).error.code).toBe(
        'REMOTE_TIMEOUT',
    )
})

it('reports upstream 413 without retrying when no smaller images are available', async () => {
    const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('', { status: 413 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(request())
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('REMOTE_PAYLOAD_TOO_LARGE')
    expect(fetchMock).toHaveBeenCalledTimes(1)
})

async function largeImageResources() {
    const resources = await buildResources(
        { ...ticket, barcodeEnabled: false },
        {
            passTypeIdentifier: 'pass.com.arshwaraich.vps',
            teamIdentifier: 'TEST',
            organizationName: 'Synthetic',
        },
    )
    resources['background@3x.png'] = await sharp({
        create: {
            width: 1029,
            height: 1509,
            channels: 3,
            background: '#abcdef',
        },
    })
        .png({ compressionLevel: 0 })
        .toBuffer()
    return resources
}

it('sends large images unchanged and compresses only after HTTP 413', async () => {
    const resources = await largeImageResources()
    const pass = JSON.parse(resources['pass.json'].toString())
    const bodies: string[] = []
    const fetchMock = vi
        .fn()
        .mockImplementationOnce(async (_url, init) => {
            bodies.push(init.body)
            expect(Buffer.byteLength(init.body)).toBeGreaterThan(900 * 1024)
            expect(JSON.parse(init.body).background_png_b64).toBe(
                resources['background@3x.png'].toString('base64'),
            )
            return new Response('', { status: 413 })
        })
        .mockImplementationOnce(async (_url, init) => {
            bodies.push(init.body)
            return Response.json({
                download_url: 'https://walletmcppass.com/download/compressed',
            })
        })
        .mockImplementationOnce(() => signedFixture(pass))
    vi.stubGlobal('fetch', fetchMock)
    await expect(remoteSign(resources)).resolves.toBeInstanceOf(Buffer)
    expect(bodies[1].length).toBeLessThan(bodies[0].length)
    expect(fetchMock).toHaveBeenCalledTimes(3)
})

it.each([200, 400, 402, 429, 500, 503])(
    'does not compress or resubmit after HTTP %s',
    async (status) => {
        const resources = await largeImageResources()
        const pass = JSON.parse(resources['pass.json'].toString())
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async (_url, init) => {
                expect(JSON.parse(init.body).background_png_b64).toBe(
                    resources['background@3x.png'].toString('base64'),
                )
                return status === 200
                    ? Response.json({
                          download_url:
                              'https://walletmcppass.com/download/original',
                      })
                    : new Response('', { status })
            })
            .mockImplementationOnce(() => signedFixture(pass))
        vi.stubGlobal('fetch', fetchMock)
        if (status === 200)
            await expect(remoteSign(resources)).resolves.toBeInstanceOf(Buffer)
        else await expect(remoteSign(resources)).rejects.toBeDefined()
        expect(fetchMock).toHaveBeenCalledTimes(status === 200 ? 2 : 1)
    },
)

it('stops after the compression alternatives are exhausted', async () => {
    const resources = await largeImageResources()
    const fetchMock = vi
        .fn()
        .mockImplementation(() => new Response('', { status: 413 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(remoteSign(resources)).rejects.toMatchObject({
        code: 'REMOTE_PAYLOAD_TOO_LARGE',
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5)
})
