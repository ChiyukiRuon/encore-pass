import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
    projects: [
        {
            name: 'desktop',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 900 },
            },
        },
        {
            name: 'mobile',
            use: {
                ...devices['iPhone 13'],
                defaultBrowserType: 'chromium',
                viewport: { width: 375, height: 812 },
            },
        },
    ],
    webServer: {
        command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1',
        url: 'http://127.0.0.1:3000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
