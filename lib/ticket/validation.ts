import { Temporal } from '@js-temporal/polyfill'
import type { TicketBarcode, TicketDraft } from './schema'

export function toOffsetDate(
    local: string,
    timezone: string,
): string | undefined {
    if (!local) return undefined
    return Temporal.PlainDateTime.from(local)
        .toZonedDateTime(timezone, { disambiguation: 'reject' })
        .toString({ timeZoneName: 'never' })
}

export function toLocalDate(
    value: string | undefined,
    timezone: string,
): string {
    if (!value) return ''
    try {
        return Temporal.Instant.from(value)
            .toZonedDateTimeISO(timezone)
            .toPlainDateTime()
            .toString()
            .slice(0, 16)
    } catch {
        return ''
    }
}

// A barcode only exists for the pass when the switch is on; its content stays
// in the draft while the switch is off.
export function activeBarcode(
    ticket: Pick<TicketDraft, 'barcodeEnabled' | 'barcode'>,
): TicketBarcode | undefined {
    return ticket.barcodeEnabled ? ticket.barcode : undefined
}

// The mask darkens the blurred classic layout. Poster event tickets keep it in
// their classic fallback; the poster layout uses a top scrim instead.
export function usesBackgroundMask(
    ticket: Pick<TicketDraft, 'passStyle' | 'barcodeEnabled' | 'barcode'>,
): boolean {
    return (
        ticket.passStyle === 'eventTicket' ||
        (ticket.passStyle === 'posterEventTicket' && !activeBarcode(ticket))
    )
}

// Every style falls back to the classic layout without background artwork.
export function usesPosterLayout(
    ticket: Pick<
        TicketDraft,
        'passStyle' | 'barcodeEnabled' | 'barcode' | 'appearance'
    >,
): boolean {
    return (
        !!ticket.appearance.backgroundDataUrl &&
        (ticket.passStyle === 'posterGeneric' ||
            (ticket.passStyle === 'posterEventTicket' &&
                !!activeBarcode(ticket)))
    )
}

export function barcodeProblem(barcode: TicketBarcode): string | undefined {
    if (/[\uD800-\uDFFF]/u.test(barcode.message))
        return '条码包含无效 Unicode 字符'
    const capacity = { QR: 2000, PDF417: 1000, AZTEC: 1600, CODE128: 80 }[
        barcode.format
    ]
    const size =
        barcode.encoding === 'utf-8'
            ? new TextEncoder().encode(barcode.message).length
            : barcode.message.length
    if (size > capacity) return '条码内容超出当前模板容量，请使用原票'
    if (
        barcode.message.includes('\ufffd') ||
        /[\u0000-\u001f\u007f]/.test(barcode.message)
    )
        return '不支持二进制或控制字符条码，请使用原票'
    if (
        barcode.encoding === 'iso-8859-1' &&
        [...barcode.message].some((c) => c.codePointAt(0)! > 255)
    )
        return '条码内容不能无损转换为 ISO-8859-1'
    if (barcode.format === 'CODE128' && !/^[\x20-\x7e]+$/.test(barcode.message))
        return 'CODE128 仅支持可打印 ASCII 文本'
}
