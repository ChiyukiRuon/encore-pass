import { timingSafeEqual, createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
    const password = process.env.ACCESS_PASSWORD
    if (!password) {
        if (
            process.env.NODE_ENV === 'production' &&
            process.env.ALLOW_UNAUTHENTICATED !== 'true'
        )
            return new NextResponse(
                '请设置 ACCESS_PASSWORD，或仅在可信本机预览时设置 ALLOW_UNAUTHENTICATED=true',
                { status: 503 },
            )
        return NextResponse.next()
    }
    let supplied = ''
    const header = request.headers.get('authorization')
    if (header?.startsWith('Basic ')) {
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
        supplied = decoded.slice(decoded.indexOf(':') + 1)
    }
    const hash = (value: string) => createHash('sha256').update(value).digest()
    if (timingSafeEqual(hash(supplied), hash(password)))
        return NextResponse.next()
    return new NextResponse('需要访问密码', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="EncorePass", charset="UTF-8"',
            'Cache-Control': 'no-store',
        },
    })
}

export const config = { matcher: ['/((?!api/health$).*)'] }
