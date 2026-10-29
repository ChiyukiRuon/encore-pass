import { genericPosterFields, passFields } from './pass-fields'
import { randomUUID } from 'node:crypto'
import type { TicketDraft } from '@/lib/ticket/schema'
import { activeBarcode, usesPosterLayout } from '@/lib/ticket/validation'

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
    const seats = {
        ...(ticket.section ? { seatSection: ticket.section } : {}),
        ...(ticket.row ? { seatRow: ticket.row } : {}),
        ...(ticket.seat ? { seatNumber: ticket.seat } : {}),
    }
    return {
        eventType: ticket.performer
            ? 'PKEventTypeLivePerformance'
            : 'PKEventTypeGeneric',
        eventName: ticket.eventName,
        ...(ticket.performer ? { performerNames: [ticket.performer] } : {}),
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
        ...(ticket.performer ? { logoText: ticket.performer } : {}),
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
            preferredStyleSchemes: ['posterEventTicket', 'eventTicket'],
            semantics: eventSemantics(ticket),
            eventTicket: passFields(ticket),
        }
    }
    return { ...common, eventTicket: passFields(ticket) }
}
