import { describe, expect, it } from 'vitest'
import { newDraft } from '@/lib/ticket/schema'
import {
    deviceTimezone,
    isValidTimezone,
    timezoneGroups,
} from '@/lib/ticket/timezone'

describe('timezone options', () => {
    it('groups the IANA list with UTC and no duplicates', () => {
        const groups = timezoneGroups()
        const zones = groups.flatMap((group) => group.zones)
        expect(groups.map((group) => group.label)).toContain('亚洲')
        expect(groups.every((group) => group.zones.length > 0)).toBe(true)
        expect(zones).toContain('Asia/Shanghai')
        expect(zones).toContain('Asia/Tokyo')
        expect(zones).toContain('UTC')
        expect(new Set(zones).size).toBe(zones.length)
    })
    it('lists every zone the engine reports', () => {
        const zones = new Set(timezoneGroups().flatMap((group) => group.zones))
        for (const zone of Intl.supportedValuesOf('timeZone'))
            expect(zones.has(zone)).toBe(true)
    })
    it('validates IANA names', () => {
        expect(isValidTimezone('Asia/Tokyo')).toBe(true)
        expect(isValidTimezone('Mars/Test')).toBe(false)
    })
})

describe('device timezone default', () => {
    it('resolves the device zone when it is valid', () => {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
        expect(deviceTimezone()).toBe(
            isValidTimezone(zone) ? zone : 'Asia/Shanghai',
        )
    })
    it('starts new drafts on the device zone', () => {
        const draft = newDraft()
        expect(draft.timezone).toBe(deviceTimezone())
        expect(isValidTimezone(draft.timezone)).toBe(true)
    })
})
