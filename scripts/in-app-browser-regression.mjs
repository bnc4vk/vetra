import { BROWSER_DEMO_JOURNEYS } from '../shared/browser-demo-journeys.mjs'
import { DEMO_REWARDS_PROGRAMS } from '../src/demoRewardsPrograms.js'

const PHASE_TIMEOUT = 12_000
const AWARDWALLET_PROGRAM_IDS = ['amex', 'citi', 'alaska', 'jetblue', 'southwest']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function one(tab, locator, label) {
  const count = await locator.count()
  assert(count === 1, `${label} resolved to ${count} elements; expected exactly one.`)
  return locator
}

async function observe(tab) {
  return tab.playwright.domSnapshot()
}

async function waitForPhase(tab, phase, timeoutMs = PHASE_TIMEOUT) {
  const app = tab.playwright.getByTestId('vetra-app')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await app.count() === 1 && await app.getAttribute('data-phase') === phase) return app
    await tab.playwright.waitForTimeout(200)
  }
  const actual = await app.count() === 1 ? await app.getAttribute('data-phase') : 'missing'
  throw new Error(`Timed out waiting for phase ${phase}; current phase is ${actual}.`)
}

async function click(tab, locator, label) {
  await observe(tab)
  await one(tab, locator, label)
  await locator.click()
}

async function typeAndPress(tab, locator, value, key = 'Enter') {
  await observe(tab)
  await one(tab, locator, `Input for "${value}"`)
  await locator.click()
  await locator.type(value)
  await locator.press(key)
}

async function visibleText(locator) {
  return String(await locator.innerText()).replace(/\s+/g, ' ').trim()
}

async function waitForVisibleText(tab, locator, expected, timeoutMs = PHASE_TIMEOUT) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await locator.count() === 1) {
      const text = await visibleText(locator)
      if (text.toLowerCase().includes(expected.toLowerCase())) return text
    }
    await tab.playwright.waitForTimeout(200)
  }
  throw new Error(`Timed out waiting for visible text "${expected}".`)
}

async function waitForLocatorState(tab, locator, state, timeoutMs = PHASE_TIMEOUT) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = await locator.count()
    const visible = count === 1 && await locator.isVisible()
    if ((state === 'visible' && visible) || (state === 'hidden' && !visible)) return
    await tab.playwright.waitForTimeout(200)
  }
  throw new Error(`Timed out waiting for locator to become ${state}.`)
}

async function assertStep3TopAlignment(tab, phase) {
  await tab.playwright.waitForTimeout(phase === 'followup' ? 850 : 500)
  const alignment = await tab.playwright.evaluate(() => {
    const cue = document.querySelector('.journey-question')?.getBoundingClientRect()
    const itinerary = document.querySelector('.journey-summary')?.getBoundingClientRect()
    return Math.abs((cue?.top || 0) - (itinerary?.top || 0))
  })
  assert(alignment <= 2, `${phase} cue and itinerary were misaligned by ${alignment}px.`)
}

async function validateIntro(tab) {
  await waitForPhase(tab, 'welcome')
  await observe(tab)
  await one(tab, tab.playwright.getByText('Welcome to Vetra, the intelligent flights agent personalized to your travel style and award balances.', { exact: true }), 'Welcome message')
  assert(await tab.playwright.locator('.prototype-note').count() === 0, 'A visible demo qualification remained in the product shell.')
  const welcomeWords = tab.playwright.locator('[data-phase="welcome"] .word-reveal > span')
  const wordCount = await welcomeWords.count()
  assert(wordCount >= 10, `Welcome reveal exposed only ${wordCount} word spans.`)
  const welcomeMain = tab.playwright.locator('main.intro--welcome')
  await click(tab, welcomeMain, 'Welcome surface')
  const instantWelcome = tab.playwright.locator('[data-phase="welcome"] .word-reveal--instant')
  await one(tab, instantWelcome, 'Completed welcome reveal')
  await observe(tab)
  const body = tab.playwright.locator('body')
  await one(tab, body, 'Document body before keyboard advance')
  await body.press('Enter')

  await waitForPhase(tab, 'prompt')
  await one(tab, tab.playwright.getByText('You tell me where you need to be. I’ll get started on the trip planning.', { exact: true }), 'Planning prompt')
  const promptMain = tab.playwright.locator('main.intro--prompt')
  await click(tab, promptMain, 'Prompt surface')
  await one(tab, tab.playwright.locator('[data-phase="prompt"] .word-reveal--instant'), 'Completed prompt reveal')
  await observe(tab)
  await one(tab, body, 'Document body before prompt keyboard advance')
  await body.press('Enter')
  await waitForPhase(tab, 'intake')
}

