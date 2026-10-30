import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resolve } from 'node:path'

// Choosing a file now opens the region sheet; tests use the default selection.
async function chooseImage(page: Page, label: string, image: string) {
    await page.getByLabel(label, { exact: true }).setInputFiles(image)
    const dialog = page.getByRole('dialog', {
        name: `选择${label}区域`,
        exact: true,
    })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '使用此区域' }).click()
    await expect(dialog).toHaveCount(0)
}

for (const style of ['活动门票', '活动门票(海报)', '通用凭证']) {
    test(`${style} falls back to classic layout when background is removed`, async ({
        page,
    }, testInfo) => {
        await page.goto('/')
        await page
            .getByRole('textbox', { name: '活动名称' })
            .fill('背景布局测试')
        const image = resolve('tests/fixtures/generated/ticket.png')
        await page.getByRole('button', { name: style, exact: true }).click()
        await chooseImage(page, '缩略图', image)
        await expect(page.getByAltText('票卡角标')).toBeVisible()
        await expect(page.locator('.pass')).toHaveAttribute(
            'data-layout',
            'classic',
        )
        await page.getByRole('switch', { name: '显示条码' }).check()
        await page
            .getByLabel('条码内容', { exact: true })
            .fill('BACKGROUND-TEST')
        await expect(page.locator('.pass')).toHaveAttribute(
            'data-layout',
            'classic',
        )
        await expect(page.locator('.pass-barcode-panel')).toBeVisible()
        await expect(page.getByAltText('票卡角标')).toBeVisible()
        await chooseImage(page, '背景图片', image)
        await expect(page.locator('.pass')).toHaveAttribute(
            'data-layout',
            style === '活动门票' ? 'classic' : 'poster',
        )
        if (style !== '活动门票')
            await expect(page.getByAltText('票卡角标')).toHaveCount(0)
        await expect(page.getByLabel('缩略图', { exact: true })).toBeAttached()
        if (style === '通用凭证') {
            await expect(page.locator('.pass-generic-fields')).toContainText(
                '背景布局测试',
            )
            await page
                .locator('.pass')
                .screenshot({ path: testInfo.outputPath('native-generic.png') })
        }
        await page.getByRole('button', { name: '移除背景图片' }).click()
        await expect(page.getByAltText('票卡角标')).toBeVisible()
        await expect(page.locator('.pass')).toHaveAttribute(
            'data-layout',
            'classic',
        )
        await expect(page.locator('.pass-body')).toBeVisible()
        await expect(page.locator('.pass-event-footer')).toHaveCount(0)
        await expect(page.getByLabel('二级标志', { exact: true })).toHaveCount(
            0,
        )
        await page.getByRole('switch', { name: '显示条码' }).uncheck()
        await expect(page.locator('.pass')).toHaveAttribute(
            'data-layout',
            'classic',
        )
    })
}

test('exports current edits with explicit remote consent and presents the iPhone link', async ({
    page,
}) => {
    await page.addInitScript(() =>
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36',
        }),
    )
    await page.route('**/api/passes', async (route) => {
        expect(route.request().headers()['x-encore-remote-sign']).toBe(
            'walletmcppass',
        )
        expect(route.request().postDataJSON().eventName).toBe(
            '我的实机测试票卡',
        )
        expect(route.request().postDataJSON().passStyle).toBe('posterGeneric')
        await route.fulfill({
            status: 200,
            contentType: 'application/vnd.apple.pkpass',
            headers: {
                'X-Wallet-Download-Url':
                    'https://walletmcppass.com/download/test-token',
            },
            body: 'mock download response',
        })
    })
    await page.goto('/')
    await page
        .getByRole('textbox', { name: '活动名称' })
        .fill('我的实机测试票卡')
    await page.getByRole('button', { name: '通用凭证' }).click()
    const consent = page.getByLabel('将数据提供给第三方以生成票卡')
    await expect(consent).not.toBeChecked()
    await consent.click()
    const consentDialog = page.getByRole('dialog', {
        name: '发送数据并签发票卡？',
    })
    await expect(consentDialog).toBeVisible()
    await expect(consent).not.toBeChecked()
    await consentDialog
        .getByRole('button', { name: '同意', exact: true })
        .click()
    await expect(consent).toBeChecked()
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', {
            name: /^(导出票卡数据|下载票卡|添加到 Apple 钱包)$/,
        })
        .click()
    expect((await download).suggestedFilename()).toBe('ticket.pkpass')
    await expect(
        page.getByRole('link', {
            name: 'https://walletmcppass.com/download/test-token',
            exact: true,
        }),
    ).toHaveAttribute('href', 'https://walletmcppass.com/download/test-token')
})

