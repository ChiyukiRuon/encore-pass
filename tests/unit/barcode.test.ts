import { expect, it } from 'vitest'
import bwip from 'bwip-js/node'
import sharp from 'sharp'
import { decodeBarcode } from '@/lib/barcode/decode'

it.each(['qrcode', 'pdf417', 'azteccode', 'code128'])(
    'round-trips synthetic %s through an independent decoder',
    async (format) => {
        const message = 'ENCORE-TEST-12345'
        const png = await bwip.toBuffer({
            bcid: format,
            text: message,
            scale: 3,
            padding: 16,
            backgroundcolor: 'FFFFFF',
        })
        const { data, info } = await sharp(png)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
        const canvas = {
            width: info.width,
            height: info.height,
            getContext: () => ({ getImageData: () => ({ data }) }),
        } as unknown as HTMLCanvasElement
        const decoded = await decodeBarcode(canvas)
        expect(decoded?.message).toBe(message)
        expect(decoded?.userConfirmed).toBe(false)
    },
)
