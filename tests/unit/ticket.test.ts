import { describe, expect, it } from 'vitest'
import { exportTicketSchema, migrateDraft } from '@/lib/ticket/schema'
import {
    toOffsetDate,
    barcodeProblem,
    usesBackgroundMask,
} from '@/lib/ticket/validation'
import { mapPass } from '@/lib/wallet/pass-mapper'
import { ticket } from '../fixtures/ticket'

const artwork = {
    ...ticket.appearance,
    backgroundDataUrl: 'data:image/png;base64,AA==',
}

describe('export validation', () => {
    it('accepts a valid ticket', () =>
        expect(exportTicketSchema.safeParse(ticket).success).toBe(true))
    it.each([
        { eventName: '' },
        { eventName: 'x'.repeat(161) },
        { timezone: 'Mars/Test' },
        { startsAt: '2026-02-30T12:00:00+08:00' },
        { startsAt: '2026-01-01T12:00:00' },
        { appearance: { ...ticket.appearance, backgroundColor: 'red' } },
        {
            barcodeEnabled: true,
            barcode: { ...ticket.barcode, userConfirmed: false },
        },
        { teamIdentifier: 'ATTACKER' },
    ])('rejects invalid or injected data %j', (change) =>
        expect(
            exportTicketSchema.safeParse({ ...ticket, ...change }).success,
        ).toBe(false),
    )
    it('defaults older drafts to the classic event ticket style', () => {
        expect(
            exportTicketSchema.parse({ ...ticket, passStyle: undefined })
                .passStyle,
        ).toBe('eventTicket')
    })
    it.each(['eventTicket', 'posterEventTicket', 'posterGeneric'])(
        'accepts the %s style',
        (style) =>
            expect(
                exportTicketSchema.safeParse({ ...ticket, passStyle: style })
                    .success,
            ).toBe(true),
    )
    it('preserves poster drafts and migrates only missing barcode switches', () => {
        expect(
            exportTicketSchema.safeParse({
                ...ticket,
                passStyle: 'posterEventTicket',
            }).success,
        ).toBe(true)
        expect(
            migrateDraft({
                ...ticket,
                passStyle: 'posterEventTicket',
                barcodeEnabled: undefined,
            }),
        ).toMatchObject({
            passStyle: 'posterEventTicket',
            barcodeEnabled: true,
        })
        expect(
            migrateDraft({
                ...ticket,
                passStyle: 'posterEventTicket',
                barcodeEnabled: false,
            }),
        ).toMatchObject({
            passStyle: 'posterEventTicket',
            barcodeEnabled: false,
        })
    })
    it('defaults the background mask to off and rejects values outside 0–1', () => {
        expect(
            exportTicketSchema.parse({
                ...ticket,
                appearance: {
                    ...ticket.appearance,
                    backgroundMaskOpacity: undefined,
                },
            }).appearance.backgroundMaskOpacity,
        ).toBe(0)
        expect(
            exportTicketSchema.safeParse({
                ...ticket,
                appearance: {
                    ...ticket.appearance,
                    backgroundMaskOpacity: 1.1,
                },
            }).success,
        ).toBe(false)
    })
    it('applies the background mask only to classic tickets', () => {
        expect(usesBackgroundMask(ticket)).toBe(true)
        expect(
            usesBackgroundMask({
                ...ticket,
                passStyle: 'posterEventTicket',
            }),
        ).toBe(true)
        expect(
            usesBackgroundMask({
                ...ticket,
                passStyle: 'posterEventTicket',
                barcodeEnabled: true,
            }),
        ).toBe(false)
        expect(
            usesBackgroundMask({ ...ticket, passStyle: 'posterGeneric' }),
        ).toBe(false)
    })
    it('accepts stored crop sources and rejects out-of-bounds crops', () => {
        const cropped = {
            ...ticket,
            appearance: {
                ...ticket.appearance,
                logoDataUrl: 'data:image/png;base64,AA==',
                imageSources: { logo: 'data:image/png;base64,AA==' },
                imageCrops: {
                    logo: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
                },
            },
        }
        expect(exportTicketSchema.safeParse(cropped).success).toBe(true)
        expect(
            exportTicketSchema.safeParse({
                ...cropped,
                appearance: {
                    ...cropped.appearance,
                    imageCrops: {
                        logo: { x: 0.6, y: 0, width: 0.5, height: 1 },
                    },
                },
            }).success,
        ).toBe(false)
    })
    it('rejects lossy encodings', () => {
        expect(
            barcodeProblem({
                ...ticket.barcode!,
                message: '你好',
                encoding: 'iso-8859-1',
            }),
        ).toBeTruthy()
        expect(
            barcodeProblem({ ...ticket.barcode!, message: '\u0000' }),
        ).toBeTruthy()
    })
    it('resolves venue time and rejects DST gaps and overlaps', () => {
        expect(toOffsetDate('2026-12-12T19:30', 'Asia/Tokyo')).toBe(
            '2026-12-12T19:30:00+09:00',
        )
        expect(() =>
            toOffsetDate('2026-03-08T02:30', 'America/New_York'),
        ).toThrow()
        expect(() =>
            toOffsetDate('2026-11-01T01:30', 'America/New_York'),
        ).toThrow()
    })
})

it('maps authoritative issuer, independent serials and dates', () => {
    const issuer = {
        passTypeIdentifier: 'pass.test.encore',
        teamIdentifier: 'TESTTEAM01',
        organizationName: 'Test',
    }
    const first = mapPass(ticket, issuer)
    expect(first.teamIdentifier).toBe(issuer.teamIdentifier)
    expect(first.serialNumber).not.toBe(ticket.id)
    expect(first.serialNumber).not.toBe(mapPass(ticket, issuer).serialNumber)
    // The barcode switch is off, so retained content stays out of the pass.
    expect(first.barcodes).toBeUndefined()
    expect('preferredStyleSchemes' in first).toBe(false)
    if (!('eventTicket' in first)) throw new Error('expected event ticket')
    expect(
        first.eventTicket.backFields.find((field) => field.key === 'doors')
            ?.value,
    ).toContain('18:30')
})