async function submitTripAndResolveFollowUps(tab, journey) {
  const tripInput = tab.playwright.getByLabel('Trip details', { exact: true })
  await typeAndPress(tab, tripInput, journey.brief)
  await waitForPhase(tab, 'building')
  await assertStep3TopAlignment(tab, 'building')
  const heightMotion = await tab.playwright.evaluate(() => (
    ['.journey-conversation', '.journey-summary'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector))
      return { property: style.transitionProperty, duration: Number.parseFloat(style.transitionDuration) }
    })
  ))
  assert(heightMotion.every((motion) => motion.property.includes('height') && motion.duration >= 0.8), 'Multi-leg workspace height changes were not smoothly synchronized.')
  const buildingHeading = tab.playwright.getByText('I’m building a preliminary itinerary.', { exact: true })
  await one(tab, buildingHeading, 'Building phase heading')
  await one(tab, tab.playwright.getByText('Building', { exact: true }), 'Building status tile')
  assert(await tab.playwright.getByText('Building your trip', { exact: true }).count() === 0, 'Removed building label was still visible.')
  assert(await tab.playwright.getByText('Mapping your route into complete flight legs', { exact: true }).count() === 0, 'Removed route-mapping support copy was still visible.')

  const nextPhase = journey.followUps.length ? 'followup' : 'adjust'
  await waitForPhase(tab, nextPhase)
  for (const followUp of journey.followUps) {
    await assertStep3TopAlignment(tab, 'followup')
    const question = tab.playwright.getByText(followUp.question, { exact: true })
    await one(tab, question, `Follow-up question "${followUp.question}"`)
    await one(tab, tab.playwright.getByText('Collecting details', { exact: true }), 'Collecting-details status tile')
    const followUpInput = tab.playwright.getByLabel('Trip details', { exact: true })
    if (followUp.question.includes('South Korea')) {
      assert(await followUpInput.getAttribute('placeholder') === 'For example, Seoul…', 'City follow-up did not provide the contextual Seoul example.')
    }
    await typeAndPress(tab, followUpInput, followUp.answer)
    await waitForPhase(tab, 'adjust')
  }
}

async function summaryText(tab) {
  const summary = tab.playwright.locator('.journey-summary')
  await one(tab, summary, 'Itinerary summary')
  return visibleText(summary)
}

async function applyAdjustments(tab, journey) {
  const adjustmentInput = tab.playwright.getByLabel('Itinerary changes', { exact: true })
  await waitForLocatorState(tab, adjustmentInput, 'visible')
  await one(tab, tab.playwright.getByText('Any changes before I generate your personalized flight paths?', { exact: true }), 'Initial review question')
  await assertStep3TopAlignment(tab, 'review')
  await one(tab, tab.playwright.getByText('Review', { exact: true }), 'Review status tile')
  assert((await adjustmentInput.getAttribute('placeholder')).startsWith('For example,'), 'Finalization input did not provide a contextual example.')
  assert(await tab.playwright.getByText('Final check', { exact: true }).count() === 0, 'Removed final-check label was still visible.')
  const before = await summaryText(tab)
  assert(before.includes(journey.expectedRoute.split(' → ')[0]), 'Initial itinerary summary did not match the submitted trip.')

  for (const request of journey.adjustments) {
    await typeAndPress(tab, adjustmentInput, request)
    const updatedCue = tab.playwright.getByText('Itinerary updated.', { exact: true })
    await waitForLocatorState(tab, updatedCue, 'visible')
    await waitForLocatorState(tab, adjustmentInput, 'visible')
    await one(tab, tab.playwright.getByText('Any more changes before I generate your personalized flight paths?', { exact: true }), 'Subsequent review question')
    const updated = await summaryText(tab)
    if (request.startsWith('Upgrade')) assert(updated.includes('Business class'), 'Cabin adjustment was not reflected in the itinerary.')
    if (request.startsWith('Move')) assert(updated.includes('September 22, 2026'), 'Date adjustment was not reflected in the itinerary.')
    if (request.startsWith('Add')) assert(updated.includes('Honolulu'), 'Inserted Honolulu stop was not reflected in the itinerary.')
    if (request.startsWith('Remove')) assert(!updated.includes('Honolulu'), 'Removed Honolulu stop remained in the itinerary.')
  }

  const looksGood = tab.playwright.getByRole('button', { name: 'Looks good' })
  await click(tab, looksGood, 'Looks good button')
  await waitForPhase(tab, 'rewards')
}

