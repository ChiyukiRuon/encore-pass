import { z } from 'zod'
import { Temporal } from '@js-temporal/polyfill'
import { imageCropSchema } from './crop'
import { deviceTimezone, isValidTimezone } from './timezone'
import {
    activeEventTicket,
    eventFieldDefinitions,
    eventFieldKeys,
    eventTypes,
    eventValue,
    selectEventPreset,
    selectedEventFields,
} from './event-fields'

const text = z.string().trim().max(160)
const color = z.string().regex(/^#[0-9a-f]{6}$/i, '请输入 #RRGGBB 颜色')
const date = z
    .string()
    .datetime({ offset: true })
    .refine((value) => {
        try {
            Temporal.Instant.from(value)
            return true
        } catch {
            return false
        }
    }, '日期无效')
    .optional()
const image = z
    .string()
    .max(2_800_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
    .optional()

// A cropped slot keeps the downscaled upload so the selection can be reopened
// after a reload; the rendered slot image stays in the existing *DataUrl
// fields. Both records are absent when the whole image is used.
const slotCrops = z
    .object({
        logo: imageCropSchema.optional(),
        thumbnail: imageCropSchema.optional(),
        background: imageCropSchema.optional(),
        secondaryLogo: imageCropSchema.optional(),
    })
    .strict()

const slotSources = z
    .object({
        logo: image,
        thumbnail: image,
        background: image,
        secondaryLogo: image,
    })
    .strict()

export const barcodeSchema = z
    .object({
        format: z.enum(['QR', 'PDF417', 'AZTEC', 'CODE128']),
        message: z.string().min(1).max(2048),
        encoding: z.enum(['utf-8', 'iso-8859-1']),
        userConfirmed: z.boolean(),
    })
    .strict()

export const ticketDraftSchema = z
    .object({
        schemaVersion: z.literal(1),
        id: z.uuid(),
        eventName: text.min(1, '请填写活动名称'),
        performer: z.string().trim().max(1600).optional(),
        eventPreset: z
            .enum(['performance', 'sports', 'gathering', 'custom'])
            .optional(),
        eventType: z
            .enum(
                Object.keys(eventTypes) as [
                    keyof typeof eventTypes,
                    ...(keyof typeof eventTypes)[],
                ],
            )
            .optional(),
        eventFields: z
            .array(z.enum(eventFieldKeys))
            .max(eventFieldKeys.length)
            .refine((keys) => new Set(keys).size === keys.length)
            .optional(),
        eventInfo: z
            .partialRecord(
                z.enum([...eventFieldKeys, 'currency']),
                z.string().trim().max(1600),
            )
            .optional(),
        customFields: z
            .array(
                z
                    .object({
                        id: z.uuid(),
                        label: z.string().trim().max(80),
                        value: z.string().trim().max(1600),
                        enabled: z.boolean(),
                    })
                    .strict(),
            )
            .max(10)
            .refine(
                (fields) =>
                    new Set(fields.map((field) => field.id)).size ===
                    fields.length,
            )
            .optional(),
        venueName: text.optional(),
        venueRegionName: text.optional(),
        venueRoom: text.optional(),
        venueAddress: z.string().trim().max(300).optional(),
        doorsOpenAt: date,
        startsAt: date,
        timezone: z
            .string()
            .max(80)
            .refine(isValidTimezone, '请输入有效 IANA 时区'),
        section: text.optional(),
        row: text.optional(),
        seat: text.optional(),
        passStyle: z
            .enum(['eventTicket', 'posterEventTicket', 'posterGeneric'])
            .default('eventTicket'),
        barcodeEnabled: z.boolean().default(false),
        barcode: barcodeSchema.optional(),
        appearance: z
            .object({
                backgroundColor: color,
                foregroundColor: color,
                labelColor: color,
                logoDataUrl: image,
                heroDataUrl: image,
                thumbnailDataUrl: image,
                secondaryLogoDataUrl: image,
                backgroundDataUrl: image,
                imageCrops: slotCrops.optional(),
                imageSources: slotSources.optional(),
                backgroundMaskOpacity: z.number().min(0).max(1).default(0),
            })
            .strict(),
        warnings: z.array(z.string().max(300)).max(30),
    })
    .strict()

export const exportTicketSchema = ticketDraftSchema
    .refine(
        (ticket) =>
            !ticket.barcodeEnabled ||
            !ticket.barcode ||
            ticket.barcode.userConfirmed,
        {
            path: ['barcode', 'userConfirmed'],
            message: '请核对并确认条码内容',
        },
    )
    .superRefine((draft, context) => {
        const ticket = activeEventTicket(draft)
        const issue = (message: string) =>
            context.addIssue({ code: 'custom', message })
        for (const key of selectedEventFields(ticket)) {
            const value = eventValue(ticket, key)
            if (!value) continue
            const [label, , kind] = eventFieldDefinitions[key]
            if (kind === 'url') {
                try {
                    const url = new URL(value)
                    if (
                        url.protocol !== 'https:' ||
                        url.username ||
                        url.password
                    )
                        throw new Error()
                } catch {
                    issue(`${label}请填写有效的 HTTPS 链接`)
                }
            } else if (
                kind === 'email' &&
                !z.email().safeParse(value).success
            ) {
                issue('请填写有效的联系邮箱')
            } else if (kind === 'date' && !date.safeParse(value).success) {
                issue(`${label}无效`)
            } else if (kind === 'price') {
                if (!/^\d{1,9}(\.\d{1,2})?$/.test(value))
                    issue('票价应为非负金额，最多两位小数')
                if (!/^[A-Z]{3}$/.test(ticket.eventInfo?.currency ?? ''))
                    issue('请填写三位大写币种代码，例如 CNY')
            } else if (kind === 'performers') {
                const names = value.split(/\r?\n/).filter((name) => name.trim())
                if (
                    names.length > 10 ||
                    names.some((name) => name.length > 160)
                )
                    issue('最多填写 10 位艺人，每位不超过 160 字')
            } else if (kind !== 'multiline' && value.length > 160) {
                issue(`${label}不能超过 160 字`)
            }
        }
        if (
            ticket.startsAt &&
            ticket.eventInfo?.endsAt &&
            Date.parse(ticket.eventInfo.endsAt) < Date.parse(ticket.startsAt)
        )
            issue('结束时间不能早于开始时间')
        if (
            ticket.eventType === 'sports' &&
            ticket.passStyle === 'posterEventTicket' &&
            ticket.appearance.backgroundDataUrl &&
            ticket.barcodeEnabled &&
            ticket.barcode &&
            (!ticket.eventInfo?.homeTeamAbbreviation ||
                !ticket.eventInfo?.awayTeamAbbreviation)
        )
            issue('体育海报票卡需要主队和客队简称，请在调整填写项中启用并填写')
        if (
            draft.customFields?.some(
                (field) =>
                    field.enabled &&
                    Boolean(field.label) !== Boolean(field.value),
            )
        )
            issue('请补全自定义文字项的名称和内容')
    })

export const editableDraftSchema = ticketDraftSchema.extend({ eventName: text })

export type TicketDraft = z.infer<typeof ticketDraftSchema>
export type TicketBarcode = z.infer<typeof barcodeSchema>

// Preserve the poster style and explicit switches; only legacy drafts without
// a switch infer it from retained barcode content.
export function migrateDraft(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const draft = value as Record<string, unknown>
    const migrated = Array.isArray(draft.warnings)
        ? {
              ...draft,
              warnings: draft.warnings.filter(
                  (warning) =>
                      typeof warning !== 'string' ||
                      !warning.startsWith('旧草稿中的条码已移除'),
              ),
          }
        : draft
    if (draft.passStyle !== 'posterEventTicket') return migrated
    return {
        ...migrated,
        barcodeEnabled: draft.barcodeEnabled ?? Boolean(draft.barcode),
    }
}

// crypto.randomUUID needs a secure context, so plain-HTTP LAN addresses lack
// it while getRandomValues stays available everywhere.
function randomId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10).join(''),
    ].join('-')
}

export function newDraft(): TicketDraft {
    return selectEventPreset(
        {
            schemaVersion: 1,
            id: randomId(),
            eventName: '',
            timezone: deviceTimezone(),
            passStyle: 'eventTicket',
            barcodeEnabled: false,
            appearance: {
                backgroundColor: '#1668c7',
                foregroundColor: '#ffffff',
                labelColor: '#fff3b0',
                backgroundMaskOpacity: 0,
            },
            warnings: [],
        },
        'performance',
    )
}
