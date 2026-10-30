'use client'

import { Fragment, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { newDraft } from '@/lib/ticket/schema'
import type { TicketDraft } from '@/lib/ticket/schema'
import { toOffsetDate, toLocalDate } from '@/lib/ticket/validation'
import { isListedTimezone, timezoneGroups } from '@/lib/ticket/timezone'
import {
    eventFieldDefinitions,
    eventFieldKeys,
    eventGroups,
    eventPresets,
    eventTypes,
    eventValue,
    selectedEventFields,
    selectEventPreset,
    setEventValue,
} from '@/lib/ticket/event-fields'
import type { EventField, EventPreset } from '@/lib/ticket/event-fields'
import { Section } from './section'

// Primary: activity name and inputs. Secondary: group labels and selection.
// Reuse 12/16 row spacing, 13px labels, surface/fill/tint tokens and buttons.
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

export function EventSection({
    draft,
    update,
    setDraft,
    onMessage,
    action,
}: {
    draft: TicketDraft
    update: DraftUpdate
    setDraft: Dispatch<SetStateAction<TicketDraft | null>>
    onMessage: (message: string) => void
    action?: ReactNode
}) {
    const [choosing, setChoosing] = useState(false)
    const selected = selectedEventFields(draft)
    const hiddenCount = eventFieldKeys.filter(
        (key) => !selected.includes(key) && eventValue(draft, key),
    ).length
    const change = (transform: (current: TicketDraft) => TicketDraft) =>
        setDraft((current) => (current ? transform(current) : current))
    const changeValue = (key: EventField, value: string) =>
        change((current) => setEventValue(current, key, value))

    function dateChange(value: string, apply: (value: string) => void) {
        try {
            apply(toOffsetDate(value, draft.timezone) ?? '')
            onMessage('')
        } catch {
            onMessage('时间或时区无效，夏令时切换的歧义时间需要更换')
        }
    }

    function optionalField(key: EventField, compact = false) {
        const [label, , kind] = eventFieldDefinitions[key]
        const value = eventValue(draft, key)
        const control =
            kind === 'multiline' || kind === 'performers' ? (
                <textarea
                    aria-label={label}
                    className="event-textarea"
                    rows={kind === 'performers' ? 2 : 3}
                    maxLength={1600}
                    value={value}
                    placeholder={
                        kind === 'performers'
                            ? '每行一位，按重要性填写'
                            : '选填'
                    }
                    onChange={(event) => changeValue(key, event.target.value)}
                />
            ) : (
                <input
                    type={
                        kind === 'date'
                            ? 'datetime-local'
                            : kind === 'email' ||
                                kind === 'url' ||
                                kind === 'tel'
                              ? kind
                              : 'text'
                    }
                    inputMode={kind === 'price' ? 'decimal' : undefined}
                    maxLength={kind === 'url' ? 1600 : 160}
                    value={
                        kind === 'date'
                            ? toLocalDate(value, draft.timezone)
                            : value
                    }
                    placeholder={kind === 'url' ? 'https://' : '选填'}
                    onChange={(event) =>
                        kind === 'date'
                            ? dateChange(event.target.value, (date) =>
                                  changeValue(key, date),
                              )
                            : changeValue(key, event.target.value)
                    }
                />
            )
        if (kind === 'price') {
            return (
                <Fragment key={key}>
                    <label className="row field">
                        <span className="field-label">{label}</span>
                        {control}
                    </label>
                    <label className="row field">
                        <span className="field-label">币种</span>
                        <input
                            placeholder="CNY"
                            maxLength={3}
                            value={draft.eventInfo?.currency ?? ''}
                            onChange={(event) =>
                                update('eventInfo', {
                                    ...draft.eventInfo,
                                    currency: event.target.value.toUpperCase(),
                                })
                            }
                        />
                    </label>
                </Fragment>
            )
        }
        return (
            <label
                className={compact ? 'event-input field' : 'row field'}
                key={key}
            >
                <span className="field-label">{label}</span>
                {control}
            </label>
        )
    }

    function fieldRows(keys: EventField[]) {
        const rows: ReactNode[] = []
        for (let index = 0; index < keys.length;) {
            const key = keys[index]
            const kind = eventFieldDefinitions[key][2]
            const seats = keys.slice(index, index + 3)
            if (seats.join(',') === 'section,row,seat') {
                rows.push(
                    <div className="row split three" key={key}>
                        {seats.map((field) => optionalField(field, true))}
                    </div>,
                )
                index += 3
            } else if (
                ['text', 'date', 'tel', 'email'].includes(kind) &&
                keys[index + 1] &&
                ['text', 'date', 'tel', 'email'].includes(
                    eventFieldDefinitions[keys[index + 1]][2],
                )
            ) {
                rows.push(
                    <div className="row split" key={key}>
                        {optionalField(key, true)}
                        {optionalField(keys[index + 1], true)}
                    </div>,
                )
                index += 2
            } else {
                rows.push(optionalField(key))
                index++
            }
        }
        return rows
    }

    function customChange(
        id: string,
        patch: Partial<NonNullable<TicketDraft['customFields']>[number]>,
    ) {
        update(
            'customFields',
            draft.customFields?.map((item) =>
                item.id === id ? { ...item, ...patch } : item,
            ),
        )
    }

    return (
        <Section
            step={1}
            title="活动信息"
            description="选择预设，再按需调整要填写的信息"
            action={action}
        >
            <label className="row field field-select">
                <span className="field-label">填写预设</span>
                <select
                    aria-label="填写预设"
                    value={draft.eventPreset ?? 'custom'}
                    onChange={(event) => {
                        const preset = event.target.value as EventPreset
                        change((current) => selectEventPreset(current, preset))
                        setChoosing(preset === 'custom')
                    }}
                >
                    {Object.entries(eventPresets).map(([key, preset]) => (
                        <option key={key} value={key}>
                            {preset.label}
                        </option>
                    ))}
                    <option value="custom">自定义</option>
                </select>
            </label>
            <div className="row">
                <button
                    type="button"
                    className="button button-gray"
                    aria-expanded={choosing}
                    aria-controls="event-field-picker"
                    onClick={() => setChoosing(!choosing)}
                >
                    调整填写项
                </button>
                {hiddenCount > 0 && (
                    <p className="event-help">
                        另有 {hiddenCount}{' '}
                        项已填写但未启用，仅保留在本地草稿中。
                    </p>
                )}
            </div>
            {choosing && (
                <div id="event-field-picker" className="row event-field-picker">
                    <p className="event-help">
                        勾选后按自定义保存；取消勾选会保留内容，但不写入票卡。
                    </p>
                    {eventGroups.map((group) => (
                        <fieldset key={group}>
                            <legend>{group}</legend>
                            <div className="event-options">
                                {eventFieldKeys
                                    .filter(
                                        (key) =>
                                            eventFieldDefinitions[key][1] ===
                                            group,
                                    )
                                    .map((key) => (
                                        <label key={key}>
                                            <input
                                                type="checkbox"
                                                checked={selected.includes(key)}
                                                onChange={(event) => {
                                                    const checked =
                                                        event.target.checked
                                                    change((current) => ({
                                                        ...current,
                                                        eventPreset: 'custom',
                                                        eventFields: checked
                                                            ? [
                                                                  ...selectedEventFields(
                                                                      current,
                                                                  ),
                                                                  key,
                                                              ]
                                                            : selectedEventFields(
                                                                  current,
                                                              ).filter(
                                                                  (field) =>
                                                                      field !==
                                                                      key,
                                                              ),
                                                    }))
                                                }}
                                            />
                                            {eventFieldDefinitions[key][0]}
                                        </label>
                                    ))}
                            </div>
                        </fieldset>
                    ))}
                </div>
            )}
            <div className="row event-group-title">基本信息</div>
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
            <label className="row field field-select">
                <span className="field-label">活动类别</span>
                <select
                    aria-label="活动类别"
                    value={
                        draft.eventType ??
                        (draft.performer ? 'livePerformance' : 'generic')
                    }
                    onChange={(event) =>
                        update(
                            'eventType',
                            event.target.value as TicketDraft['eventType'],
                        )
                    }
                >
                    {Object.entries(eventTypes).map(([key, label]) => (
                        <option key={key} value={key}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            <div className="row split">
                <label className="field">
                    <span className="field-label">场馆</span>
                    <input
                        maxLength={160}
                        value={draft.venueName ?? ''}
                        onChange={(event) =>
                            update('venueName', event.target.value)
                        }
                    />
                </label>
                <label className="field">
                    <span className="field-label">场馆地区</span>
                    <input
                        maxLength={160}
                        value={draft.venueRegionName ?? ''}
                        onChange={(event) =>
                            update('venueRegionName', event.target.value)
                        }
                    />
                </label>
            </div>
            <label className="row field">
                <span className="field-label">场馆地址</span>
                <input
                    maxLength={300}
                    value={draft.venueAddress ?? ''}
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
            <label className="row field">
                <span className="field-label">开始时间</span>
                <input
                    type="datetime-local"
                    value={toLocalDate(draft.startsAt, draft.timezone)}
                    onChange={(event) =>
                        dateChange(event.target.value, (value) =>
                            update('startsAt', value || undefined),
                        )
                    }
                />
            </label>
            {eventGroups.map((group) => {
                const keys = eventFieldKeys.filter(
                    (key) =>
                        selected.includes(key) &&
                        eventFieldDefinitions[key][1] === group,
                )
                return (
                    keys.length > 0 && (
                        <div className="event-group" key={group}>
                            <h3 className="row event-group-title">{group}</h3>
                            {fieldRows(keys)}
                        </div>
                    )
                )
            })}
            <div className="event-group">
                <h3 className="row event-group-title">自定义文字项</h3>
                {draft.customFields?.map((field, index) => (
                    <div className="row custom-event-field" key={field.id}>
                        <div className="row">
                            <label className="toggle-row">
                                <span>启用文字项 {index + 1}</span>
                                <span className="switch">
                                    <input
                                        type="checkbox"
                                        role="switch"
                                        checked={field.enabled}
                                        onChange={(event) =>
                                            customChange(field.id, {
                                                enabled: event.target.checked,
                                            })
                                        }
                                    />
                                    <span />
                                </span>
                            </label>
                        </div>
                        <label className="row field">
                            <span className="field-label">
                                名称 {index + 1}
                            </span>
                            <input
                                maxLength={80}
                                value={field.label}
                                onChange={(event) =>
                                    customChange(field.id, {
                                        label: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <label className="row field">
                            <span className="field-label">
                                内容 {index + 1}
                            </span>
                            <textarea
                                aria-label={`内容 ${index + 1}`}
                                className="event-textarea"
                                maxLength={1600}
                                value={field.value}
                                onChange={(event) =>
                                    customChange(field.id, {
                                        value: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <div className="row">
                            <button
                                type="button"
                                className="button button-destructive"
                                onClick={() =>
                                    update(
                                        'customFields',
                                        draft.customFields?.filter(
                                            (item) => item.id !== field.id,
                                        ),
                                    )
                                }
                            >
                                移除文字项 {index + 1}
                            </button>
                        </div>
                    </div>
                ))}
                <div className="row">
                    <button
                        type="button"
                        className="button button-gray"
                        disabled={(draft.customFields?.length ?? 0) >= 10}
                        onClick={() =>
                            update('customFields', [
                                ...(draft.customFields ?? []),
                                {
                                    id: newDraft().id,
                                    label: '',
                                    value: '',
                                    enabled: true,
                                },
                            ])
                        }
                    >
                        添加自定义文字项
                    </button>
                    <p className="event-help">最多 10 项，显示在票卡详情中。</p>
                </div>
            </div>
        </Section>
    )
}