async function connectProgram(tab, programName) {
  const program = DEMO_REWARDS_PROGRAMS.find((entry) => entry.name === programName)
  assert(program, `Unknown demo rewards program: ${programName}`)

  let tile = tab.playwright.locator(`[data-program-id="${program.id}"]`)
  if (await tile.count() === 1) {
    await click(tab, tile, `${programName} program tile`)
  } else {
    const search = tab.playwright.getByRole('button', { name: 'Search for another rewards program' })
    await click(tab, search, 'Program search tile')
    const searchInput = tab.playwright.getByLabel('Search rewards programs', { exact: true })
    await typeAndPress(tab, searchInput, programName, 'ArrowDown')
    const result = tab.playwright.locator('.program-search-result').filter({ hasText: programName })
    await click(tab, result, `${programName} search result`)
  }

  const username = tab.playwright.getByLabel('Username or email', { exact: true })
  await typeAndPress(tab, username, `browser-${program.id}@example.test`, 'Tab')
  const password = tab.playwright.getByLabel('Password', { exact: true })
  await typeAndPress(tab, password, 'not-a-real-password', 'Tab')
  const signIn = tab.playwright.locator('.connection-submit')
  assert(await visibleText(signIn) === 'Sign in', `${programName} sign-in action did not use sentence case.`)
  await click(tab, signIn, `${programName} demo sign-in`)
  const success = tab.playwright.getByText(`${programName} is connected`, { exact: true })
  await waitForLocatorState(tab, success, 'visible')
  assert(await tab.playwright.getByText('Returning to your trip…', { exact: true }).count() === 0, 'Connection success retained the removed return message.')
  await waitForLocatorState(tab, success, 'hidden')
  tile = tab.playwright.locator(`[data-program-id="${program.id}"]`)
  if (await tile.count() !== 1) {
    const search = tab.playwright.getByRole('button', { name: 'Search for another rewards program' })
    await click(tab, search, 'Program search tile after connection')
    const searchInput = tab.playwright.getByLabel('Search rewards programs', { exact: true })
    await typeAndPress(tab, searchInput, programName, 'ArrowDown')
    tile = tab.playwright.locator('.program-search-result').filter({ hasText: programName })
  }
  await one(tab, tile, `${programName} tile after connection`)
  const pressed = await tile.getAttribute('aria-pressed')
  assert(pressed === 'true', `${programName} was not marked linked after the connection flow.`)
  const connectedDetail = tile.locator('.program-copy small')
  await one(tab, connectedDetail, `${programName} connected balance and status`)
  assert(
    (await visibleText(connectedDetail)).includes(`${new Intl.NumberFormat('en-US').format(program.balance)} points ·`),
    `${programName} did not display both its points balance and mocked account status.`,
  )
  if (await tab.playwright.getByRole('button', { name: 'Close program search' }).count() === 1) {
    const close = tab.playwright.getByRole('button', { name: 'Close program search' })
    await click(tab, close, 'Close program search button')
  }
  if (await tab.playwright.locator(`[data-program-id="${program.id}"]`).count() === 1) {
    tile = tab.playwright.locator(`[data-program-id="${program.id}"]`)
    await tab.playwright.waitForTimeout(1400)
    const stableState = await tile.evaluate((element) => ({
      visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
      opacity: getComputedStyle(element).opacity,
    }))
    assert(stableState.visible && stableState.opacity === '1', `${programName} briefly disappeared after its confirmation animation.`)
  }
  return { program, tile }
}

