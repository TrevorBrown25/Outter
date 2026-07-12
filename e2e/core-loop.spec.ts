import { test, expect } from '@playwright/test'

test('create outing → scorekeeper joins → group appears live in lobby', async ({ browser }) => {
  const organizer = await browser.newContext()
  const orgPage = await organizer.newPage()
  await orgPage.goto('/create')
  await orgPage.getByRole('button', { name: 'Enter manually' }).click()
  await orgPage.getByLabel('Course name').fill('E2E Links')
  await orgPage.getByRole('button', { name: '9 holes' }).click()
  await orgPage.getByRole('button', { name: 'Create outing' }).click()
  await orgPage.waitForURL(/\/outing\/.+\/lobby/)
  const shareCode = (await orgPage.getByTestId('share-code').textContent())!.trim()
  expect(shareCode).toMatch(/^[A-Z2-9]{6}$/)

  const scorekeeper = await browser.newContext()
  const skPage = await scorekeeper.newPage()
  await skPage.goto(`/join/${shareCode}`)
  await skPage.getByRole('link', { name: 'Keep score for my group' }).click()
  await skPage.getByPlaceholder('e.g. The Hackers').fill('The Hackers')
  await skPage.getByPlaceholder('Player 1').fill('Alice')
  await skPage.getByPlaceholder('Player 2').fill('Bob')
  await skPage.getByRole('button', { name: /We.re in/ }).click()
  await skPage.waitForURL(/\/outing\/.+\/score/)

  await expect(orgPage.getByText('The Hackers')).toBeVisible({ timeout: 15_000 })
  await expect(orgPage.getByText('Alice, Bob')).toBeVisible()

  // scoring: open a spectator on the leaderboard BEFORE any score, to prove realtime delivery
  const outingId = await skPage.evaluate(() => location.pathname.split('/')[2])
  const spectator = await browser.newContext()
  const specPage = await spectator.newPage()
  await specPage.goto(`/outing/${outingId}/watch`)
  await expect(specPage.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()

  // scorekeeper enters an over-par score on hole 1 for the first player (par 4 -> 5 = +1)
  await skPage.getByRole('button', { name: /one more for/ }).first().click()

  // the spectator's leaderboard reflects it live
  await expect(specPage.getByText('+1')).toBeVisible({ timeout: 20_000 })

  await spectator.close()
  await organizer.close()
  await scorekeeper.close()
})
