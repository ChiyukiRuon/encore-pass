import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

afterEach(() => vi.unstubAllEnvs())

it('fails closed in production without access configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ACCESS_PASSWORD', '')
    vi.stubEnv('ALLOW_UNAUTHENTICATED', 'false')
    expect(proxy(new NextRequest('http://localhost/')).status).toBe(503)
})

it('requires the configured password and accepts valid Basic auth', () => {
    vi.stubEnv('ACCESS_PASSWORD', 'synthetic-password')
    expect(proxy(new NextRequest('http://localhost/')).status).toBe(401)
    const request = new NextRequest('http://localhost/', {
        headers: {
            authorization: `Basic ${Buffer.from('user:synthetic-password').toString('base64')}`,
        },
    })
    expect(proxy(request).status).toBe(200)
})