async function validateGoogleNavigationCue(tab) {
  const tile = tab.playwright.locator('[data-program-id="bilt"]')
  await click(tab, tile, 'Bilt program tile for Google navigation preview')
  const google = tab.playwright.locator('.connection-login .google-signin-fallback--static')
  await click(tab, google, 'Initial Sign in with Google button')
  await one(tab, tab.playwright.getByText('Taking you to Bilt', { exact: true }), 'Google navigation cue')
  await one(tab, tab.playwright.locator('.connection-navigation-cue .navigation-progress'), 'Google navigation progress cue')
  await waitForLocatorState(tab, tab.playwright.locator('.provider-login-card'), 'visible')
  await one(tab, tab.playwright.locator('.provider-login-card').getByText('Sign in with Google', { exact: true }), 'Provider Google sign-in action')
  await click(tab, tab.playwright.getByRole('button', { name: 'Close Bilt sign-in' }), 'Close Bilt Google flow')
}

async function validateAwardWalletSync(tab) {
  const awardWallet = tab.playwright.getByRole('button', { name: 'Connect AwardWallet' })
  await click(tab, awardWallet, 'AwardWallet connector tile')
  const username = tab.playwright.getByLabel('Username or email', { exact: true })
  await typeAndPress(tab, username, 'browser-awardwallet@example.test', 'Tab')
  const password = tab.playwright.getByLabel('Password', { exact: true })
  await typeAndPress(tab, password, 'not-a-real-password', 'Tab')
  await click(tab, tab.playwright.locator('.connection-submit'), 'AwardWallet demo sign-in')
  const success = tab.playwright.getByText('AwardWallet is connected', { exact: true })
  await waitForLocatorState(tab, success, 'visible')
  await one(tab, tab.playwright.locator('.connection-success').getByText('5 programs connected', { exact: true }), 'AwardWallet synced-program count')
  await waitForLocatorState(tab, success, 'hidden')

  const syncState = await tab.playwright.evaluate((programIds) => ({
    linkedIds: programIds.filter((programId) => document.querySelector(`[data-program-id="${programId}"]`)?.getAttribute('aria-pressed') === 'true'),
    awardWalletText: document.querySelector('[data-program-id="awardwallet"] .program-copy small')?.textContent.trim(),
    awardWalletAction: getComputedStyle(document.querySelector('[data-program-id="awardwallet"] .program-action')).backgroundColor,
    standardAction: getComputedStyle(document.querySelector('[data-program-id="amex"] .program-action')).backgroundColor,
  }), AWARDWALLET_PROGRAM_IDS)
  assert(syncState.linkedIds.length === 5, `AwardWallet linked ${syncState.linkedIds.length} displayed programs instead of 5.`)
  assert(syncState.awardWalletText === '5 programs connected', 'AwardWallet tile did not use the compact synced-program count.')
  assert(syncState.awardWalletAction === syncState.standardAction, 'AwardWallet did not inherit the standard linked check styling.')

  const disconnect = tab.playwright.getByRole('button', { name: 'Disconnect AwardWallet, 5 programs connected' })
  await click(tab, disconnect, 'AwardWallet disconnect tile')
  const remainingAwardWalletLinks = await tab.playwright.evaluate((programIds) => (
    programIds.filter((programId) => document.querySelector(`[data-program-id="${programId}"]`)?.getAttribute('aria-pressed') === 'true')
  ), AWARDWALLET_PROGRAM_IDS)
  assert(remainingAwardWalletLinks.length === 0, 'AwardWallet-imported programs remained linked after disconnecting the connector.')
}

