import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { AppError } from '@/lib/server/errors'
import { remotePayloadBodies } from '@/lib/wallet/remote-payload'
import { eventInformationLinks } from '@/lib/ticket/event-fields'

const origin = 'https://walletmcppass.com'
const maxBytes = 10 * 1024 * 1024
const downloadUrls = new WeakMap<Buffer, string>()
const providerBarcodeFormats: Record<string, string> = {
    PKBarcodeFormatQR: 'QR',
    PKBarcodeFormatPDF417: 'PDF417',
    PKBarcodeFormatAztec: 'Aztec',
    PKBarcodeFormatCode128: 'Code128',
}

export function remoteDownloadUrl(buffer: Buffer) {
    return downloadUrls.get(buffer)
}

async function readBody(response: Response, max: number) {
    if (!response.body || Number(response.headers.get('content-length')) > max)
        throw new Error('Invalid response size')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > max) {
                await reader.cancel()
                throw new Error('Response too large')
            }
            chunks.push(value)
        }
        return Buffer.concat(chunks)
    } finally {
        reader.releaseLock()
    }
}

export async function remoteSign(
    resources: Record<string, Buffer>,
): Promise<Buffer> {
    const pass = JSON.parse(resources['pass.json'].toString())
    const posterEvent = Boolean(
        pass.preferredStyleSchemes?.includes('posterEventTicket') &&
        pass.eventTicket,
    )
    const posterGeneric = Boolean(pass.posterGeneric && pass.generic)
    const snake = (key: string) =>
        key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase())
    const payload: Record<string, unknown> = {
        style: posterGeneric ? 'generic' : 'eventTicket',
        organization_name: pass.organizationName,
        description: pass.description,
        logo_text: pass.logoText,
        background_color: pass.backgroundColor,
        foreground_color: pass.foregroundColor,
        label_color: pass.labelColor,
        relevant_date: pass.relevantDate,
        generate_logo: false,
        serial_number: pass.serialNumber,
        icon_png_b64: resources['icon.png'].toString('base64'),
    }
    const barcode = pass.barcodes?.[0]
    if (barcode) {
        // The REST contract has no encoding parameter; the provider emits Latin-1.
        // Only ASCII has identical bytes in UTF-8 and Latin-1.
        if (
            [...(barcode.message as string)].some(
                (character) =>
                    character.codePointAt(0)! >
                    (barcode.messageEncoding === 'iso-8859-1' ? 255 : 127),
            )
        )
            throw new AppError(
                422,
                'UNSUPPORTED_BARCODE',
                '远程签发不支持此条码编码，请使用 ASCII 内容或本地签名',
            )
        const format = providerBarcodeFormats[barcode.format]
        if (!format)
            throw new AppError(422, 'UNSUPPORTED_BARCODE', '条码格式不受支持')
        payload.barcode_format = format
        payload.barcode_message = barcode.message
        if (barcode.altText) payload.barcode_alt_text = barcode.altText
    }
    for (const [key, value] of Object.entries(
        posterGeneric ? pass.generic : pass.eventTicket,
    ))
        payload[snake(key)] = value
    if (posterGeneric) {
        payload.poster = true
        // footer_fields is optional; omit it when the poster has no venue.
        if (pass.posterGeneric.footerFields.length)
            payload.footer_fields = pass.posterGeneric.footerFields
    }
    if (posterEvent) {
        const links = Object.fromEntries(
            Object.values(eventInformationLinks).flatMap((key) =>
                pass[key] ? [[key, pass[key]]] : [],
            ),
        )
        if (Object.keys(links).length) payload.info_links = links
        // The provider builds the shared poster layout from semantic tags;
        // eventTicket fields stay as the classic fallback.
        payload.semantic_layout = true
        // The API requires these strings even when the user left them blank.
        // Preserve unknown values as empty rather than inventing a location.
        payload.semantics = {
            venueName: '',
            venueRegionName: '',
            venueRoom: '',
            ...pass.semantics,
        }
    }
    const images: [string, string][] = posterGeneric
        ? [
              ['primaryLogo@3x.png', 'primary_logo_png_b64'],
              ['logo@3x.png', 'logo_png_b64'],
              ['background@3x.png', 'background_png_b64'],
          ]
        : posterEvent
          ? [
                ['primaryLogo@3x.png', 'primary_logo_png_b64'],
                ['logo@3x.png', 'logo_png_b64'],
                ['secondaryLogo@3x.png', 'secondary_logo_png_b64'],
                ['artwork@3x.png', 'artwork_png_b64'],
                ['background@3x.png', 'background_png_b64'],
            ]
          : [
                ['logo@3x.png', 'logo_png_b64'],
                ['thumbnail@3x.png', 'thumbnail_png_b64'],
                ['background@3x.png', 'background_png_b64'],
            ]
    for (const [file, parameter] of images) {
        const image = resources[file]
        if (image) payload[parameter] = image.toString('base64')
    }
    const signal = AbortSignal.timeout(15_000)
    let stage: 'request' | 'response' | 'download' | 'validation' = 'request'
    try {
        let response: Response | undefined
        for await (const body of remotePayloadBodies(payload)) {
            signal.throwIfAborted()
            response = await fetch(`${origin}/api/passes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                redirect: 'error',
                signal,
            })
            if (response.status !== 413) break
            await response.body?.cancel()
        }
        if (!response) throw new Error('Missing signing response')
        if (response.status === 402 || response.status === 429)
            throw new AppError(
                503,
                'REMOTE_QUOTA_EXCEEDED',
                '签发免费额度已用尽，请稍后重试',
            )
        if (response.status === 400)
            throw new AppError(
                422,
                'REMOTE_INVALID_PASS',
                '签发服务拒绝了票卡参数，请检查活动信息和条码',
            )
        if (response.status === 413)
            throw new AppError(
                413,
                'REMOTE_PAYLOAD_TOO_LARGE',
                '签发服务拒绝了过大的图片请求，请减少图片或选择更小的图片后再试',
            )
        if (response.status === 503)
            throw new AppError(
                503,
                'SIGNING_UNAVAILABLE',
                '签发服务暂时繁忙，请稍后重试',
            )
        if (!response.ok)
            throw new AppError(
                503,
                'REMOTE_HTTP_ERROR',
                `签发服务返回 HTTP ${response.status}，请稍后重试`,
            )
        stage = 'response'
        const result = JSON.parse(
            (await readBody(response, 64 * 1024)).toString(),
        )
        const url = new URL(result.download_url)
        if (
            url.origin !== origin ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !/^\/download\/[A-Za-z0-9_-]+$/.test(url.pathname)
        )
            throw new Error('Invalid download URL')
        stage = 'download'
        const download = await fetch(url, { redirect: 'error', signal })
        if (!download.ok)
            throw new AppError(
                503,
                'REMOTE_DOWNLOAD_FAILED',
                `票卡下载返回 HTTP ${download.status}，签发可能已完成，请勿连续重复签发`,
            )
        if (
            !download.ok ||
            !download.headers
                .get('content-type')
                ?.includes('application/vnd.apple.pkpass')
        )
            throw new Error('Invalid pass response')
        const bytes = await readBody(download, maxBytes)
        stage = 'validation'
        let expandedSize = 0
        const files = unzipSync(bytes, {
            filter: (file) => {
                expandedSize += file.originalSize
                if (expandedSize > maxBytes)
                    throw new Error('Archive too large')
                return true
            },
        })
        if (
            !files.signature?.length ||
            !files['manifest.json'] ||
            !files['pass.json']
        )
            throw new Error('Unsigned archive')
        const manifest = JSON.parse(
            Buffer.from(files['manifest.json']).toString(),
        )
        for (const [name, content] of Object.entries(files)) {
            if (name === 'signature' || name === 'manifest.json') continue
            if (
                manifest[name] !==
                createHash('sha1').update(content).digest('hex')
            )
                throw new Error('Invalid manifest')
        }
        if (Object.keys(manifest).some((name) => !files[name]))
            throw new Error('Missing manifest entry')
        const actual = JSON.parse(Buffer.from(files['pass.json']).toString())
        const layout = posterGeneric ? actual.generic : actual.eventTicket
        const actualPosterEvent =
            actual.preferredStyleSchemes?.includes('posterEventTicket') === true
        const layoutMatches = posterGeneric
            ? !!actual.posterGeneric &&
              !actual.eventTicket &&
              !actualPosterEvent
            : !actual.posterGeneric &&
              !actual.generic &&
              actualPosterEvent === posterEvent
        const actualBarcodes = Array.isArray(actual.barcodes)
            ? actual.barcodes
            : actual.barcode
              ? [actual.barcode]
              : []
        const barcodeMatches = barcode
            ? actualBarcodes.length === 1 &&
              actualBarcodes.every(
                  (item: {
                      format?: string
                      message?: string
                      messageEncoding?: string
                  }) =>
                      item.format === barcode.format &&
                      item.message === barcode.message &&
                      (item.messageEncoding === undefined ||
                          item.messageEncoding === barcode.messageEncoding ||
                          (item.messageEncoding === 'iso-8859-1' &&
                              /^[\x00-\x7f]*$/.test(barcode.message))),
              )
            : actualBarcodes.length === 0
        if (!layout || !layoutMatches)
            throw new AppError(
                503,
                'REMOTE_LAYOUT_MISMATCH',
                '服务商返回的票卡样式与所选样式不符，已阻止下载',
            )
        if (!barcodeMatches)
            throw new AppError(
                503,
                'REMOTE_BARCODE_MISMATCH',
                '服务商返回的条码内容或编码不一致，已阻止下载',
            )
        if (
            actual.passTypeIdentifier !== 'pass.com.arshwaraich.vps' ||
            (actual.serialNumber !== undefined &&
                actual.serialNumber !== pass.serialNumber) ||
            (result.serial_number !== undefined &&
                result.serial_number !== actual.serialNumber) ||
            (result.pass_type_identifier !== undefined &&
                result.pass_type_identifier !== actual.passTypeIdentifier)
        )
            throw new AppError(
                503,
                'REMOTE_IDENTITY_MISMATCH',
                '服务商返回的票卡标识与签发请求不一致，已阻止下载',
            )
        downloadUrls.set(bytes, url.href)
        return bytes
    } catch (error) {
        if (error instanceof AppError) throw error
        if (
            signal.aborted ||
            (error instanceof Error &&
                ['TimeoutError', 'AbortError'].includes(error.name))
        )
            throw new AppError(
                503,
                'REMOTE_TIMEOUT',
                `远程${stage === 'download' ? '下载' : '签发'}超过 15 秒未完成，请检查服务器网络或代理`,
            )
        if (stage === 'request' || stage === 'download') {
            // Only expose allowlisted transport codes, never arbitrary upstream
            // messages, URLs, request bodies or barcode contents.
            const cause = error instanceof Error ? error.cause : undefined
            const code =
                cause && typeof cause === 'object' && 'code' in cause
                    ? cause.code
                    : undefined
            const known = [
                'EACCES',
                'EPERM',
                'ECONNREFUSED',
                'ECONNRESET',
                'ENOTFOUND',
                'EAI_AGAIN',
                'ETIMEDOUT',
                'UND_ERR_CONNECT_TIMEOUT',
                'CERT_HAS_EXPIRED',
                'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            ]
            const suffix =
                typeof code === 'string' && known.includes(code)
                    ? `（${code}）`
                    : ''
            throw new AppError(
                503,
                stage === 'request'
                    ? 'REMOTE_NETWORK_ERROR'
                    : 'REMOTE_DOWNLOAD_FAILED',
                `${stage === 'request' ? '服务器无法连接签发服务' : '签发后的票卡下载失败'}${suffix}，请检查运行 EncorePass 的服务器网络、代理和证书`,
            )
        }
        throw new AppError(
            503,
            stage === 'response'
                ? 'REMOTE_RESPONSE_INVALID'
                : 'REMOTE_PASS_INVALID',
            stage === 'response'
                ? '签发服务返回了无效响应或下载地址'
                : '下载的票卡未通过签名文件、清单或格式检查，已阻止下载',
        )
    }
}
