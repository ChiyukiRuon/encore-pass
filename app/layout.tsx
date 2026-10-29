import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
    title: 'EncorePass · 每一场，都值得珍藏',
    description: 'Apple Wallet 自定义活动票卡生成器',
}

export const viewport: Viewport = {
    colorScheme: 'light dark',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f2f7ff' },
        { media: '(prefers-color-scheme: dark)', color: '#08111f' },
    ],
}

// Wallet event ticket silhouette (top notch), shared by the fill and its clip.
const ticket =
    'M23 16H26.8A5.2 5.2 0 0 0 37.2 16H41A5 5 0 0 1 46 21V49A5 5 0 0 1 41 54H23A5 5 0 0 1 18 49V21A5 5 0 0 1 23 16Z'

// 镭射票: a tilted holographic keepsake ticket with a sparkle. Keep in sync with app/icon.svg.
function BrandMark() {
    return (
        <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
                <linearGradient id="brand-sky" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4fb4ff" />
                    <stop offset="1" stopColor="#1d6fe0" />
                </linearGradient>
                <radialGradient id="brand-glow" cx="0.5" cy="0" r="0.8">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="brand-foil" x1="0.1" y1="0" x2="0.9" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="0.33" stopColor="#ffe1ee" />
                    <stop offset="0.67" stopColor="#fff6c2" />
                    <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
                <clipPath id="brand-ticket">
                    <path d={ticket} />
                </clipPath>
            </defs>
            <rect width="64" height="64" rx="15" fill="url(#brand-sky)" />
            <rect width="64" height="64" rx="15" fill="url(#brand-glow)" />
            <g transform="rotate(-10 32 35)">
                <path d={ticket} fill="url(#brand-foil)" />
                <g clipPath="url(#brand-ticket)" fill="#ffffff">
                    <path d="M10 47 36 13 42.5 17.5 16.5 51.5Z" opacity="0.5" />
                    <path
                        d="M24 55 50 21 51.8 22.4 25.8 56.4Z"
                        opacity="0.55"
                    />
                </g>
                <path
                    d="M22.5 45.5H41.5"
                    stroke="#1d6fe0"
                    strokeOpacity="0.4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="0.1 3.8"
                />
            </g>
            <path
                d="M46.5 4.5Q48.02 12.48 56 14Q48.02 15.52 46.5 23.5Q44.98 15.52 37 14Q44.98 12.48 46.5 4.5Z"
                fill="#ffe470"
            />
            <path
                d="M14.5 46.5Q15.14 49.86 18.5 50.5Q15.14 51.14 14.5 54.5Q13.86 51.14 10.5 50.5Q13.86 49.86 14.5 46.5Z"
                fill="#ffffff"
                opacity="0.85"
            />
        </svg>
    )
}

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="zh-CN">
            <body>
                <header className="site-header">
                    <div className="site-header-inner">
                        <Link href="/" className="wordmark">
                            <BrandMark />
                            EncorePass
                        </Link>
                        <a
                            className="header-github"
                            href="https://github.com/ChiyukiRuon/encore-pass"
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label="在 GitHub 查看 EncorePass 源码"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.1.82-.26.82-.58 0-.29-.01-1.24-.02-2.25-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.3 0 .32.21.7.82.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z"
                                    fill="currentColor"
                                />
                            </svg>
                        </a>
                    </div>
                </header>
                <main>{children}</main>
            </body>
        </html>
    )
}
