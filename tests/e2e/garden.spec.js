import { expect, test } from '@playwright/test'
import { OrthographicCamera, Vector3 } from 'three'

async function openGarden(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  // Fullscreen WebGL shader compilation can be slow on CI software renderers.
  await expect(page.locator('#garden')).toHaveAttribute('data-ready', 'true', { timeout: 20000 })
  await expect(page.locator('canvas')).toBeVisible()
  return errors
}

async function projectPoint(page, x, y, z) {
  const box = await page.locator('canvas').boundingBox()
  const aspect = box.width / box.height
  const height = Math.max(8.9, 11.5 / aspect)
  const camera = new OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, 0.1, 80)
  camera.position.set(6, 9, 12)
  camera.lookAt(0, 0.3, 0)
  camera.updateMatrixWorld()
  const point = new Vector3(x, y, z).project(camera)
  return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 }
}

test('fills the viewport with only the scene and operation instructions', async ({ page }, testInfo) => {
  const errors = await openGarden(page)
  const canvas = page.locator('canvas')
  const instructions = page.locator('#play-instructions')
  await expect(canvas).toBeFocused()
  await expect(instructions).toBeVisible()
  await expect(page.locator('button, header, nav, footer')).toHaveCount(0)
  expect((await page.locator('body').innerText()).trim()).toBe((await instructions.innerText()).trim())
  await page.screenshot({ path: testInfo.outputPath('initial-scene.png'), fullPage: true })

  for (const viewport of [page.viewportSize(), { width: 320, height: 850 }, { width: 850, height: 320 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, ...viewport })
    expect(await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
      scrollX,
      scrollY,
    }))).toEqual({ horizontal: false, vertical: false, scrollX: 0, scrollY: 0 })
    await expect(instructions).toBeInViewport({ ratio: 1 })
  }
  await page.screenshot({ path: testInfo.outputPath('fullscreen-garden.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('follows the mouse and pecks the visible mushroom cap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Mouse following is a desktop interaction.')
  const errors = await openGarden(page)
  const garden = page.locator('#garden')
  const target = await projectPoint(page, 1.6, 0.87, 1.8)
  await page.mouse.move(target.x, target.y)
  await expect(garden).toHaveAttribute('data-mode', 'follow')
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await expect(garden).toHaveAttribute('data-moving', 'false', { timeout: 12000 })
  await page.mouse.click(target.x, target.y)
  await expect(garden).toHaveAttribute('data-pecks', '1')
  await expect(garden).toHaveAttribute('data-hits', '1')
  await page.screenshot({ path: testInfo.outputPath('mushroom-hit.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('keeps keyboard movement while aiming, releases on blur and supports reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = await openGarden(page)
  const garden = page.locator('#garden')
  const canvas = page.locator('canvas')
  const target = await projectPoint(page, -2, 0, -2)
  await page.keyboard.down('ArrowRight')
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await page.mouse.move(target.x, target.y)
  await expect(garden).toHaveAttribute('data-mode', 'keyboard')
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await page.keyboard.up('ArrowRight')
  await expect(garden).toHaveAttribute('data-moving', 'false')
  await page.mouse.move(target.x + 5, target.y)
  await expect(garden).toHaveAttribute('data-mode', 'follow')
  await expect(garden).toHaveAttribute('data-moving', 'true')

  // The mouse target can already be at the top edge; move away before testing blur.
  await page.keyboard.down('KeyS')
  await expect(garden).toHaveAttribute('data-mode', 'keyboard')
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await canvas.evaluate((element) => element.blur())
  await expect(garden).toHaveAttribute('data-moving', 'false')
  await page.keyboard.up('KeyS')
  await canvas.focus()
  await page.keyboard.press('Space')
  await expect(garden).toHaveAttribute('data-pecks', '1')
  await expect(garden).toHaveAttribute('data-pecking', 'false')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(errors).toEqual([])
})

test('touch dragging moves, tapping pecks, and ending or cancelling releases movement', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Exercise real touch events in the touch-enabled project.')
  const errors = await openGarden(page)
  const garden = page.locator('#garden')
  const cdp = await context.newCDPSession(page)
  const start = await projectPoint(page, -0.6, 0, 0.55)
  const destination = await projectPoint(page, 2.5, 0, 0.6)
  const touchPoint = (point) => [{ ...point, id: 1, radiusX: 2, radiusY: 2, force: 1 }]

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(start) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(destination) })
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(garden).toHaveAttribute('data-moving', 'false')
  await expect(garden).toHaveAttribute('data-pecks', '0')

  await page.touchscreen.tap(start.x, start.y)
  await expect(garden).toHaveAttribute('data-pecks', '1')
  await expect(garden).toHaveAttribute('data-pecking', 'false')
  const opposite = await projectPoint(page, -2, 0, -2)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoint(start) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoint(opposite) })
  await expect(garden).toHaveAttribute('data-moving', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect(garden).toHaveAttribute('data-moving', 'false')
  await expect(garden).toHaveAttribute('data-pecks', '1')
  await cdp.detach()
  expect(errors).toEqual([])
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
  await expect(page.locator('#garden')).toHaveAttribute('data-ready', 'false')
  await expect(page.locator('#play-instructions')).not.toBeVisible()
  await expect(page.locator('button')).toHaveCount(0)
})
