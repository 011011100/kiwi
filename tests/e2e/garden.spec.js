import { expect, test } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

async function openGarden(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '重新开始' })).toBeEnabled()
  await expect(page.locator('canvas')).toBeVisible()
  return errors
}

async function projectPoint(page, x, y, z) {
  const box = await page.locator('canvas').boundingBox()
  const aspect = box.width / box.height
  const height = aspect < 1 ? 11.7 : 8.9
  const camera = new OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, 0.1, 80)
  camera.position.set(6, 9, 12)
  camera.lookAt(0, 0.3, 0)
  camera.updateMatrixWorld()
  const point = new Vector3(x, y, z).project(camera)
  return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 }
}

test('renders the garden and supports movement, pecking and reset', async ({ page }) => {
  const errors = await openGarden(page)
  await page.getByRole('button', { name: '键盘漫游' }).click()
  const canvas = page.locator('canvas')
  await expect(canvas).toBeFocused()
  const scrollY = await page.evaluate(() => window.scrollY)
  await page.keyboard.down('ArrowRight')
  await expect(page.locator('.live-status')).toContainText('迈着小碎步')
  await page.keyboard.up('ArrowRight')
  await expect(page.locator('.live-status')).toContainText('正在东张西望')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  await page.keyboard.press('Space')
  await expect(page.locator('.counter-value').first()).toHaveText('01')
  await page.getByRole('button', { name: '重新开始' }).click()
  await expect(page.locator('.counter-value').first()).toHaveText('00')
  await expect(page.locator('.counter-value').nth(1)).toHaveText('00')
  expect(errors).toEqual([])
})

test('follows the mouse and hits the visible mushroom cap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Touch users use the direction pad.')
  const errors = await openGarden(page)
  const target = await projectPoint(page, 1.6, 0.87, 1.8)
  await page.mouse.move(target.x, target.y)
  await expect(page.locator('.live-status')).toContainText('迈着小碎步')
  await expect(page.locator('.live-status')).toContainText('正在东张西望', { timeout: 12000 })
  await page.mouse.click(target.x, target.y)
  await expect(page.locator('.counter-value').nth(1)).toHaveText('01')
  await page.screenshot({ path: testInfo.outputPath('mushroom-hit.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('direction buttons release on pointer cancellation and work with reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = await openGarden(page)
  const direction = page.getByRole('button', { name: '向左走', exact: true })
  await direction.scrollIntoViewIfNeeded()
  const box = await direction.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.locator('.live-status')).toContainText('迈着小碎步')
  await direction.dispatchEvent('pointercancel', { pointerId: 1 })
  await page.mouse.up()
  await expect(page.locator('.live-status')).toContainText('正在东张西望')
  await page.getByRole('button', { name: /啄！/  }).click()
  await expect(page.locator('.counter-value').first()).toHaveText('01')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('garden.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('keyboard releases on blur and a 320px viewport does not overflow', async ({ page }) => {
  await openGarden(page)
  await page.getByRole('button', { name: '键盘漫游' }).click()
  await page.keyboard.down('KeyW')
  await expect(page.locator('.live-status')).toContainText('迈着小碎步')
  await page.getByRole('link', { name: '源码', exact: true }).focus()
  await expect(page.locator('.live-status')).toContainText('正在东张西望')
  await page.keyboard.up('KeyW')
  await page.setViewportSize({ width: 320, height: 850 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('shows a useful fallback when WebGL cannot initialize', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === 'webgl2') return null
      return original.call(this, kind, ...args)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('硬件加速')
  await expect(page.getByRole('button', { name: '键盘漫游' })).toBeDisabled()
})