test('combines, restores and removes background, logo, corner thumbnail and secondary logo', async ({
    page,
}, testInfo) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    // Poster event tickets retain all uploads across layout changes.
    const previews = ['票卡背景', '票卡 Logo']
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('自定义背景票卡')
    await page
        .getByRole('button', { name: '活动门票(海报)', exact: true })
        .click()
    await page.getByRole('switch', { name: '显示条码' }).check()
    await page.getByLabel('条码内容', { exact: true }).fill('APPEARANCE-TEST')
    for (const label of ['背景图片', 'Logo', '缩略图', '二级标志'])
        await chooseImage(page, label, image)
    for (const alt of previews)
        await expect(page.getByAltText(alt)).toBeVisible()
    await expect(page.getByRole('button', { name: '移除缩略图' })).toBeVisible()
    await expect(
        page.getByRole('button', { name: '移除二级标志' }),
    ).toBeVisible()
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toHaveCount(0)
    await page.waitForTimeout(700)
    await page.reload()
    for (const alt of previews)
        await expect(page.getByAltText(alt)).toBeVisible()
    await expect(page.getByRole('button', { name: '移除缩略图' })).toBeVisible()
    await expect(
        page.getByRole('button', { name: '移除二级标志' }),
    ).toBeVisible()
    await page.getByAltText('票卡背景').scrollIntoViewIfNeeded()
    await page.screenshot({
        path: testInfo.outputPath('appearance.png'),
        fullPage: true,
    })
    await page.getByRole('button', { name: '移除背景图片' }).click()
    await expect(page.getByAltText('票卡背景')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '移除缩略图' })).toBeVisible()
    await page.getByRole('button', { name: '移除缩略图' }).click()
    await expect(page.getByRole('button', { name: '移除缩略图' })).toHaveCount(
        0,
    )
    await expect(
        page.getByRole('button', { name: '移除二级标志' }),
    ).toHaveCount(0)
    await chooseImage(page, '背景图片', image)
    await expect(page.getByAltText('二级标志', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '移除二级标志' }).click()
    await expect(
        page.getByRole('button', { name: '移除二级标志' }),
    ).toHaveCount(0)
    await expect(page.getByAltText('票卡 Logo')).toBeVisible()
})

test('hides the header text when the performer is empty', async ({ page }) => {
    await page.goto('/')
    const identity = page.locator('.pass-identity-text')
    await expect(identity).toHaveCount(0)
    const performer = page.getByRole('textbox', { name: '艺人 / 演出者' })
    await performer.fill('Example Artist')
    await expect(identity).toHaveText('Example Artist')
    await performer.fill('')
    await expect(identity).toHaveCount(0)
})

test('keeps the artwork anchored when the pass collapses', async ({ page }) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await chooseImage(page, '背景图片', image)
    const before = await page.locator('.pass-background').boundingBox()
    const cardBefore = await page.locator('.pass').boundingBox()
    await page.getByRole('button', { name: '折叠' }).click()
    await expect(page.locator('.pass')).toHaveAttribute(
        'data-collapsed',
        'true',
    )
    await expect(page.locator('.pass-content')).toHaveCSS('opacity', '0')
    const after = await page.locator('.pass-background').boundingBox()
    const cardAfter = await page.locator('.pass').boundingBox()
    expect(cardAfter!.height).toBeCloseTo((cardAfter!.width / 343) * 60, 0)
    expect(after!.y - cardAfter!.y).toBeCloseTo(before!.y - cardBefore!.y, 0)
    expect(after!.height).toBeCloseTo(before!.height, 0)
    await page.getByRole('button', { name: '正常' }).click()
    await expect(page.locator('.pass-content')).toHaveCSS('opacity', '1')
    expect((await page.locator('.pass').boundingBox())!.height).toBeCloseTo(
        cardBefore!.height,
        0,
    )
})

