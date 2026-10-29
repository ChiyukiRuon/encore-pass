'use client'

import type { ReactNode } from 'react'
import type { TicketDraft } from '@/lib/ticket/schema'
import { toOffsetDate, toLocalDate } from '@/lib/ticket/validation'
import { isListedTimezone, timezoneGroups } from '@/lib/ticket/timezone'
import { Section } from './section'

const groupedTimezones = timezoneGroups().map((group) => (
    <optgroup key={group.label} label={group.label}>
        {group.zones.map((zone) => (
            <option key={zone} value={zone}>
                {zone}
            </option>
        ))}
    </optgroup>
))

export type DraftUpdate = <K extends keyof TicketDraft>(
    key: K,
    value: TicketDraft[K],
) => void

type TextKey =
    | 'performer'
    | 'venueName'
    | 'venueRegionName'
    | 'venueRoom'
    | 'section'
    | 'row'
    | 'seat'

export function EventSection({
    draft,
    update,
    onMessage,
    action,
}: {
    draft: TicketDraft
    update: DraftUpdate
    onMessage: (message: string) => void
    action?: ReactNode
}) {
    function textField(key: TextKey, label: string, placeholder?: string) {
        return (
            <label className="field">
                <span className="field-label">{label}</span>
                <input
                    maxLength={160}
                    value={draft[key] || ''}
                    placeholder={placeholder}
                    onChange={(event) => update(key, event.target.value)}
                />
            </label>
        )
    }

    function dateField(key: 'startsAt' | 'doorsOpenAt', label: string) {
        return (
            <label className="field">
                <span className="field-label">{label}</span>
                <input
                    type="datetime-local"
                    value={toLocalDate(draft[key], draft.timezone)}
                    onChange={(event) => {
                        try {
                            update(
                                key,
                                toOffsetDate(
                                    event.target.value,
                                    draft.timezone,
                                ),
                            )
                            onMessage('')
                        } catch {
                            onMessage(
                                '时间或时区无效，夏令时切换的歧义时间需要更换',
                            )
                        }
                    }}
                />
            </label>
        )
    }

    return (
        <Section
            step={1}
            title="活动信息"
            description="尽可能详细地填写活动信息"
            action={action}
        >
            <label className="row field">
                <span className="field-label">
                    活动名称{' '}
                    <span className="required" aria-hidden="true">
                        *
                    </span>
                </span>
                <input
                    required
                    maxLength={160}
                    value={draft.eventName}
                    onChange={(event) =>
                        update('eventName', event.target.value)
                    }
                />
            </label>
            <div className="row split">
                {textField('performer', '艺人 / 主办方')}
                {textField('venueName', '场馆')}
            </div>
            <div className="row split">
                {textField('venueRegionName', '场馆地区', '选填')}
                {textField('venueRoom', '场馆厅室', '选填')}
            </div>
            <label className="row field">
                <span className="field-label">场馆地址</span>
                <input
                    maxLength={300}
                    value={draft.venueAddress || ''}
                    onChange={(event) =>
                        update('venueAddress', event.target.value)
                    }
                />
            </label>
            <label className="row field field-select">
                <span className="field-label">场馆时区</span>
                <select
                    aria-label="场馆时区"
                    value={draft.timezone}
                    onChange={(event) => update('timezone', event.target.value)}
                >
                    {!isListedTimezone(draft.timezone) && (
                        <option value={draft.timezone}>{draft.timezone}</option>
                    )}
                    {groupedTimezones}
                </select>
            </label>
            <div className="row split">
                {dateField('doorsOpenAt', '入场时间')}
                {dateField('startsAt', '开演时间')}
            </div>
            <div className="row split three">
                {textField('section', '区域', '可选')}
                {textField('row', '排', '可选')}
                {textField('seat', '座位', '可选')}
            </div>
        </Section>
    )
}
