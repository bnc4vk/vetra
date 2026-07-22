import { DEMO_REWARDS_PROGRAMS } from './demoRewardsPrograms.js'
import { demoLegPricingService } from './demoLegPricing.js'
import {
  arbitrateCandidateRecommendations,
  searchDemoAwardOptions,
} from './flightRecommendations.js'

export const SYSTEM_CONTRACT_VERSION = 'vetra-demo-system/v1'

export const demoRewardsService = Object.freeze({
  id: 'demo-rewards/v1',
  programs: DEMO_REWARDS_PROGRAMS,
  linkedPrograms(programIds) {
    const selected = new Set(programIds)
    return DEMO_REWARDS_PROGRAMS.filter((program) => selected.has(program.id))
  },
})

export const demoAwardSearchService = Object.freeze({
  id: 'demo-award-search/v1',
  search({ brief, rewards, referenceYear }) {
    return searchDemoAwardOptions(brief, { pricingService: demoLegPricingService, referenceYear, rewards })
  },
})

export const demoReasoningService = Object.freeze({
  id: 'demo-reasoning/v1',
  rank({ awardOptions }) {
    return arbitrateCandidateRecommendations(awardOptions)
  },
})

export const systemServices = Object.freeze({
  contractVersion: SYSTEM_CONTRACT_VERSION,
  rewards: demoRewardsService,
  legPricing: demoLegPricingService,
  awardSearch: demoAwardSearchService,
  reasoning: demoReasoningService,
  recommend({ brief, linkedProgramIds = [], referenceYear = new Date().getFullYear() }) {
    const rewards = demoRewardsService.linkedPrograms(linkedProgramIds)
    const awardOptions = demoAwardSearchService.search({ brief, rewards, referenceYear })
    return demoReasoningService.rank({ brief, rewards, awardOptions })
  },
})
