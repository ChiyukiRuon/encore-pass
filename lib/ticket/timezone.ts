// Used when the browser cannot resolve a usable device zone.
export const fallbackTimezone = 'Asia/Shanghai'

// Safari before 15.4 lacks Intl.supportedValuesOf; keep common venues usable.
const fallbackTimezones = [
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Taipei',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Singapore',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
    'Australia/Sydney',
    'UTC',
]

const regionLabels: Record<string, string> = {
    Africa: '非洲',
    America: '美洲',
    Antarctica: '南极洲',
    Arctic: '北极',
    Asia: '亚洲',
    Atlantic: '大西洋',
    Australia: '澳大利亚',
    Europe: '欧洲',
    Indian: '印度洋',
    Pacific: '太平洋',
}

export type TimezoneGroup = {
    label: string
    zones: string[]
}

export function isValidTimezone(timezone: string): boolean {
    try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
        return true
    } catch {
        return false
    }
}

export function deviceTimezone(): string {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimezone(zone) ? zone : fallbackTimezone
}

function supportedTimezones(): string[] {
    try {
        const supported = Intl.supportedValuesOf('timeZone')
        return supported.length > 0 ? supported : fallbackTimezones
    } catch {
        return fallbackTimezones
    }
}

let cachedGroups: TimezoneGroup[] | undefined

export function timezoneGroups(): TimezoneGroup[] {
    if (cachedGroups) return cachedGroups
    const groups = new Map<string, string[]>()
    for (const zone of supportedTimezones()) {
        const slash = zone.indexOf('/')
        const region = slash === -1 ? '' : zone.slice(0, slash)
        const label = regionLabels[region] ?? '其他'
        const zones = groups.get(label) ?? []
        zones.push(zone)
        groups.set(label, zones)
    }
    // Engines that implement supportedValuesOf omit UTC from the list.
    const other = groups.get('其他') ?? []
    if (!other.includes('UTC')) other.push('UTC')
    groups.set('其他', other)
    cachedGroups = [...groups].map(([label, zones]) => ({ label, zones }))
    return cachedGroups
}

let cachedNames: Set<string> | undefined

// A stored draft may keep an alias such as US/Eastern that the engine lists
// under its canonical name; the editor still offers that value.
export function isListedTimezone(timezone: string): boolean {
    cachedNames ??= new Set(timezoneGroups().flatMap((group) => group.zones))
    return cachedNames.has(timezone)
}
