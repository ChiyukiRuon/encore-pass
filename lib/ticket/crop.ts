import { z } from 'zod'

// Normalized source coordinates: x/y/width/height are fractions of the
// downscaled upload, so a crop survives resizing and re-importing the draft.
const epsilon = 0.0001

export const imageCropSchema = z
    .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().gt(0).max(1),
        height: z.number().gt(0).max(1),
    })
    .strict()
    .refine(
        (crop) =>
            crop.x + crop.width <= 1 + epsilon &&
            crop.y + crop.height <= 1 + epsilon,
        '裁切区域超出图片范围',
    )

export type ImageCrop = z.infer<typeof imageCropSchema>

export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export const cropHandles: CropHandle[] = [
    'nw',
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
]

export const fullCrop: ImageCrop = { x: 0, y: 0, width: 1, height: 1 }

export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

// Keep stored drafts tidy; sub-pixel noise is meaningless here.
function round(value: number) {
    return Math.round(value * 100_000) / 100_000
}

export function isFullCrop(crop: ImageCrop) {
    return (
        crop.x <= epsilon &&
        crop.y <= epsilon &&
        crop.width >= 1 - epsilon &&
        crop.height >= 1 - epsilon
    )
}

// Largest centred region with the requested pixel aspect ratio. Slots that
// fill their frame (thumbnail, background) start here so confirming without
// dragging reproduces the previous automatic centre crop.
export function defaultCrop(
    imageWidth: number,
    imageHeight: number,
    aspect?: number,
): ImageCrop {
    if (!aspect || imageWidth <= 0 || imageHeight <= 0) return { ...fullCrop }
    const imageAspect = imageWidth / imageHeight
    if (Math.abs(imageAspect - aspect) < epsilon) return { ...fullCrop }
    if (imageAspect > aspect) {
        const width = round(aspect / imageAspect)
        return { x: round((1 - width) / 2), y: 0, width, height: 1 }
    }
    const height = round(imageAspect / aspect)
    return { x: 0, y: round((1 - height) / 2), width: 1, height }
}

// Clip an existing selection to the largest centred region with the requested
// pixel aspect. Reopening a crop after the layout changes keeps the frame
// honest instead of showing a region the pass will crop further.
export function fitCropAspect(
    crop: ImageCrop,
    imageWidth: number,
    imageHeight: number,
    aspect?: number,
): ImageCrop {
    if (!aspect || imageWidth <= 0 || imageHeight <= 0) return crop
    const ratio = imageWidth / (aspect * imageHeight)
    const width = Math.min(crop.width, crop.height / ratio)
    const height = width * ratio
    if (width >= crop.width - epsilon && height >= crop.height - epsilon)
        return crop
    return {
        x: round(crop.x + (crop.width - width) / 2),
        y: round(crop.y + (crop.height - height) / 2),
        width: round(width),
        height: round(height),
    }
}

export function moveCrop(crop: ImageCrop, dx: number, dy: number): ImageCrop {
    return {
        ...crop,
        x: round(clamp(crop.x + dx, 0, Math.max(0, 1 - crop.width))),
        y: round(clamp(crop.y + dy, 0, Math.max(0, 1 - crop.height))),
    }
}

// `ratio` is the normalized height per normalized width that keeps the pixel
// aspect ratio: imageWidth / (imageHeight * aspect). With it, corner handles
// resize both sides together; without it each edge moves independently.
export function resizeCrop(
    crop: ImageCrop,
    handle: CropHandle,
    dx: number,
    dy: number,
    {
        ratio,
        minWidth = epsilon,
        minHeight = epsilon,
    }: { ratio?: number; minWidth?: number; minHeight?: number } = {},
): ImageCrop {
    const left = crop.x
    const top = crop.y
    const right = crop.x + crop.width
    const bottom = crop.y + crop.height
    const smallestWidth = Math.min(Math.max(minWidth, epsilon), 1)
    const smallestHeight = Math.min(Math.max(minHeight, epsilon), 1)

    if (ratio && handle.length === 2) {
        const growsEast = handle.includes('e')
        const growsSouth = handle.includes('s')
        const maxWidthX = growsEast ? 1 - left : right
        const maxHeight = growsSouth ? 1 - top : bottom
        const maxWidth = Math.max(
            epsilon,
            Math.min(maxWidthX, maxHeight / ratio),
        )
        // Dragging diagonally can change either axis; use the stronger one so
        // the frame follows the pointer instead of only its horizontal part.
        const fromX = growsEast ? crop.width + dx : crop.width - dx
        const fromY = growsSouth
            ? crop.width + dy / ratio
            : crop.width - dy / ratio
        const width =
            Math.abs(fromX - crop.width) >= Math.abs(fromY - crop.width)
                ? fromX
                : fromY
        const sized = round(
            clamp(width, Math.min(smallestWidth, maxWidth), maxWidth),
        )
        const height = round(sized * ratio)
        return {
            x: Math.max(0, round(growsEast ? left : right - sized)),
            y: Math.max(0, round(growsSouth ? top : bottom - height)),
            width: sized,
            height,
        }
    }

    let nextLeft = left
    let nextTop = top
    let nextRight = right
    let nextBottom = bottom
    if (handle.includes('w'))
        nextLeft = clamp(left + dx, 0, Math.max(0, right - smallestWidth))
    if (handle.includes('e'))
        nextRight = clamp(right + dx, Math.min(1, left + smallestWidth), 1)
    if (handle.includes('n'))
        nextTop = clamp(top + dy, 0, Math.max(0, bottom - smallestHeight))
    if (handle.includes('s'))
        nextBottom = clamp(bottom + dy, Math.min(1, top + smallestHeight), 1)
    return {
        x: round(nextLeft),
        y: round(nextTop),
        width: round(nextRight - nextLeft),
        height: round(nextBottom - nextTop),
    }
}