test('switches layouts when the barcode switch or the style changes', async ({
    page,
}) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('样式切换测试')
    await chooseImage(page, '背景图片', image)
    // 活动门票 without a barcode keeps the blurred classic layout.
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await expect(page.locator('.pass-body')).toBeVisible()
    await expect(page.locator('.pass-background-clear')).toHaveCount(0)
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toBeVisible()
    await page.getByRole('slider', { name: '背景遮罩' }).fill('50')
    await expect(page.locator('.pass-mask')).toHaveCSS('opacity', '0.5')
    await expect(page.getByLabel('二级标志', { exact: true })).toHaveCount(0)
    const classicBody = await page.locator('.pass-body').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const card = element.closest('.pass')!.getBoundingClientRect()
        return {
            x: box.x - card.x,
            y: box.y - card.y,
            width: box.width,
            height: box.height,
        }
    })
    // A classic ticket keeps every non-barcode field in place.
    await page.getByRole('switch', { name: '显示条码' }).check()
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await page.getByLabel('条码内容', { exact: true }).fill('STYLE-SWITCH')
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await expect(page.locator('.pass-body')).toBeVisible()
    await expect(page.locator('.pass-barcode-panel')).toBeVisible()
    expect(
        await page.locator('.pass-body').evaluate((element) => {
            const box = element.getBoundingClientRect()
            const card = element.closest('.pass')!.getBoundingClientRect()
            return {
                x: box.x - card.x,
                y: box.y - card.y,
                width: box.width,
                height: box.height,
            }
        }),
    ).toEqual(classicBody)
    const cardBox = await page.locator('.pass').boundingBox()
    const barcodeBox = await page.locator('.pass-barcode-panel').boundingBox()
    expect(
        Math.abs(
            cardBox!.y + cardBox!.height - barcodeBox!.y - barcodeBox!.height,
        ),
    ).toBeLessThan(20)
    await page
        .getByRole('button', { name: '活动门票(海报)', exact: true })
        .click()
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    await expect(page.locator('.pass-event-footer')).toBeVisible()
    await expect(page.locator('.pass-body')).toHaveCount(0)
    await expect(page.locator('.pass-background-clear')).toBeVisible()
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toHaveCount(0)
    await expect(page.locator('.pass-mask')).toHaveCount(0)
    await expect(page.getByLabel('二级标志', { exact: true })).toBeVisible()
    await chooseImage(page, '二级标志', image)
    await expect(page.getByAltText('二级标志', { exact: true })).toBeVisible()
    const posterPanel = await page.locator('.pass-barcode-panel').boundingBox()
    const posterCaption = await page
        .locator('.pass-barcode-alt')
        .evaluate((element) => getComputedStyle(element).fontSize)
    // 通用凭证 always uses the poster layout, with or without a barcode.
    await page.getByRole('button', { name: '通用凭证' }).click()
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toHaveCount(0)
    await expect(page.locator('.pass-mask')).toHaveCount(0)
    // Every barcode card matches the 通用凭证 one.
    expect(
        Math.abs(
            (await page.locator('.pass-barcode-panel').boundingBox())!.width -
                posterPanel!.width,
        ),
    ).toBeLessThan(1)
    await expect(page.locator('.pass-barcode-alt')).toHaveCSS(
        'font-size',
        posterCaption,
    )
    await expect(
        page.locator('.pass[data-style="posterGeneric"]'),
    ).toBeVisible()
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    await expect(page.locator('.pass-generic-footer')).toBeVisible()
    await expect(page.locator('.pass-generic-fields')).toContainText(
        '样式切换测试',
    )
    await expect(page.locator('.pass-body')).toHaveCount(0)
    await expect(page.locator('.pass-background-clear')).toBeVisible()
    await expect(page.locator('.pass-barcode-panel')).toBeVisible()
    await expect(page.getByLabel('二级标志', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('缩略图', { exact: true })).toBeAttached()
    await expect(page.getByAltText('二级标志', { exact: true })).toHaveCount(0)
    await page.getByRole('switch', { name: '显示条码' }).uncheck()
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    await expect(page.locator('.pass-barcode-panel')).toHaveCount(0)
    await page
        .getByRole('button', { name: '活动门票(海报)', exact: true })
        .click()
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    // The classic fallback keeps the retained mask without a barcode.
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toHaveValue(
        '50',
    )
    await expect(page.locator('.pass-mask')).toHaveCSS('opacity', '0.5')
    await expect(page.getByLabel('二级标志', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '活动门票', exact: true }).click()
    await expect(page.getByRole('slider', { name: '背景遮罩' })).toHaveValue(
        '50',
    )
    await expect(page.locator('.pass-mask')).toHaveCSS('opacity', '0.5')
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await expect(page.locator('.pass-body')).toBeVisible()
    await expect(page.locator('.pass-event-footer')).toHaveCount(0)
    await expect(page.locator('.pass-background-clear')).toHaveCount(0)
})