it('omits logoText when the performer is empty', () => {
    const issuer = {
        passTypeIdentifier: 'pass.test.encore',
        teamIdentifier: 'TESTTEAM01',
        organizationName: 'Test',
    }
    expect(mapPass(ticket, issuer).logoText).toBe(ticket.performer)
    expect(mapPass({ ...ticket, performer: '' }, issuer).logoText).toBe(
        undefined,
    )
})

it('switches 活动门票(海报) to the poster layout when the barcode is on', () => {
    const issuer = {
        passTypeIdentifier: 'pass.test.encore',
        teamIdentifier: 'TESTTEAM01',
        organizationName: 'Test',
    }
    const classic = mapPass({ ...ticket, barcodeEnabled: true }, issuer)
    expect('preferredStyleSchemes' in classic).toBe(false)
    expect(classic).toHaveProperty('eventTicket')
    const plain = mapPass(ticket, issuer)
    expect('eventTicket' in classic && classic.eventTicket).toEqual(
        'eventTicket' in plain && plain.eventTicket,
    )
    expect(classic.barcodes).toHaveLength(1)
    expect(
        'preferredStyleSchemes' in
            mapPass({ ...ticket, passStyle: 'posterEventTicket' }, issuer),
    ).toBe(false)
    const poster = mapPass(
        {
            ...ticket,
            appearance: artwork,
            passStyle: 'posterEventTicket',
            barcodeEnabled: true,
        },
        issuer,
    )
    expect(poster.barcodes).toEqual([
        {
            format: 'PKBarcodeFormatQR',
            message: ticket.barcode!.message,
            messageEncoding: 'utf-8',
            altText: '仅供展示',
        },
    ])
    if (!('preferredStyleSchemes' in poster))
        throw new Error('expected poster event')
    expect(poster.preferredStyleSchemes).toEqual([
        'posterEventTicket',
        'eventTicket',
    ])
    expect(poster.eventTicket.primaryFields[0].value).toBe(ticket.eventName)
    expect(poster.semantics).toMatchObject({
        eventType: 'PKEventTypeLivePerformance',
        eventName: ticket.eventName,
        performerNames: [ticket.performer],
        venueName: ticket.venueName,
        eventStartDate: ticket.startsAt,
        eventStartDateInfo: {
            date: ticket.startsAt,
            timeZone: ticket.timezone,
        },
        venueDoorsOpenDate: ticket.doorsOpenAt,
        seats: [{ seatSection: 'A', seatRow: '3', seatNumber: '12' }],
    })
})

it('maps 通用凭证 to the poster layout without a barcode', () => {
    const issuer = {
        passTypeIdentifier: 'pass.test.encore',
        teamIdentifier: 'TESTTEAM01',
        organizationName: 'Test',
    }
    const poster = mapPass(
        { ...ticket, appearance: artwork, passStyle: 'posterGeneric' },
        issuer,
    )
    if (!('posterGeneric' in poster)) throw new Error('expected generic poster')
    expect('preferredStyleSchemes' in poster).toBe(false)
    expect(poster.posterGeneric.primaryFields[0].value).toBe(ticket.eventName)
    // The switch is off, so the retained barcode is not exported.
    expect(poster.barcodes).toBeUndefined()
    expect(poster.posterGeneric.primaryFields).toHaveLength(4)
    expect(poster.posterGeneric.footerFields).toHaveLength(1)
    expect(poster.posterGeneric.footerFields[0]).toMatchObject({
        key: 'venue',
        value: ticket.venueName,
    })
    expect('generic' in poster).toBe(true)
})

it('keeps the poster layout for 通用凭证 and adds the same barcode', () => {
    const issuer = {
        passTypeIdentifier: 'pass.test.encore',
        teamIdentifier: 'TESTTEAM01',
        organizationName: 'Test',
    }
    const poster = mapPass(
        {
            ...ticket,
            passStyle: 'posterGeneric',
            appearance: artwork,
            barcodeEnabled: true,
        },
        issuer,
    )
    if (!('posterGeneric' in poster)) throw new Error('expected generic poster')
    expect('preferredStyleSchemes' in poster).toBe(false)
    expect(poster.barcodes).toEqual([
        {
            format: 'PKBarcodeFormatQR',
            message: ticket.barcode!.message,
            messageEncoding: 'utf-8',
            altText: '仅供展示',
        },
    ])
})

it.each(['eventTicket', 'posterEventTicket', 'posterGeneric'] as const)(
    'uses classic fields for %s without artwork regardless of barcode visibility',
    (passStyle) => {
        const issuer = {
            passTypeIdentifier: 'pass.test',
            teamIdentifier: 'TEST',
            organizationName: 'Test',
        }
        const classic = mapPass(ticket, issuer)
        for (const barcodeEnabled of [false, true]) {
            const pass = mapPass(
                { ...ticket, passStyle, barcodeEnabled },
                issuer,
            )
            expect('preferredStyleSchemes' in pass).toBe(false)
            expect('semantics' in pass).toBe(false)
            expect('eventTicket' in pass && pass.eventTicket).toEqual(
                'eventTicket' in classic && classic.eventTicket,
            )
            expect(pass.barcodes?.length ?? 0).toBe(barcodeEnabled ? 1 : 0)
        }
    },
)
