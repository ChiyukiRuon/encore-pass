import { AppError } from './errors'

let active = 0
let windowStart = Date.now()
let requests = 0

// Single-process, instance-wide budget: untrusted forwarding headers are never used as identity.
export function reserveGeneration() {
    if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now()
        requests = 0
    }
    if (++requests > 30 || active >= 2)
        throw new AppError(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试')
    active++
    return () => {
        active--
    }
}

export async function readLimitedJson(request: Request): Promise<unknown> {
    const configured = Number(process.env.MAX_REQUEST_SIZE_MB || 10)
    const max =
        Math.min(
            Number.isFinite(configured) && configured > 0 ? configured : 10,
            10,
        ) *
        1024 *
        1024
    if (Number(request.headers.get('content-length')) > max)
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
    const reader = request.body?.getReader()
    if (!reader) throw new AppError(400, 'INVALID_TICKET', '请求内容为空')
    const chunks: Uint8Array[] = []
    let size = 0
    const timeout = setTimeout(() => {
        void reader.cancel()
    }, 15_000)
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > max) {
                await reader.cancel()
                throw new AppError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
            }
            chunks.push(value)
        }
        try {
            return JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
            throw new AppError(400, 'INVALID_TICKET', 'JSON 格式无效')
        }
    } finally {
        clearTimeout(timeout)
        reader.releaseLock()
    }
}
