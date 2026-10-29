import type { NextConfig } from 'next'

const config: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    allowedDevOrigins: ['127.0.0.1', '192.168.31.95'],
    serverExternalPackages: ['passkit-generator', 'sharp'],
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'no-referrer' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                ],
            },
        ]
    },
}
export default config
