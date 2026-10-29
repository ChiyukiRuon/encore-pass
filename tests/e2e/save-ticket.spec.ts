import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('exports incomplete metadata locally, imports it and clears pending saves', async ({
    page,
}, testInfo) => {
    let requests = 0
    page.on('request', (request) => {
        if (request.url().includes('/api/passes')) requests++
    })
    await page.goto('/')
    await page.getByLabel('场馆', { exact: true }).fill('跨设备继续编辑')
    await page
        .getByLabel('Logo', { exact: true })
        .setInputFiles(resolve('tests/fixtures/generated/ticket.png'))
    const cropDialog = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await cropDialog.getByRole('button', { name: '使用此区域' }).click()
    await expect(cropDialog).toHaveCount(0)
    await page.getByRole('switch', { name: '显示条码' }).check()
    await page.getByLabel('条码内容', { exact: true }).fill('UNCONFIRMED-LOCAL')
    await page.getByRole('switch', { name: '显示条码' }).uncheck()
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', { name: '导出票卡数据', exact: true })
        .click()
    const file = testInfo.outputPath('ticket.encore.json')
    await (await download).saveAs(file)
    const data = JSON.parse(await readFile(file, 'utf8'))
    expect(data.eventName).toBe('')
    expect(data.barcode.message).toBe('UNCONFIRMED-LOCAL')
    expect(data.barcodeEnabled).toBe(false)
    expect(data.appearance.logoDataUrl).toMatch(/^data:image\//)
    expect(requests).toBe(0)
    const name = page.getByRole('textbox', { name: '活动名称' })
    const clear = page.getByRole('button', { name: '清除所有数据' })
    const confirmDialog = page.getByRole('dialog', {
        name: '清除所有数据？',
    })
    await name.fill('即将清除')
    await clear.click()
    await expect(confirmDialog).toBeVisible()
    await confirmDialog
        .getByRole('button', { name: '取消', exact: true })
        .click()
    await expect(confirmDialog).toBeHidden()
    await expect(clear).toBeFocused()
    await expect(name).toHaveValue('即将清除')
    await clear.click()
    await page.keyboard.press('Escape')
    await expect(confirmDialog).toBeHidden()
    await expect(name).toHaveValue('即将清除')
    await clear.click()
    await confirmDialog.getByRole('button', { name: '清除所有数据' }).click()
    await expect(name).toHaveValue('')
    await page.waitForTimeout(700)
    const stored = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
            const request = indexedDB.open('encore-pass', 1)
            request.onsuccess = () => resolve(request.result)
        })
        return new Promise<number>((resolve) => {
            const request = db
                .transaction('drafts')
                .objectStore('drafts')
                .count()
            request.onsuccess = () => {
                db.close()
                resolve(request.result)
            }
        })
    })
    expect(stored).toBe(0)
    const importDialog = page.getByRole('dialog', {
        name: '替换当前内容？',
    })
    await page.getByLabel('导入票卡数据', { exact: true }).setInputFiles(file)
    await expect(importDialog).toBeVisible()
    await importDialog
        .getByRole('button', { name: '取消', exact: true })
        .click()
    await expect(importDialog).toBeHidden()
    await expect(page.getByLabel('场馆', { exact: true })).toHaveValue('')
    await page.getByLabel('导入票卡数据', { exact: true }).setInputFiles(file)
    await expect(importDialog).toBeVisible()
    await importDialog.getByRole('button', { name: '替换内容' }).click()
    await expect(page.getByLabel('场馆', { exact: true })).toHaveValue(
        '跨设备继续编辑',
    )
    await expect(page.getByAltText('票卡 Logo')).toBeVisible()
    await expect(
        page.getByRole('switch', { name: '将数据提供给第三方以生成票卡' }),
    ).not.toBeChecked()
    await page.waitForTimeout(700)
    await page.reload()
    await expect(page.getByLabel('场馆', { exact: true })).toHaveValue(
        '跨设备继续编辑',
    )
    await page.getByRole('switch', { name: '显示条码' }).check()
    await expect(page.getByLabel('条码内容', { exact: true })).toHaveValue(
        'UNCONFIRMED-LOCAL',
    )
    await page.getByLabel('导入票卡数据', { exact: true }).setInputFiles({
        name: 'invalid.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{}'),
    })
    await expect(page.getByRole('status')).toContainText('票卡数据格式无效')
    await expect(page.getByLabel('场馆', { exact: true })).toHaveValue(
        '跨设备继续编辑',
    )
    expect(requests).toBe(0)
    await page
        .getByRole('heading', { name: '保存你的票卡' })
        .scrollIntoViewIfNeeded()
    await page.screenshot({
        path: testInfo.outputPath('save-data.png'),
        fullPage: true,
    })
})

