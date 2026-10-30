import type { TicketDraft } from './schema'

// One catalogue owns form selection, validation labels and exported details.
export const eventFieldDefinitions = {
    performer: ['艺人 / 演出者', '活动详情', 'performers'],
    organizer: ['主办方', '活动详情', 'text'],
    genre: ['风格 / 类型', '活动详情', 'text'],
    homeTeamName: ['主队名称', '活动详情', 'text'],
    homeTeamAbbreviation: ['主队简称', '活动详情', 'text'],
    awayTeamName: ['客队名称', '活动详情', 'text'],
    awayTeamAbbreviation: ['客队简称', '活动详情', 'text'],
    leagueName: ['赛事 / 联赛', '活动详情', 'text'],
    sportName: ['运动项目', '活动详情', 'text'],
    doorsOpenAt: ['入场时间', '时间与地点', 'date'],
    endsAt: ['结束时间', '时间与地点', 'date'],
    venueRoom: ['厅室', '时间与地点', 'text'],
    venueEntrance: ['入口', '时间与地点', 'text'],
    venueEntranceGate: ['闸口', '时间与地点', 'text'],
    entranceDescription: ['入场说明', '时间与地点', 'multiline'],
    section: ['区域', '座位与票务', 'text'],
    row: ['排', '座位与票务', 'text'],
    seat: ['座位', '座位与票务', 'text'],
    seatLevel: ['楼层', '座位与票务', 'text'],
    seatAisle: ['过道', '座位与票务', 'text'],
    seatType: ['座位类型', '座位与票务', 'text'],
    admissionLevel: ['票种 / 权益等级', '座位与票务', 'text'],
    attendeeName: ['持票人 / 参会人', '座位与票务', 'text'],
    price: ['票价', '座位与票务', 'price'],
    notes: ['注意事项', '补充信息', 'multiline'],
    remarks: ['备注', '补充信息', 'multiline'],
    website: ['官网', '联系与链接', 'url'],
    scheduleUrl: ['日程链接', '联系与链接', 'url'],
    transitUrl: ['交通指南', '联系与链接', 'url'],
    parkingUrl: ['停车指南', '联系与链接', 'url'],
    accessibilityUrl: ['无障碍说明', '联系与链接', 'url'],
    phone: ['联系电话', '联系与链接', 'tel'],
    email: ['联系邮箱', '联系与链接', 'email'],
} as const

export type EventField = keyof typeof eventFieldDefinitions
export const eventInformationLinks = {
    website: 'contactVenueWebsite',
    transitUrl: 'transitInformationURL',
    parkingUrl: 'parkingInformationURL',
    accessibilityUrl: 'accessibilityURL',
    phone: 'contactVenuePhoneNumber',
    email: 'contactVenueEmail',
} as const
export const eventFieldKeys = Object.keys(eventFieldDefinitions) as EventField[]
export const eventGroups = [
    ...new Set(Object.values(eventFieldDefinitions).map((field) => field[1])),
]
export const eventTypes = {
    generic: '其他活动',
    livePerformance: '现场演出',
    movie: '电影',
    sports: '体育赛事',
    convention: '展览 / 漫展',
    conference: '会议',
    workshop: '工作坊',
    socialGathering: '聚会',
} as const

export const eventPresets = {
    performance: {
        label: '演出 / 放映',
        fields: [
            'performer',
            'doorsOpenAt',
            'endsAt',
            'venueRoom',
            'section',
            'row',
            'seat',
            'admissionLevel',
            'venueEntrance',
        ],
    },
    sports: {
        label: '体育赛事',
        fields: [
            'homeTeamName',
            'homeTeamAbbreviation',
            'awayTeamName',
            'awayTeamAbbreviation',
            'leagueName',
            'sportName',
            'doorsOpenAt',
            'section',
            'row',
            'seat',
            'admissionLevel',
            'venueEntrance',
        ],
    },
    gathering: {
        label: '展览 / 会议',
        fields: [
            'organizer',
            'endsAt',
            'venueRoom',
            'attendeeName',
            'admissionLevel',
            'entranceDescription',
            'scheduleUrl',
        ],
    },
} satisfies Record<string, { label: string; fields: EventField[] }>

export type EventPreset = keyof typeof eventPresets | 'custom'
const legacyFields: EventField[] = [
    'performer',
    'venueRoom',
    'doorsOpenAt',
    'section',
    'row',
    'seat',
]
const rootFields = new Set<EventField>(legacyFields)

export function selectedEventFields(ticket: TicketDraft): EventField[] {
    return ticket.eventFields ?? legacyFields
}

export function eventValue(ticket: TicketDraft, key: EventField): string {
    if (rootFields.has(key))
        return (ticket[key as keyof TicketDraft] as string | undefined) ?? ''
    return ticket.eventInfo?.[key] ?? ''
}

export function setEventValue(
    ticket: TicketDraft,
    key: EventField,
    value: string,
): TicketDraft {
    if (rootFields.has(key)) return { ...ticket, [key]: value || undefined }
    return { ...ticket, eventInfo: { ...ticket.eventInfo, [key]: value } }
}

export function selectEventPreset(
    ticket: TicketDraft,
    preset: EventPreset,
): TicketDraft {
    return {
        ...ticket,
        eventPreset: preset,
        eventFields:
            preset === 'custom'
                ? selectedEventFields(ticket)
                : [...eventPresets[preset].fields],
        eventType:
            preset === 'custom'
                ? ticket.eventType
                : preset === 'sports'
                  ? 'sports'
                  : preset === 'gathering'
                    ? 'convention'
                    : 'livePerformance',
    }
}

// Use this at both the browser request boundary and server mapping boundary.
// Hidden values remain in local JSON drafts, never in a signing request.
export function activeEventTicket(ticket: TicketDraft): TicketDraft {
    const active = new Set(selectedEventFields(ticket))
    let result = { ...ticket, eventInfo: { ...ticket.eventInfo } }
    for (const key of eventFieldKeys) {
        if (!active.has(key)) {
            result = setEventValue(result, key, '') as typeof result
            delete result.eventInfo[key]
        }
    }
    if (!active.has('price')) delete result.eventInfo.currency
    result.customFields = ticket.customFields?.filter(
        (field) => field.enabled && field.label && field.value,
    )
    return result
}

export function performerNames(ticket: TicketDraft) {
    return (ticket.performer ?? '')
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
}
