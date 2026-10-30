import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const image = resolve('tests/fixtures/generated/ticket.png')

async function exportDraft(page: Page) {
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', { name: '导出票卡数据', exact: true })
        .click()
    const file = await download
    return JSON.parse(await readFile((await file.path())!, 'utf8'))
}

// The mobile sheet slides in; pointer drags need its final position.
async function settled(locator: Locator) {
    await locator.evaluate((element) =>
        Promise.all(
            element.getAnimations().map((animation) => animation.finished),
        ),
    )
}

test('selects a background region and reopens it for editing', async ({
    page,
}) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('裁切区域测试')
    await page.getByLabel('背景图片', { exact: true }).setInputFiles(image)
    const dialog = page.getByRole('dialog', {
        name: '选择背景图片区域',
        exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('343:503')).toBeVisible()
    await settled(dialog)
    // The fixture is landscape, so the portrait frame can only slide sideways.
    const frame = dialog.locator('.crop-frame')
    const box = (await frame.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 16, box.y + box.height / 2, {
        steps: 4,
    })
    await page.mouse.up()
    await dialog.getByRole('button', { name: '使用此区域' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByAltText('票卡背景')).toBeVisible()

    const adjust = page.getByRole('button', { name: '调整背景图片区域' })
    await adjust.click()
    const reopened = page.getByRole('dialog', {
        name: '选择背景图片区域',
        exact: true,
    })
    await expect(reopened).toBeVisible()
    await reopened.getByRole('button', { name: '取消', exact: true }).click()
    await expect(reopened).toHaveCount(0)
    await expect(adjust).toBeFocused()

    const draft = await exportDraft(page)
    expect(draft.appearance.backgroundDataUrl).toMatch(/^data:image\//)
    expect(draft.appearance.imageSources.background).toMatch(/^data:image\//)
    expect(draft.appearance.imageCrops.background.width).toBeCloseTo(
        343 / 503 / (1200 / 900),
        2,
    )
    expect(draft.appearance.imageCrops.background.x).toBeGreaterThan(0.25)
})

test('resets a free logo selection and clears its stored crop', async ({
    page,
}) => {
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('Logo 裁切测试')
    await page.getByLabel('Logo', { exact: true }).setInputFiles(image)
    const dialog = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await dialog.getByRole('button', { name: '使用此区域' }).click()
    await expect(dialog).toHaveCount(0)

    const adjust = page.getByRole('button', { name: '调整Logo区域' })
    await adjust.click()
    const editing = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await settled(editing)
    const handle = editing.locator('[data-handle="se"]')
    const corner = (await handle.boundingBox())!
    await page.mouse.move(
        corner.x + corner.width / 2,
        corner.y + corner.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
        corner.x + corner.width / 2 - 60,
        corner.y + corner.height / 2 - 60,
        { steps: 4 },
    )
    await page.mouse.up()
    await editing.getByRole('button', { name: '使用此区域' }).click()
    await expect(editing).toHaveCount(0)

    await adjust.click()
    const resetting = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await resetting.getByRole('button', { name: '重置' }).click()
    await resetting.getByRole('button', { name: '使用此区域' }).click()
    await expect(resetting).toHaveCount(0)

    const draft = await exportDraft(page)
    expect(draft.appearance.logoDataUrl).toMatch(/^data:image\//)
    // A full-image selection must retain the original, not a 200x150
    // intermediate that would destroy detail on the next crop.
    expect(draft.appearance.logoDataUrl).toBe(
        `data:image/png;base64,${(await readFile(image)).toString('base64')}`,
    )
    expect(draft.appearance.imageCrops).toBeUndefined()
    expect(draft.appearance.imageSources).toBeUndefined()
})

test('cancelling a replacement keeps the previous image', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Logo', { exact: true }).setInputFiles(image)
    const first = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await first.getByRole('button', { name: '使用此区域' }).click()
    await expect(first).toHaveCount(0)
    await expect(page.getByAltText('票卡 Logo')).toBeVisible()

    await page.getByLabel('Logo', { exact: true }).setInputFiles(image)
    const replacement = page.getByRole('dialog', {
        name: '选择Logo区域',
        exact: true,
    })
    await replacement.getByRole('button', { name: '取消', exact: true }).click()
    await expect(replacement).toHaveCount(0)
    await expect(page.getByAltText('票卡 Logo')).toBeVisible()
    await expect(
        page.getByRole('button', { name: '调整Logo区域' }),
    ).toBeVisible()
})

test('keeps crop sources out of the signing request', async ({ page }) => {
    const bodies: Record<string, unknown>[] = []
    await page.route('**/api/passes', async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            contentType: 'application/vnd.apple.pkpass',
            body: 'mock pass',
        })
    })
    await page.goto('/')
    await page.getByRole('textbox', { name: '活动名称' }).fill('裁切请求测试')
    await page.getByLabel('背景图片', { exact: true }).setInputFiles(image)
    const dialog = page.getByRole('dialog', {
        name: '选择背景图片区域',
        exact: true,
    })
    await dialog.getByRole('button', { name: '使用此区域' }).click()
    await expect(dialog).toHaveCount(0)

    await page
        .getByRole('switch', { name: '将数据提供给第三方以生成票卡' })
        .click()
    const consent = page.getByRole('dialog', {
        name: '发送数据并签发票卡？',
    })
    await consent.getByRole('button', { name: '同意', exact: true }).click()
    const download = page.waitForEvent('download')
    await page
        .getByRole('button', { name: /^(下载票卡|添加到 Apple 钱包)$/ })
        .click()
    await download

    const appearance = bodies[0].appearance as Record<string, unknown>
    expect(appearance.backgroundDataUrl).toMatch(/^data:image\//)
    expect(appearance.imageSources).toBeUndefined()
    expect(appearance.imageCrops).toBeUndefined()
})