async function validateRewards(tab, journey) {
  await one(tab, tab.playwright.getByText('One last step: connect your airline and card rewards programs.', { exact: true }), 'Rewards heading')
  const colonPause = await tab.playwright.evaluate(() => {
    const words = [...document.querySelectorAll('.journey-question .word-reveal > span')]
      .map((word) => ({ text: word.textContent.trim(), delay: Number.parseFloat(word.style.getPropertyValue('--word-delay')) }))
    const colonIndex = words.findIndex((word) => word.text.endsWith(':'))
    return colonIndex >= 0 ? words[colonIndex + 1].delay - words[colonIndex].delay : 0
  })
  assert(colonPause >= 300, `Rewards heading colon pause was only ${colonPause}ms.`)
  assert(await tab.playwright.locator('.rewards-subheader').count() === 0, 'Rewards phase retained the removed subheader.')
  assert(await tab.playwright.locator('.rewards-preparing').count() === 0, 'Rewards phase rendered the removed preparation indicator.')
  const programGrid = tab.playwright.locator('.program-grid')
  assert(await programGrid.count() === 0, 'Rewards tiles mounted before the heading finished revealing.')
  await waitForLocatorState(tab, programGrid, 'visible')
  const rewardTiles = programGrid.locator('.program-tile')
  assert(await rewardTiles.count() === 14, 'Rewards grid did not retain seven balanced rows.')
  await one(tab, tab.playwright.getByRole('button', { name: 'Connect AwardWallet' }), 'AwardWallet connector tile')
  const finalRowLabels = await tab.playwright.evaluate(() => (
    [...document.querySelectorAll('.program-grid .program-tile')].slice(-2).map((tile) => tile.getAttribute('aria-label'))
  ))
  assert(finalRowLabels.join('|') === 'Connect AwardWallet|Search for another rewards program', 'AwardWallet and program search were not in the intended penultimate/final positions.')
  assert(await tab.playwright.locator('[data-program-id="jetblue"]').count() === 1, 'JetBlue was not present in the default program grid.')
  assert(await tab.playwright.locator('[data-program-id="flyingblue"]').count() === 0, 'Flying Blue remained in the default grid instead of moving to search.')
  const done = tab.playwright.getByRole('button', { name: 'Done' })
  assert(await done.count() === 0, 'Done appeared before every rewards tile row finished revealing.')
  const tileDelays = await tab.playwright.evaluate(() => (
    [...document.querySelectorAll('.program-grid .program-tile')].map((tile) => tile.style.getPropertyValue('--tile-delay'))
  ))
  assert(tileDelays.every((delay, index) => delay === `${Math.floor(index / 2) * 300}ms`), 'Rewards tiles did not reveal progressively at the intended row cadence.')
  await waitForLocatorState(tab, done, 'visible')
  const rewardsSpacing = await tab.playwright.evaluate(() => {
    const heading = document.querySelector('.journey-question--rewards')?.getBoundingClientRect()
    const firstTile = document.querySelector('.program-grid .program-tile')?.getBoundingClientRect()
    return Math.round((firstTile?.top || 0) - (heading?.bottom || 0))
  })
  assert(rewardsSpacing === 16, `Settled rewards heading-to-tiles spacing was ${rewardsSpacing}px instead of 16px.`)
  const doneTop = await done.evaluate((element) => element.getBoundingClientRect().top)
  await tab.playwright.waitForTimeout(350)
  const settledDoneTop = await done.evaluate((element) => element.getBoundingClientRect().top)
  assert(Math.abs(doneTop - settledDoneTop) <= 1, 'Done moved after appearing below the final rewards row.')
  const featuredOrder = await tab.playwright.evaluate(() => (
    [...document.querySelectorAll('.program-grid [data-program-id]')]
      .slice(0, 4)
      .map((element) => element.getAttribute('data-program-id'))
  ))
  assert(featuredOrder.join('|') === 'amex|chase|capitalone|citi', 'Featured rewards order changed.')

  if (journey.id === 'tokyo-seoul') await validateGoogleNavigationCue(tab)

  if (journey.id === 'tokyo-seoul') await validateAwardWalletSync(tab)

  for (const programName of journey.linkedPrograms) {
    const connected = await connectProgram(tab, programName)
    if (journey.id === 'ambient-fallback') {
      await click(tab, connected.tile, `${programName} disconnect tile`)
      assert(await connected.tile.getAttribute('aria-pressed') === 'false', `${programName} did not disconnect.`)
      await connectProgram(tab, programName)
    }
  }

  const app = tab.playwright.getByTestId('vetra-app')
  assert(await app.getAttribute('data-recommendation-count') === '0', 'Recommendations were generated before the optimization phase.')

  await click(tab, done, 'Rewards Done button')
  await waitForPhase(tab, 'optimizing')
}