test('shows the supplied Wallet badge on Safari and opens the signed pass', async ({
    page,
}, testInfo) => {
    await page.addInitScript(() =>
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        }),
    )
    await page.route('**/api/passes', (route) =>
        route.fulfill({
            contentType: 'application/vnd.apple.pkpass',
            headers: {
                'x-wallet-download-url':
                    'https://walletmcppass.com/download/test-token',
            },
            body: 'mock signed pass',
        }),
    )
    await page.route('https://walletmcppass.com/download/test-token', (route) =>
        route.fulfill({ status: 204 }),
    )
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('钱包按钮测试')
    await expect(
        page.getByRole('button', { name: '导出票卡数据', exact: true }),
    ).toBeVisible()
    const consent = page.getByRole('switch', {
        name: '将数据提供给第三方以生成票卡',
    })
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
    const badge = page.getByRole('button', { name: '添加到 Apple 钱包' })
    await expect(badge).toBeVisible()
    await expect(badge.locator('img')).toHaveAttribute(
        'src',
        '/wallet/add-to-apple-wallet-cn.svg',
    )
    await page.screenshot({
        path: testInfo.outputPath('wallet-badge.png'),
        fullPage: true,
    })
    const request = page.waitForRequest(
        'https://walletmcppass.com/download/test-token',
    )
    await badge.click()
    await request
})

test('confirms before sending data to the third-party signer', async ({
    page,
}) => {
    await page.goto('/')
    await expect(page.getByText('导出的数据包含文字、图片和样式')).toHaveCount(
        0,
    )
    const consent = page.getByRole('switch', {
        name: '将数据提供给第三方以生成票卡',
    })
    const dialog = page.getByRole('dialog', {
        name: '发送数据并签发票卡？',
    })
    await consent.click()
    await expect(dialog).toBeVisible()
    await expect(consent).not.toBeChecked()
    // The sheet waits for a decision instead of timing out.
    await page.waitForTimeout(1_200)
    await expect(dialog).toBeVisible()
    // Dismissing leaves the switch off and returns focus to it.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(consent).not.toBeChecked()
    await expect(consent).toBeFocused()
    // Only the explicit agreement enables third-party signing.
    await consent.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '同意', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(consent).toBeChecked()
})

test('opens the detailed save guide and dismisses it like a system sheet', async ({
    page,
}) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: '关于' })
    const triggerLeft = await trigger.evaluate(
        (element) => element.getBoundingClientRect().left,
    )
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '关于' })
    await expect(dialog).toBeVisible()
    // Hiding the page scrollbar must not shift the layout.
    const openLeft = await trigger.evaluate(
        (element) => element.getBoundingClientRect().left,
    )
    expect(openLeft).toBeCloseTo(triggerLeft, 5)
    await expect(
        dialog.getByRole('heading', { name: '使用限制' }),
    ).toBeVisible()
    await expect(
        dialog.getByRole('heading', { name: '数据与隐私' }),
    ).toBeVisible()
    await expect(dialog.getByRole('link', { name: '第三方' })).toHaveAttribute(
        'href',
        'https://walletmcppass.com/',
    )
    await expect(dialog).toContainText('不能作为官方入场凭证')

    // iOS sheets dismiss on Escape, return focus to their trigger, and close
    // from the primary footer action or a backdrop tap.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.getByRole('button', { name: '完成', exact: true }).click()
    await expect(dialog).toBeHidden()
    await trigger.click()
    await page.mouse.click(8, 8)
    await expect(dialog).toBeHidden()
})
