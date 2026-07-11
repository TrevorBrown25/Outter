import { test, expect } from '@playwright/test'

test('create outing → scorekeeper joins → group appears live in lobby', async ({ browser }) => {
  const organizer = await browser.newContext()
  const orgPage = await organizer.newPage()
  await orgPage.goto('/create')
  await orgPage.getByLabel('Course name').fill('E2E Links')
  await orgPage.getByRole('button', { name: '9 holes' }).click()
  await orgPage.getByRole('button', { name: 'Create outing' }).click()
  await orgPage.waitForURL(/\/outing\/.+\/lobby/)
  const shareCode = (await orgPage.locator('p.font-mono').textContent())!.trim()
  expect(shareCode).toMatch(/^[A-Z2-9]{6}$/)

  const scorekeeper = await browser.newContext()
  const skPage = await scorekeeper.newPage()
  await skPage.goto(`/join/${shareCode}`)
  await skPage.getByRole('link', { name: 'Keep score for my group' }).click()
  await skPage.getByPlaceholder('e.g. The Hackers').fill('The Hackers')
  await skPage.getByPlaceholder('Player 1').fill('Alice')
  await skPage.getByPlaceholder('Player 2').fill('Bob')
  await skPage.getByRole('button', { name: /We.re in/ }).click()
  await skPage.waitForURL(/\/outing\/.+\/watch/)

  await expect(orgPage.getByText('The Hackers')).toBeVisible({ timeout: 15_000 })
  await expect(orgPage.getByText('Alice, Bob')).toBeVisible()

  await organizer.close()
  await scorekeeper.close()
})