async function validateOptimizationAndResults(tab, journey) {
  const expectedLegCount = journey.expectedRoute.split(' → ').length - 1
  const linkedProgramIds = journey.linkedPrograms.map((name) => (
    DEMO_REWARDS_PROGRAMS.find((program) => program.name === name).id
  ))
  const globe = tab.playwright.getByTestId('flight-globe')
  await waitForLocatorState(tab, globe, 'visible')
  const app = tab.playwright.getByTestId('vetra-app')
  const generationDeadline = Date.now() + PHASE_TIMEOUT
  while (Date.now() < generationDeadline && await app.getAttribute('data-recommendation-count') !== '3') {
    await tab.playwright.waitForTimeout(100)
  }
  assert(await app.getAttribute('data-recommendation-count') === '3', 'Optimization did not generate three stored recommendations.')
  assert(await globe.getAttribute('data-mode') === journey.expectedGlobeMode, `${journey.id} used the wrong globe mode.`)
  const stages = tab.playwright.locator('.optimization-list > div')
  assert(await stages.count() === 4, 'Optimization screen did not render all four stages.')
  const optimizationList = tab.playwright.locator('.optimization-list')
  await one(tab, optimizationList, 'Optimization stage list')
  await waitForVisibleText(tab, optimizationList, `${journey.linkedPrograms.length} connected program`)
  await waitForVisibleText(tab, optimizationList, `${expectedLegCount} confirmed flight leg`)
  await waitForVisibleText(tab, optimizationList, `${expectedLegCount * 3} flight leg quote`)
  await waitForVisibleText(tab, optimizationList, '3 candidate itineraries ranked')
  const finalStage = stages.nth(3)
  assert(await finalStage.getAttribute('class') === 'active', 'The fourth optimization check completed before the flight path.')
  assert(await finalStage.locator('.stage-dot i').count() === 1, 'The fourth optimization check stopped animating before the flight path completed.')
  assert(!(await visibleText(optimizationList)).includes('modeled'), 'Optimization exposed internal modeled-data language.')

  await waitForPhase(tab, 'results', 25_000)
  await one(tab, tab.playwright.getByText('Three strong ways to make this trip work.', { exact: true }), 'Results heading')
  await one(tab, tab.playwright.getByText(journey.expectedRoute, { exact: true }), 'Finalized itinerary route')
  const linkedTotal = journey.linkedPrograms.reduce((total, name) => (
    total + DEMO_REWARDS_PROGRAMS.find((program) => program.name === name).balance
  ), 0)
  const fundingCopy = journey.linkedPrograms.length
    ? `${new Intl.NumberFormat('en-US').format(linkedTotal)} points across connected rewards programs were considered.`
    : 'No rewards programs were connected, so cash fares are shown.'
  await one(tab, tab.playwright.getByText(fundingCopy, { exact: true }), 'Results rewards summary')
  const resultFunding = await tab.playwright.evaluate(() => (
    [...document.querySelectorAll('.result-card')].map((card) => ({
      mode: card.getAttribute('data-funding-mode'),
      programIds: card.getAttribute('data-program-ids').split(',').filter(Boolean),
    }))
  ))
  assert(resultFunding.length === 3, 'Results did not expose three funding plans.')
  resultFunding.forEach((funding, index) => {
    if (!linkedProgramIds.length) {
      assert(funding.mode === 'cash' && funding.programIds.join() === 'cash', `Result ${index + 1} did not use the cash fallback.`)
      return
    }
    assert(funding.mode === 'points', `Result ${index + 1} did not retain points funding.`)
    assert(funding.programIds.every((id) => linkedProgramIds.includes(id)), `Result ${index + 1} referenced an unlinked rewards program.`)
    assert(linkedProgramIds.every((id) => funding.programIds.includes(id)), `Result ${index + 1} omitted a linked rewards program.`)
  })
  for (let index = 1; index <= 3; index += 1) {
    const result = tab.playwright.getByTestId(`result-summary-${index}`)
    await one(tab, result, `Result summary ${index}`)
    if (await result.getAttribute('aria-expanded') !== 'true') {
      await click(tab, result, `Result summary ${index}`)
    }
    assert(await result.getAttribute('aria-expanded') === 'true', `Result ${index} did not expand.`)
    const expandedCard = tab.playwright.locator('.result-card.expanded')
    await one(tab, expandedCard, `Expanded result card ${index}`)
    const detail = await waitForVisibleText(tab, expandedCard, 'Rationale')
    const legPricing = await tab.playwright.evaluate(() => (
      [...document.querySelectorAll('.result-card.expanded .flight-leg-row')].map((row) => ({
        fundingProgramId: row.getAttribute('data-funding-program-id'),
        pricingSource: row.getAttribute('data-pricing-source'),
        text: row.innerText,
      }))
    ))
    assert(legPricing.length === expectedLegCount, `Result ${index} priced ${legPricing.length} of ${expectedLegCount} confirmed legs.`)
    assert(legPricing.every((leg) => leg.pricingSource === 'demo-distance-model/v1'), `Result ${index} bypassed the isolated leg-pricing service.`)
    if (linkedProgramIds.length) {
      assert(legPricing.every((leg) => linkedProgramIds.includes(leg.fundingProgramId) && /points/i.test(leg.text)), `Result ${index} used an unlinked or unpriced award leg.`)
      journey.linkedPrograms.forEach((programName) => {
        assert(detail.includes(programName), `Result ${index} did not visibly reference linked program ${programName}.`)
      })
    } else {
      assert(legPricing.every((leg) => leg.fundingProgramId === 'cash' && /cash/i.test(leg.text) && !/points/i.test(leg.text)), `Result ${index} did not provide cash for every leg.`)
    }
    assert(!/flight plan/i.test(detail) && !/bookable segments/i.test(detail), `Result ${index} retained removed flight-plan headings.`)
    assert(/\bpro(s)?\b/i.test(detail) && /\bcon(s)?\b/i.test(detail), `Result ${index} omitted its decision rationale.`)
    assert(!/pros\s*&\s*cons/i.test(detail), `Result ${index} retained the removed Pros & Cons eyebrow.`)
    assert(detail.includes('Rationale'), `Result ${index} omitted its rationale heading.`)
    assert(!/Why This Ranks #/i.test(detail), `Result ${index} retained the removed ranked-rationale heading.`)
    assert(!/\b1 Pros\b/.test(detail), `Result ${index} used a plural label for one pro.`)
    assert(!/\bpts\b|¢\s*\/\s*point/i.test(detail), `Result ${index} retained an unapproved points abbreviation.`)
    const rationaleSummary = expandedCard.locator('.result-rationale-summary')
    await one(tab, rationaleSummary, `Rationale summary ${index}`)
    assert((await visibleText(rationaleSummary)).endsWith('.'), `Result ${index} rationale summary omitted terminal punctuation.`)
    if (journey.id === 'seattle-paris') assert(detail.includes('September 22'), `Result ${index} lost the adjusted return date.`)
    if (journey.id === 'london-barcelona') assert(detail.includes('Business class'), `Result ${index} lost the adjusted cabin.`)
  }

  const restart = tab.playwright.getByRole('button', { name: 'Plan another trip' })
  await click(tab, restart, 'Plan another trip button')
  await waitForPhase(tab, 'intake')
}

async function runJourney(tab, journey, baseUrl, firstRun) {
  if (firstRun) await tab.goto(baseUrl)
  else await tab.reload()
  await validateIntro(tab)
  await submitTripAndResolveFollowUps(tab, journey)
  await applyAdjustments(tab, journey)
  await validateRewards(tab, journey)
  await validateOptimizationAndResults(tab, journey)
  const errors = await tab.dev.logs({ levels: ['error', 'warning'], limit: 50 })
  assert(errors.length === 0, `${journey.id} produced browser console errors: ${errors.map((entry) => entry.message).join(' | ')}`)
  return {
    id: journey.id,
    route: journey.expectedRoute,
    globeMode: journey.expectedGlobeMode,
    linkedPrograms: journey.linkedPrograms,
    status: 'passed',
  }
}

export async function runInAppBrowserRegression({
  browser,
  baseUrl = 'http://localhost:5173/',
  journeys = BROWSER_DEMO_JOURNEYS,
}) {
  await browser.nameSession('Vetra five-journey regression')
  const tab = await browser.tabs.new()
  const results = []
  try {
    for (const [index, journey] of journeys.entries()) {
      results.push(await runJourney(tab, journey, baseUrl, index === 0))
    }
    return { contract: 'vetra-demo-system/v1', journeys: results }
  } finally {
    await browser.tabs.finalize({ keep: [] })
  }
}
