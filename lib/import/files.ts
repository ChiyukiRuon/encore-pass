import { imageSourceSizes } from '@/lib/ticket/appearance'
import type { ImageSlot } from '@/lib/ticket/appearance'
import { isFullCrop } from '@/lib/ticket/crop'
import type { ImageCrop } from '@/lib/ticket/crop'

async function assertImage(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB')
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    const ascii = new TextDecoder().decode(bytes)
    if (bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image/png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg'
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
        return 'image/webp'
    throw new Error('仅支持 PNG、JPEG 和 WebP，请检查文件实际格式')
}

// Keep the bounded original: shrinking before selection destroys crop detail.
export async function appearanceImage(file: File) {
    const mime = await assertImage(file)
    if (file.size > 2 * 1024 * 1024) throw new Error('样式图片不能超过 2 MB')
    const bitmap = await createImageBitmap(file)
    try {
        if (bitmap.width * bitmap.height > 16_000_000)
            throw new Error('图片最多支持 1600 万像素')
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('图片读取失败'))
            reader.readAsDataURL(file.slice(0, file.size, mime))
        })
    } finally {
        bitmap.close()
    }
}

// Crop the original before fitting to @3x, never enlarge a small selection.
export async function cropImage(
    source: string,
    slot: ImageSlot,
    crop: ImageCrop,
) {
    if (isFullCrop(crop)) return source
    const image = new Image()
    image.src = source
    await image.decode()
    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    const left = Math.min(
        naturalWidth - 1,
        Math.max(0, Math.round(crop.x * naturalWidth)),
    )
    const top = Math.min(
        naturalHeight - 1,
        Math.max(0, Math.round(crop.y * naturalHeight)),
    )
    const width = Math.max(
        1,
        Math.min(naturalWidth - left, Math.round(crop.width * naturalWidth)),
    )
    const height = Math.max(
        1,
        Math.min(naturalHeight - top, Math.round(crop.height * naturalHeight)),
    )
    const canvas = document.createElement('canvas')
    const target = imageSourceSizes[slot]
    const ratios = [(target.width * 3) / width, (target.height * 3) / height]
    const scale = Math.min(
        1,
        slot === 'logo' || slot === 'secondaryLogo'
            ? Math.min(...ratios)
            : Math.max(...ratios),
    )
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')!
    context.imageSmoothingQuality = 'high'
    context.drawImage(
        image,
        left,
        top,
        width,
        height,
        0,
        0,
        canvas.width,
        canvas.height,
    )
    const output = canvas.toDataURL('image/png')
    if (output.length > 2_800_000)
        throw new Error('裁剪后的图片超过 2 MB，请选择更简洁的图片')
    return output
}

// Average colour of the artwork above the poster band. Wallet tints the
// material band from the visible artwork, not from the strip it covers.
export async function imageTone(dataUrl: string): Promise<string> {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 34
    canvas.height = 50
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const scale = Math.max(34 / image.width, 50 / image.height)
    const width = image.width * scale
    const height = image.height * scale
    context.drawImage(image, (34 - width) / 2, (50 - height) / 2, width, height)
    // The top 74% is the artwork the 118pt band leaves visible.
    const pixels = context.getImageData(0, 0, 34, 37).data
    const sum = [0, 0, 0]
    for (let index = 0; index < pixels.length; index += 4)
        for (const channel of [0, 1, 2]) sum[channel] += pixels[index + channel]
    return `#${sum
        .map((value) =>
            Math.round(value / (pixels.length / 4))
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`
}