test('shows the event name in the poster event band when seats are empty', async ({
    page,
}) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('海报活动测试')
    await page.getByLabel('场馆', { exact: true }).fill('示例音乐厅')
    await page
        .getByRole('button', { name: '活动门票(海报)', exact: true })
        .click()
    await chooseImage(page, '背景图片', image)
    await page.getByRole('switch', { name: '显示条码' }).check()
    await page.getByLabel('条码内容', { exact: true }).fill('POSTER-EVENT-TEST')
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    const band = page.locator('.pass-event-footer')
    // Without region, row or seat the band keeps its main line: the event name.
    await expect(band.locator('.pass-event-seat p')).toHaveText('活动')
    await expect(band).toContainText('海报活动测试')
    await expect(band.locator('.pass-event-bottom')).toHaveText('示例音乐厅')
    // Seat fields replace the event-name line with the seat columns.
    await page.getByLabel('区域', { exact: true }).fill('A')
    await expect(band.locator('.pass-event-seat p')).toHaveText('区')
    await expect(band).not.toContainText('海报活动测试')
})

test('lays out 通用凭证 as a native poster generic band', async ({ page }) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('通用海报测试')
    await page.getByLabel('艺人 / 演出者', { exact: true }).fill('Example Artist')
    await page.getByLabel('场馆', { exact: true }).fill('示例音乐厅')
    await page.getByLabel('开始时间').fill('2026-12-12T19:30')
    await page.getByLabel('区域', { exact: true }).fill('A')
    await page.getByLabel('排', { exact: true }).fill('3')
    await page.getByLabel('座位', { exact: true }).fill('12')
    await page.getByRole('button', { name: '通用凭证' }).click()
    await chooseImage(page, '背景图片', image)
    await page.getByRole('switch', { name: '显示条码' }).check()
    await page
        .getByLabel('条码内容', { exact: true })
        .fill('GENERIC-POSTER-TEST')
    // The poster generic keeps the artist header and shows the venue only.
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    await expect(page.locator('.pass-identity-text')).toHaveText(
        'Example Artist',
    )
    const fields = page.locator('.pass-generic-fields > div')
    await expect(fields).toHaveCount(4)
    await expect(fields.nth(0)).toContainText('通用海报测试')
    await expect(fields.nth(3)).toContainText('座位')
    await expect(fields.nth(0)).toHaveCSS('text-align', 'start')
    await expect(fields.nth(3)).toHaveCSS('text-align', 'right')
    await expect(page.locator('.pass-generic-bottom')).toHaveText(
        '示例音乐厅',
    )
    // The band reaches the card bottom and the barcode card overlaps it.
    const card = await page.locator('.pass').boundingBox()
    const band = await page.locator('.pass-generic-footer').boundingBox()
    expect(
        Math.abs(card!.y + card!.height - band!.y - band!.height),
    ).toBeLessThan(2)
    const panel = await page.locator('.pass-barcode-panel').boundingBox()
    expect(panel!.y + panel!.height).toBeGreaterThan(band!.y)
    // Removing the background falls back to the classic layout and its artist
    // text; the band is gone.
    await page.getByRole('button', { name: '移除背景图片' }).click()
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await expect(page.locator('.pass-generic-footer')).toHaveCount(0)
    await expect(page.locator('.pass-identity-text')).toHaveText(
        'Example Artist',
    )
})

test('keeps a lone 通用凭证 event field left-aligned in the poster band', async ({
    page,
}) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('通用海报测试')
    await page.getByRole('button', { name: '通用凭证' }).click()
    await chooseImage(page, '背景图片', image)
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    // Without region, row or seat the event label and value stay left; only a
    // trailing seat column hugs the right edge.
    const fields = page.locator('.pass-generic-fields > div')
    await expect(fields).toHaveCount(1)
    await expect(fields.first()).toHaveCSS('text-align', 'start')
    await expect(fields.first().locator('.pass-label')).toHaveCSS(
        'text-align',
        'start',
    )
    await page.getByLabel('区域', { exact: true }).fill('A')
    await expect(fields).toHaveCount(2)
    await expect(fields.first()).toHaveCSS('text-align', 'start')
    await expect(fields.last()).toHaveCSS('text-align', 'right')
})

