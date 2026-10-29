import type { TicketBarcode } from '@/lib/ticket/schema'
import { barcodeProblem } from '@/lib/ticket/validation'

export async function decodeBarcode(
    canvas: HTMLCanvasElement,
): Promise<TicketBarcode | undefined> {
    const {
        RGBLuminanceSource,
        BinaryBitmap,
        HybridBinarizer,
        QRCodeReader,
        PDF417Reader,
        AztecCodeReader,
        Code128Reader,
        BarcodeFormat,
        DecodeHintType,
        ResultMetadataType,
    } = await import('@zxing/library')
    const pixels = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data
    const luminance = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let i = 0; i < luminance.length; i++)
        luminance[i] =
            (pixels[i * 4] + pixels[i * 4 + 1] * 2 + pixels[i * 4 + 2]) / 4
    const readers = [
        new QRCodeReader(),
        new PDF417Reader(),
        new AztecCodeReader(),
        new Code128Reader(),
    ]
    let result
    const bitmap = new BinaryBitmap(
        new HybridBinarizer(
            new RGBLuminanceSource(luminance, canvas.width, canvas.height),
        ),
    )
    for (const reader of readers) {
        try {
            result = reader.decode(
                bitmap,
                new Map([[DecodeHintType.TRY_HARDER, true]]),
            )
            break
        } catch {
            /* A miss is expected; do not log decoder internals or ticket data. */
        }
    }
    if (!result) return undefined
    const formats = new Map([
        [BarcodeFormat.QR_CODE, 'QR'],
        [BarcodeFormat.PDF_417, 'PDF417'],
        [BarcodeFormat.AZTEC, 'AZTEC'],
        [BarcodeFormat.CODE_128, 'CODE128'],
    ] as const)
    const format = [...formats.entries()].find(
        ([key]) => key === result.getBarcodeFormat(),
    )?.[1]
    if (!format) throw new Error('检测到不受 Wallet 支持的条码格式，请使用原票')
    const message = result.getText()
    // Raw codewords are not payload bytes. QR BYTE_SEGMENTS are the only byte payload exposed reliably here.
    const segments = result
        .getResultMetadata()
        ?.get(ResultMetadataType.BYTE_SEGMENTS) as Uint8Array[] | undefined
    let encoding: TicketBarcode['encoding'] = 'utf-8'
    if (segments?.length) {
        const bytes = new Uint8Array(
            segments.reduce((sum, segment) => sum + segment.length, 0),
        )
        let offset = 0
        for (const segment of segments) {
            bytes.set(segment, offset)
            offset += segment.length
        }
        const utf = new TextEncoder().encode(message)
        if (
            utf.length !== bytes.length ||
            !utf.every((byte, i) => byte === bytes[i])
        ) {
            if (
                message.length === bytes.length &&
                [...message].every((c, i) => c.charCodeAt(0) === bytes[i])
            )
                encoding = 'iso-8859-1'
            else throw new Error('条码字节与文本不能无损对应，请使用原票')
        }
    } else if (!/^[\x20-\x7e]+$/.test(message)) {
        throw new Error('无法验证非 ASCII 条码的原始字节，请使用原票')
    }
    const barcode: TicketBarcode = {
        format,
        message,
        encoding,
        userConfirmed: false,
    }
    const problem = barcodeProblem(barcode)
    if (problem) throw new Error(problem)
    return barcode
}
