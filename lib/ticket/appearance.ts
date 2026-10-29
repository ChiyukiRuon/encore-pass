import type { TicketDraft } from './schema'

export type ImageSlot = 'logo' | 'thumbnail' | 'background' | 'secondaryLogo'
export type ImageOutput =
    | 'logo'
    | 'primaryLogo'
    | 'thumbnail'
    | 'background'
    | 'artwork'
    | 'secondaryLogo'

// One uploaded image can produce several Wallet files. The classic event
// ticket uses logo/thumbnail/background; the poster layout uses primaryLogo and
// the unblurred artwork. The secondary logo appears on every poster layout.
export const passImageOutputs: Record<
    ImageOutput,
    {
        width: number
        height: number
        minWidth?: number
        fit: 'inside' | 'cover'
        rounded?: boolean
    }
> = {
    logo: { width: 160, height: 50, minWidth: 50, fit: 'inside' },
    primaryLogo: { width: 126, height: 30, minWidth: 30, fit: 'inside' },
    thumbnail: { width: 90, height: 90, fit: 'cover', rounded: true },
    background: { width: 343, height: 503, fit: 'cover' },
    artwork: { width: 358, height: 448, fit: 'cover' },
    secondaryLogo: {
        width: 135,
        height: 12,
        minWidth: 0,
        fit: 'inside',
    },
}

// User-facing image slots and their largest source size. The browser stores
// enough pixels for every output generated from the same upload.
export const passImages = {
    logo: { key: 'logoDataUrl' },
    thumbnail: { key: 'thumbnailDataUrl' },
    background: { key: 'backgroundDataUrl' },
    secondaryLogo: { key: 'secondaryLogoDataUrl' },
} as const

export const imageSourceSizes = {
    logo: { width: 160, height: 50 },
    thumbnail: { width: 90, height: 90 },
    background: { width: 358, height: 503 },
    secondaryLogo: { width: 135, height: 12 },
} as const

// Selection frames for the crop sheet. Cover slots lock the visible Wallet
// aspect so the frame matches what the pass will show; logos are fitted inside
// their box, so they keep a free selection.
export function imageCropFrame(
    slot: ImageSlot,
    posterLayout: boolean,
    genericPoster = false,
): { aspect?: number; label: string } {
    if (slot === 'thumbnail') return { aspect: 1, label: '1:1' }
    if (slot === 'background') {
        if (genericPoster) return { aspect: 345 / 505, label: '345:505' }
        const { width, height } = posterLayout
            ? passImageOutputs.artwork
            : passImageOutputs.background
        return { aspect: width / height, label: `${width}:${height}` }
    }
    return { label: '自由比例' }
}

// The retired strip/hero image becomes the thumbnail; strips are coupon and store-card only.
export function migrateAppearance(draft: TicketDraft): TicketDraft {
    if (!draft.appearance.heroDataUrl) return draft
    const { heroDataUrl, ...appearance } = draft.appearance
    return {
        ...draft,
        appearance: {
            ...appearance,
            thumbnailDataUrl: appearance.thumbnailDataUrl || heroDataUrl,
        },
    }
}