test('keeps the header date at the right edge without a logo or artist', async ({
    page,
}) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('通用海报测试')
    await page.getByLabel('开始时间').fill('2026-12-12T19:30')
    await page.getByRole('button', { name: '通用凭证' }).click()
    await chooseImage(page, '背景图片', image)
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    await expect(page.locator('.pass-identity')).toHaveCount(0)
    await expect(page.locator('.pass-header-field')).toContainText('日期')
    // The lone date column still hugs the header's right padding.
    const header = (await page.locator('.pass-header').boundingBox())!
    const field = (await page.locator('.pass-header-field').boundingBox())!
    expect(field.x).toBeGreaterThan(header.x + header.width / 2)
    expect(header.x + header.width - (field.x + field.width)).toBeLessThan(20)
})

test('stacks the poster event header date and time without the date label', async ({
    page,
}) => {
    const image = resolve('tests/fixtures/generated/ticket.png')
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('海报活动测试')
    await page
        .getByLabel('艺人 / 演出者', { exact: true })
        .fill('Example Artist')
    await page.getByLabel('开始时间').fill('2026-12-12T19:30')
    await page
        .getByRole('button', { name: '活动门票(海报)', exact: true })
        .click()
    await chooseImage(page, '背景图片', image)
    await page.getByRole('switch', { name: '显示条码' }).check()
    await page.getByLabel('条码内容', { exact: true }).fill('POSTER-EVENT-TEST')
    await expect(page.locator('.pass[data-layout="poster"]')).toBeVisible()
    const field = page.locator('.pass-header-field')
    const time = field.locator('.pass-header-time')
    // With a start time the 日期 label is dropped and the date sits above the
    // time, so the header keeps exactly two lines.
    await expect(field.locator('.pass-label')).toHaveCount(0)
    await expect(field.locator('.pass-value')).toHaveText('12月12日')
    await expect(time).toHaveText('19:30')
    const [dateTop, timeTop] = await field.evaluate((element) => [
        element.querySelector('.pass-value')!.getBoundingClientRect().top,
        element.querySelector('.pass-header-time')!.getBoundingClientRect().top,
    ])
    expect(timeTop).toBeGreaterThan(dateTop)
    // The time uses the same colour as the identity label.
    const labelColor = await page
        .locator('.pass-identity-text')
        .evaluate((element) => getComputedStyle(element).color)
    await expect(time).toHaveCSS('color', labelColor)
    // The classic fallback has no time and keeps the 日期 label.
    await page.getByRole('switch', { name: '显示条码' }).uncheck()
    await expect(page.locator('.pass[data-layout="classic"]')).toBeVisible()
    await expect(page.locator('.pass-header-field .pass-label')).toHaveText(
        '日期',
    )
    await expect(page.locator('.pass-header-time')).toHaveCount(0)
})

