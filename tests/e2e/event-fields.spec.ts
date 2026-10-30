import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('presets retain edits and custom fields survive reload', async ({
    page,
}, testInfo) => {
    await page.goto('/')
    await page.getByLabel('活动名称').fill('合成活动 · 夏日相会')
    await expect(page.getByLabel('填写预设')).toHaveValue('performance')
    await page
        .getByRole('textbox', { name: '艺人 / 演出者' })
        .fill('Synthetic Artist')
    await page.getByLabel('填写预设').selectOption('gathering')
    await expect(
        page.getByRole('textbox', { name: '艺人 / 演出者' }),
    ).toHaveCount(0)
    await expect(
        page.getByText('另有 1 项已填写但未启用', { exact: false }),
    ).toBeVisible()
    await page.getByLabel('主办方', { exact: true }).fill('Synthetic Organizer')
    await page.getByLabel('票种 / 权益等级', { exact: true }).fill('参会证')
    await page.getByRole('button', { name: '添加自定义文字项' }).click()
    await page.getByLabel('名称 1', { exact: true }).fill('集合地点')
    await page.getByLabel('内容 1', { exact: true }).fill('北广场')
    await page.getByText('票卡详情', { exact: true }).click()
    await expect(page.locator('.ticket-details')).toContainText('北广场')
    await expect(page.locator('.ticket-details')).not.toContainText(
        'Synthetic Artist',
    )
    await page.getByRole('button', { name: '调整填写项' }).click()
    await expect(page.getByLabel('内容 1', { exact: true })).toHaveValue(
        '北广场',
    )
    await page.getByRole('checkbox', { name: '交通指南', exact: true }).check()
    await expect(page.getByLabel('内容 1', { exact: true })).toHaveValue(
        '北广场',
    )
    await expect(page.getByLabel('填写预设')).toHaveValue('custom')
    await page.getByRole('button', { name: '调整填写项' }).click()
    await page
        .getByRole('textbox', { name: '交通指南', exact: true })
        .fill('https://example.com/transit')
    // IndexedDB is persisted after the editor's 400ms debounce.
    await expect(page.getByLabel('内容 1', { exact: true })).toHaveValue(
        '北广场',
    )
    await expect
        .poll(() =>
            page.evaluate(async () => {
                const db = await new Promise<IDBDatabase>((resolve, reject) => {
                    const request = indexedDB.open('encore-pass', 1)
                    request.onsuccess = () => resolve(request.result)
                    request.onerror = () => reject(request.error)
                })
                return new Promise<string | undefined>((resolve) => {
                    const request = db
                        .transaction('drafts')
                        .objectStore('drafts')
                        .get('current')
                    request.onsuccess = () => {
                        db.close()
                        resolve(request.result?.customFields?.[0]?.value)
                    }
                })
            }),
        )
        .toBe('北广场')
    await page.reload()
    await expect(page.getByLabel('填写预设')).toHaveValue('custom')
    await expect(page.getByLabel('内容 1', { exact: true })).toHaveValue(
        '北广场',
    )
    await page.getByLabel('填写预设').selectOption('performance')
    await expect(
        page.getByRole('textbox', { name: '艺人 / 演出者' }),
    ).toHaveValue('Synthetic Artist')
    await page.getByLabel('填写预设').selectOption('sports')
    await page.getByLabel('主队名称').fill('Synthetic Home')
    await page.getByLabel('客队名称').fill('Synthetic Away')
    await expect(
        page.getByRole('textbox', { name: '主办方', exact: true }),
    ).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
        path: testInfo.outputPath('event-presets.png'),
        fullPage: true,
    })
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({
        path: testInfo.outputPath('event-presets-dark.png'),
        fullPage: true,
    })
})

test('keeps disabled fields in JSON round trips but removes them before signing', async ({
    page,
}, testInfo) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/passes', async (route) => {
        requests.push(route.request().postDataJSON())
        await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: '合成签名测试完成' } }),
        })
    })
    await page.goto('/')
    await page.getByLabel('活动名称').fill('Synthetic Private Fields')
    await page
        .getByRole('textbox', { name: '艺人 / 演出者', exact: true })
        .fill('PRIVATE-ARTIST')
    await page.getByLabel('填写预设').selectOption('gathering')
    await page
        .getByRole('textbox', { name: '主办方', exact: true })
        .fill('PUBLIC-ORGANIZER')
    await page.getByRole('button', { name: '添加自定义文字项' }).click()
    await page.getByLabel('名称 1', { exact: true }).fill('Private note')
    await page.getByLabel('内容 1', { exact: true }).fill('PRIVATE-CUSTOM')
    await page
        .getByRole('switch', { name: '启用文字项 1', exact: true })
        .uncheck()
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', { name: '导出票卡数据', exact: true })
        .click()
    const path = testInfo.outputPath('event-fields.encore.json')
    await (await download).saveAs(path)
    const stored = JSON.parse(await readFile(path, 'utf8'))
    expect(stored.performer).toBe('PRIVATE-ARTIST')
    expect(stored.customFields[0].value).toBe('PRIVATE-CUSTOM')
    expect(requests).toHaveLength(0)
    await page.getByLabel('导入票卡数据', { exact: true }).setInputFiles(path)
    const replacement = page.getByRole('dialog', { name: '替换当前内容？' })
    await replacement
        .getByRole('button', { name: '替换内容', exact: true })
        .click()
    await expect(replacement).toBeHidden()
    await expect(
        page.getByRole('switch', { name: '启用文字项 1', exact: true }),
    ).not.toBeChecked()
    await page
        .getByRole('switch', { name: '将数据提供给第三方以生成票卡' })
        .click()
    await page
        .getByRole('dialog', { name: '发送数据并签发票卡？' })
        .getByRole('button', { name: '同意', exact: true })
        .click()
    await page
        .getByRole('button', { name: /^(下载票卡|添加到 Apple 钱包)$/ })
        .click()
    await expect(
        page.getByText('合成签名测试完成', { exact: true }),
    ).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0])).toContain('PUBLIC-ORGANIZER')
    expect(JSON.stringify(requests[0])).not.toContain('PRIVATE-ARTIST')
    expect(JSON.stringify(requests[0])).not.toContain('PRIVATE-CUSTOM')
})
