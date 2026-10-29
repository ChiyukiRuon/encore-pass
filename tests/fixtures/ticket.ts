import type { TicketDraft } from '@/lib/ticket/schema'

export const ticket: TicketDraft = {
    schemaVersion: 1,
    id: '2c114c33-36d7-4ae1-986a-dc0804d41ae4',
    eventName: 'Encore Live 2026 · 合成测试',
    performer: 'Example Artist',
    venueName: '示例音乐厅',
    startsAt: '2026-12-12T19:30:00+09:00',
    doorsOpenAt: '2026-12-12T18:30:00+09:00',
    timezone: 'Asia/Tokyo',
    section: 'A',
    row: '3',
    seat: '12',
    passStyle: 'eventTicket',
    barcodeEnabled: false,
    barcode: {
        format: 'QR',
        message: 'ENCORE-SYNTHETIC-NOT-VALID-2026',
        encoding: 'utf-8',
        userConfirmed: true,
    },
    appearance: {
        backgroundColor: '#182c25',
        foregroundColor: '#ffffff',
        labelColor: '#c9ded2',
        backgroundMaskOpacity: 0,
    },
    warnings: [],
}
