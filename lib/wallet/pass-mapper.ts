import { genericPosterFields, passFields } from './pass-fields'
import { randomUUID } from 'node:crypto'
import type { TicketDraft } from '@/lib/ticket/schema'
import { activeBarcode, usesPosterLayout } from '@/lib/ticket/validation'
import {
    activeEventTicket,
    eventInformationLinks,
    performerNames,
} from '@/lib/ticket/event-fields'

export interface Issuer {
    passTypeIdentifier: string
    teamIdentifier: string
    organizationName: string
}
export const barcodeFormats = {
    QR: 'PKBarcodeFormatQR',
    PDF417: 'PKBarcodeFormatPDF417',
    AZTEC: 'PKBarcodeFormatAztec',
    CODE128: 'PKBarcodeFormatCode128',
} as const

function rgb(hex: string) {
    return `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
}

// Poster event tickets need semantic tags for Wallet to build the automatic
// poster layout; the eventTicket fields remain as the classic fallback.
function eventSemantics(ticket: TicketDraft) {
    const info = ticket.eventInfo ?? {}
    // Keep optional performer entry compatible with existing drafts: an empty
    // performance uses generic semantics until an artist is provided.
    const eventType =
        ticket.eventType === 'livePerformance' && !performerNames(ticket).length
            ? 'generic'
            : ticket.eventType
    const extra: Record<string, unknown> = {}
    for (const key of [
        'genre',
        'homeTeamName',
        'homeTeamAbbreviation',
        'awayTeamName',
        'awayTeamAbbreviation',
        'leagueName',
        'sportName',
        'venueEntrance',
        'venueEntranceGate',
        'entranceDescription',
        'admissionLevel',
        'attendeeName',
    ] as const) {
        if (info[key]) extra[key] = info[key]
    }
    if (info.endsAt) extra.eventEndDate = info.endsAt
    if (info.phone) extra.venuePhoneNumber = info.phone
    if (info.price && info.currency)
        extra.totalPrice = { amount: info.price, currencyCode: info.currency }
    const seats = {
        ...(ticket.section ? { seatSection: ticket.section } : {}),
        ...(ticket.row ? { seatRow: ticket.row } : {}),
        ...(ticket.seat ? { seatNumber: ticket.seat } : {}),
        ...(info.seatLevel ? { seatLevel: info.seatLevel } : {}),
        ...(info.seatAisle ? { seatAisle: info.seatAisle } : {}),
        ...(info.seatType ? { seatType: info.seatType } : {}),
    }
    return {
        ...extra,
        eventType: eventType
            ? `PKEventType${eventType[0].toUpperCase()}${eventType.slice(1)}`
            : ticket.performer
              ? 'PKEventTypeLivePerformance'
              : 'PKEventTypeGeneric',
        eventName: ticket.eventName,
        ...(ticket.performer ? { performerNames: performerNames(ticket) } : {}),
        ...(ticket.venueName ? { venueName: ticket.venueName } : {}),
        ...(ticket.venueRegionName
            ? { venueRegionName: ticket.venueRegionName }
            : {}),
        ...(ticket.venueRoom ? { venueRoom: ticket.venueRoom } : {}),
        ...(ticket.startsAt
            ? {
                  eventStartDate: ticket.startsAt,
                  eventStartDateInfo: {
                      date: ticket.startsAt,
                      timeZone: ticket.timezone,
                  },
              }
            : {}),
        ...(ticket.doorsOpenAt
            ? { venueDoorsOpenDate: ticket.doorsOpenAt }
            : {}),
        ...(Object.keys(seats).length ? { seats: [seats] } : {}),
    }
}

export function mapPass(ticket: TicketDraft, issuer: Issuer) {
    ticket = activeEventTicket(ticket)
    // The switch is the only gate: content retained while it is off never
    // reaches pass.json.
    const barcode = activeBarcode(ticket)
    const coded = barcode
        ? {
              barcodes: [
                  {
                      format: barcodeFormats[barcode.format],
                      message: barcode.message,
                      messageEncoding: barcode.encoding,
                      altText: '仅供展示',
                  },
              ],
          }
        : {}
    const common = {
        formatVersion: 1,
        ...issuer,
        serialNumber: randomUUID(),
        description: ticket.eventName,
        ...(ticket.performer || ticket.eventInfo?.organizer
            ? {
                  logoText:
                      performerNames(ticket).join(' / ') ||
                      ticket.eventInfo?.organizer,
              }
            : {}),
        backgroundColor: rgb(ticket.appearance.backgroundColor),
        foregroundColor: rgb(ticket.appearance.foregroundColor),
        labelColor: rgb(ticket.appearance.labelColor),
        ...(ticket.startsAt ? { relevantDate: ticket.startsAt } : {}),
        ...coded,
    }
    // Preview and both signing paths share the background/style/barcode gate.
    if (usesPosterLayout(ticket)) {
        if (ticket.passStyle === 'posterGeneric') {
            const poster = genericPosterFields(ticket)
            return {
                ...common,
                generic: {
                    ...passFields(ticket),
                    primaryFields: poster.primaryFields,
                },
                posterGeneric: poster,
            }
        }
        return {
            ...common,
            ...Object.fromEntries(
                Object.entries(eventInformationLinks).flatMap(
                    ([key, target]) => {
                        const value =
                            ticket.eventInfo?.[
                                key as keyof typeof eventInformationLinks
                            ]
                        return value ? [[target, value]] : []
                    },
                ),
            ),
            preferredStyleSchemes: ['posterEventTicket', 'eventTicket'],
            semantics: eventSemantics(ticket),
            eventTicket: passFields(ticket),
        }
    }
    return { ...common, eventTicket: passFields(ticket) }
}
