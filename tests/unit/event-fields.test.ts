import { expect, it } from 'vitest'
import {
    activeEventTicket,
    eventFieldKeys,
    selectEventPreset,
} from '@/lib/ticket/event-fields'
import { editableDraftSchema, exportTicketSchema } from '@/lib/ticket/schema'
import { passFields, genericPosterFields } from '@/lib/wallet/pass-fields'
import { mapPass } from '@/lib/wallet/pass-mapper'
import { ticket } from '../fixtures/ticket'

const issuer = {
    passTypeIdentifier: 'pass.test',
    teamIdentifier: 'TEST',
    organizationName: 'Synthetic',
}

it('retains legacy drafts and keeps unselected values out of all outputs', () => {
    expect(editableDraftSchema.parse(ticket).performer).toBe(ticket.performer)
    const switched = selectEventPreset(ticket, 'gathering')
    expect(switched.performer).toBe(ticket.performer)
    const active = activeEventTicket(switched)
    expect(active.performer).toBeUndefined()
    expect(active.section).toBeUndefined()
    expect(JSON.stringify(mapPass(switched, issuer))).not.toContain(
        ticket.performer,
    )
    expect(passFields(switched).auxiliaryFields).toEqual([])
    expect(genericPosterFields(switched).primaryFields).toHaveLength(1)
    expect(
        activeEventTicket(selectEventPreset(switched, 'performance')).performer,
    ).toBe(ticket.performer)
})

it('maps additional details and semantics with stable custom keys', () => {
    const draft = {
        ...ticket,
        eventType: 'sports' as const,
        passStyle: 'posterEventTicket' as const,
        barcodeEnabled: true,
        appearance: {
            ...ticket.appearance,
            backgroundDataUrl: 'data:image/png;base64,AA==',
        },
        eventFields: eventFieldKeys,
        performer: 'Artist One\nArtist Two',
        eventInfo: {
            homeTeamName: 'Home',
            awayTeamName: 'Away',
            homeTeamAbbreviation: 'H',
            awayTeamAbbreviation: 'A',
            price: '12.50',
            currency: 'CNY',
            seatLevel: '2',
            endsAt: '2026-12-12T22:00:00+09:00',
            organizer: 'Synthetic Org',
            scheduleUrl: 'https://example.com/schedule',
        },
        customFields: [
            {
                id: ticket.id,
                label: '集合地点',
                value: '北广场',
                enabled: true,
            },
            {
                id: '2c114c33-36d7-4ae1-986a-dc0804d41ae5',
                label: '隐藏',
                value: 'PRIVATE',
                enabled: false,
            },
        ],
    }
    expect(exportTicketSchema.safeParse(draft).success).toBe(true)
    const pass = mapPass(draft, issuer)
    expect('semantics' in pass && pass.semantics).toMatchObject({
        eventType: 'PKEventTypeSports',
        homeTeamName: 'Home',
        totalPrice: { amount: '12.50', currencyCode: 'CNY' },
        performerNames: ['Artist One', 'Artist Two'],
        seats: [{ seatLevel: '2' }],
    })
    expect(passFields(draft).backFields).toContainEqual({
        key: `custom-${ticket.id}`,
        label: '集合地点',
        value: '北广场',
    })
    expect(JSON.stringify(pass)).not.toContain('PRIVATE')
    expect(JSON.stringify(pass)).toContain('https://example.com/schedule')
})

it('uses admission as the compact seat fallback', () => {
    const draft = {
        ...selectEventPreset(ticket, 'gathering'),
        eventInfo: { admissionLevel: 'VIP' },
    }
    expect(passFields(draft).auxiliaryFields).toEqual([
        { key: 'admission', label: '票种', value: 'VIP' },
    ])
    expect(genericPosterFields(draft).primaryFields).toHaveLength(2)
})

it.each([
    { website: 'javascript:alert(1)' },
    { website: 'https://user:password@example.com' },
    { email: 'invalid' },
    { price: '-2', currency: 'CNY' },
    { price: '2.999', currency: 'CNY' },
    { price: '2', currency: '' },
    { endsAt: '2026-02-30T12:00:00+08:00' },
    { endsAt: '2025-01-01T12:00:00+08:00' },
])(
    'validates enabled details while allowing incomplete local drafts: %j',
    (eventInfo) => {
        const draft = { ...ticket, eventFields: eventFieldKeys, eventInfo }
        expect(editableDraftSchema.safeParse(draft).success).toBe(true)
        expect(exportTicketSchema.safeParse(draft).success).toBe(false)
        expect(
            exportTicketSchema.safeParse({ ...draft, eventFields: [] }).success,
        ).toBe(true)
    },
)

it('rejects unknown fields, oversized custom lists and incomplete active custom rows', () => {
    expect(
        editableDraftSchema.safeParse({ ...ticket, eventFields: ['nfc'] })
            .success,
    ).toBe(false)
    expect(
        editableDraftSchema.safeParse({
            ...ticket,
            eventInfo: { injected: 'x' },
        }).success,
    ).toBe(false)
    const custom = { id: ticket.id, label: '名称', value: '', enabled: true }
    expect(
        exportTicketSchema.safeParse({ ...ticket, customFields: [custom] })
            .success,
    ).toBe(false)
    expect(
        exportTicketSchema.safeParse({
            ...ticket,
            customFields: [{ ...custom, enabled: false }],
        }).success,
    ).toBe(true)
    expect(
        editableDraftSchema.safeParse({
            ...ticket,
            customFields: Array(11).fill(custom),
        }).success,
    ).toBe(false)
})