test('keeps the barcode across both styles and exports it only when switched on', async ({
    page,
}) => {
    const bodies: Record<string, unknown>[] = []
    await page.addInitScript(() =>
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36',
        }),
    )
    await page.route('**/api/passes', async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            contentType: 'application/vnd.apple.pkpass',
            body: 'mock pass',
        })
    })
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('条码样式测试')
    await page.getByRole('switch', { name: '显示条码' }).check()
    await expect(page.getByLabel('条码格式')).toHaveValue('QR')
    await page
        .getByLabel('条码内容', { exact: true })
        .fill('ENCORE-E2E-NOT-VALID')
    await expect(page.locator('.pass-barcode-panel')).toBeVisible()
    await expect(page.locator('.pass-barcode-alt')).toHaveText('仅供展示')
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true)
    await page
        .getByRole('switch', { name: '将数据提供给第三方以生成票卡' })
        .click()
    const consentDialog = page.getByRole('dialog', {
        name: '发送数据并签发票卡？',
    })
    await expect(consentDialog).toBeVisible()
    await consentDialog
        .getByRole('button', { name: '同意', exact: true })
        .click()
    await expect(consentDialog).toHaveCount(0)
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', {
            name: /^(导出票卡数据|下载票卡|添加到 Apple 钱包)$/,
        })
        .click()
    await expect(page.getByText('请核对并确认条码内容')).toBeVisible()
    // The acknowledgement row keeps its visible switch track.
    await expect(
        page
            .locator('.row', { hasText: '我了解并明白' })
            .locator('.switch span'),
    ).toBeVisible()
    await page
        .getByLabel(
            '我了解并明白 EncorePass 生成的票卡仅用于展示和收藏，不是也不能作为活动的入场凭证',
            { exact: true },
        )
        .check()
    await page
        .getByRole('button', {
            name: /^(导出票卡数据|下载票卡|添加到 Apple 钱包)$/,
        })
        .click()
    await download
    expect(bodies[0].passStyle).toBe('eventTicket')
    expect(bodies[0].barcodeEnabled).toBe(true)
    expect(bodies[0].barcode).toEqual({
        format: 'QR',
        message: 'ENCORE-E2E-NOT-VALID',
        encoding: 'utf-8',
        userConfirmed: true,
    })
    // 通用凭证 keeps the same barcode and still exports it.
    await page.getByRole('button', { name: '通用凭证' }).click()
    await expect(page.locator('.pass-barcode-panel')).toBeVisible()
    const genericDownload = page.waitForEvent('download')
    await page
        .getByRole('button', {
            name: /^(导出票卡数据|下载票卡|添加到 Apple 钱包)$/,
        })
        .click()
    await genericDownload
    expect(bodies[1].passStyle).toBe('posterGeneric')
    expect(bodies[1].barcodeEnabled).toBe(true)
    expect(bodies[1].barcode).toMatchObject({
        message: 'ENCORE-E2E-NOT-VALID',
        userConfirmed: true,
    })
    // Switching off hides the panel and leaves the content for later.
    await page.getByRole('switch', { name: '显示条码' }).uncheck()
    await expect(page.locator('.pass-barcode-panel')).toHaveCount(0)
    const hiddenDownload = page.waitForEvent('download')
    await page
        .getByRole('button', {
            name: /^(导出票卡数据|下载票卡|添加到 Apple 钱包)$/,
        })
        .click()
    await hiddenDownload
    expect(bodies[2].barcodeEnabled).toBe(false)
    expect(bodies[2].barcode).toBeUndefined()
    await page.getByRole('switch', { name: '显示条码' }).check()
    await expect(page.getByLabel('条码内容', { exact: true })).toHaveValue(
        'ENCORE-E2E-NOT-VALID',
    )
})

test('defaults the venue timezone to the device zone with the full list', async ({
    page,
}) => {
    await page.goto('/')
    const timezone = page.getByLabel('场馆时区', { exact: true })
    const deviceZone = await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
    await expect(timezone).toHaveValue(deviceZone)
    expect(await timezone.locator('option').count()).toBeGreaterThan(100)
    await timezone.selectOption('Asia/Tokyo')
    await expect(timezone).toHaveValue('Asia/Tokyo')
})

test('edit, preview, validate export, restore and delete a private draft', async ({
    page,
}, testInfo) => {
    await page.goto('/')
    const name = page.getByRole('textbox', { name: '活动名称' })
    await name.fill('Encore Live · 合成测试')
    await expect(
        page.getByRole('heading', { name: 'Encore Live · 合成测试' }),
    ).toBeVisible()
    await page.getByLabel('场馆', { exact: true }).fill('示例音乐厅')
    await page.waitForTimeout(700)
    await page.reload()
    await expect(name).toHaveValue('Encore Live · 合成测试')
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', { name: '导出票卡数据', exact: true })
        .click()
    expect((await download).suggestedFilename()).toBe('ticket.encore.json')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
        path: testInfo.outputPath('editor.png'),
        fullPage: true,
    })
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true)
    await page.getByRole('button', { name: '清除所有数据' }).click()
    await page
        .getByRole('dialog', { name: '清除所有数据？' })
        .getByRole('button', { name: '清除所有数据' })
        .click()
    await expect(name).toHaveValue('')
    await page.reload()
    await expect(name).toHaveValue('')
    expect(await page.evaluate(() => localStorage.length)).toBe(0)
})
