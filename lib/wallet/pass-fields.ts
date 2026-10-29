import type { TicketDraft } from '@/lib/ticket/schema'

function field(key: string, label: string, value?: string) {
    return value ? [{ key, label, value }] : []
}

function dateValue(
    ticket: TicketDraft,
    value: string,
    options: Intl.DateTimeFormatOptions,
) {
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            timeZone: ticket.timezone,
            ...options,
        }).format(new Date(value))
    } catch {
        return value
    }
}

function fullDate(ticket: TicketDraft, value: string) {
    return dateValue(ticket, value, {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
}

function shortDate(ticket: TicketDraft, value: string) {
    return dateValue(ticket, value, { month: 'short', day: 'numeric' })
}

function clock(ticket: TicketDraft, value: string) {
    return dateValue(ticket, value, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

function backFields(ticket: TicketDraft) {
    return [
        ...field('event-detail', '活动', ticket.eventName),
        ...field('performer', '艺人 / 主办方', ticket.performer),
        ...field(
            'starts-detail',
            '开演时间',
            ticket.startsAt ? fullDate(ticket, ticket.startsAt) : undefined,
        ),
        ...field('address', '地址', ticket.venueAddress),
        ...field('venue-region', '场馆地区', ticket.venueRegionName),
        ...field('venue-room', '场馆厅室', ticket.venueRoom),
        ...field(
            'doors',
            '入场',
            ticket.doorsOpenAt
                ? fullDate(ticket, ticket.doorsOpenAt)
                : undefined,
        ),
        ...field('timezone', '场馆时区', ticket.timezone),
        {
            key: 'notice',
            label: '使用说明',
            value: '自制票卡不能作为官方入场凭证，无法替代原票、动态二维码、身份证明等官方指定的入场凭证。',
        },
    ]
}

// Classic event ticket: header date, primary event, secondary venue and start,
// auxiliary seat row. Wallet blurs the background image behind these fields.
export function passFields(ticket: TicketDraft) {
    return {
        headerFields: field(
            'date',
            '日期',
            ticket.startsAt ? shortDate(ticket, ticket.startsAt) : undefined,
        ),
        primaryFields: field('event', '活动', ticket.eventName),
        secondaryFields: [
            ...field('venue', '场馆', ticket.venueName),
            ...field(
                'starts',
                '开演',
                ticket.startsAt ? clock(ticket, ticket.startsAt) : undefined,
            ),
        ],
        auxiliaryFields: [
            ...field('section', '区域', ticket.section),
            ...field('row', '排', ticket.row),
            ...field('seat', '座位', ticket.seat),
        ],
        backFields: backFields(ticket),
    }
}

// Native poster generic: four primary fields and the venue footer. The start
// time stays on the back and in relevantDate rather than on the poster face.
export function genericPosterFields(ticket: TicketDraft) {
    const fields = passFields(ticket)
    return {
        headerFields: fields.headerFields,
        primaryFields: [...fields.primaryFields, ...fields.auxiliaryFields],
        footerFields: field('venue', '场馆', ticket.venueName),
        backFields: fields.backFields,
    }
}
