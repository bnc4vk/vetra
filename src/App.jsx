import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  LockKeyhole,
  Minus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  applyFollowUpToBrief,
  applyItineraryOperations,
  interpretItineraryAdjustment,
  interpretTrip,
  isPlausibleCityAnswer,
  toUiTripBrief,
  validateItinerary,
} from './tripIntelligence'
import { SYSTEM_CONTRACT_VERSION, systemServices } from './systemServices'
import vetraLogo from './assets/vetra-logo.png'
import vetraMark from './assets/vetra-mark.png'

const FlightGlobe = lazy(() => import('./FlightGlobe'))

const WELCOME_COPY =
  'Welcome to Vetra, the intelligent flights agent personalized to your travel style and award balances.'
const PROMPT_COPY = "You tell me where you need to be. I’ll get started on the trip planning."
const DEV_STEP3_BRIEF = import.meta.env.DEV
  ? 'i need to be in Tokyo on nov 12th. i live in new york. i have two total weeks that i can travel for, and want to take advantage of being in that part of the world to explore south korea'
  : ''
const DEV_STEP3_MODE = Boolean(
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dev') === 'step3',
)
const DEV_RESULTS_MODE = Boolean(
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dev') === 'results',
)
const DEV_ADJUST_MODE = Boolean(
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dev') === 'adjust',
)
const DEV_GLOBE_MODE = Boolean(
  import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dev') === 'globe',
)
const DEV_GLOBE_ROUTES = [
  ['New York', 'Tokyo', 'Seoul', 'New York'],
  ['London', 'Cape Town', 'Singapore', 'London'],
  ['Sydney', 'Los Angeles', 'Santiago', 'Sydney'],
  ['Dubai', 'Delhi', 'Bangkok', 'Dubai'],
  ['Toronto', 'Reykjavik', 'Paris', 'Toronto'],
  ['Seattle', 'London', 'Paris', 'Barcelona', 'Seattle'],
  ['Seattle', 'London', 'Atlantis', 'Seattle'],
]
const DEV_GLOBE_ROUTE_INDEX = typeof window === 'undefined'
  ? 0
  : Math.max(0, Math.min(DEV_GLOBE_ROUTES.length - 1, Number(new URLSearchParams(window.location.search).get('route') || 1) - 1))

function createDevBrief(cities) {
  const route = cities.join(' → ')
  return {
  raw: DEV_STEP3_BRIEF,
  revision: 0,
  appliedOperationIds: [],
  travelers: 'Travelers Not Specified',
  flexibility: 'Two-Week Trip',
  tripDurationDays: 14,
  tripSummary: '14-Day Trip',
  cities,
  route,
  followUpQuestions: [],
  flightLegs: cities.slice(0, -1).map((origin, index) => ({
    legId: `dev-leg-${index + 1}`,
    route: `${origin} → ${cities[index + 1]}`,
    origin,
    originKind: 'city',
    destination: cities[index + 1],
    destinationKind: 'city',
    timing: index === 0 ? 'Arrive By Nov 12' : 'Within Two-Week Trip',
    timingKind: index === 0 ? 'arrive_by' : 'trip_window',
    timingEvidence: index === 0 ? 'explicit' : 'implied',
    cabin: 'Not Specified',
    cabinEvidence: 'missing',
    detail: index === 0 ? 'Primary Arrival Required' : 'Finalized Route',
    status: 'captured',
    statusLabel: 'Captured',
    pending: false,
    resolved: false,
  })),
  source: { kind: 'dev', model: 'gpt-5.4-2026-03-05', contractVersion: 'itinerary-intent/v1' },
  }
}

const DEV_BRIEF = DEV_ADJUST_MODE || DEV_RESULTS_MODE || DEV_GLOBE_MODE
  ? createDevBrief(DEV_GLOBE_MODE ? DEV_GLOBE_ROUTES[DEV_GLOBE_ROUTE_INDEX] : DEV_GLOBE_ROUTES[0])
  : null
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
const PROGRAM_SEARCH_PAGE_SIZE = 20
const PROGRAM_ROW_REVEAL_DELAY = 300
const GOOGLE_NAVIGATION_CUE_MS = 3300
const CONNECTION_PROGRESS_MS = 4400
const MOTION = {
  welcomeWord: 232,
  promptWord: 192,
  questionWord: 168,
  welcomeHold: 1100,
  promptHold: 400,
  copyExit: 260,
  capture: 620,
  preliminaryMinBeat: 800,
  preliminaryMaxBeat: 1100,
  preliminaryResolve: 380,
  preliminaryHold: 420,
  followUpProcess: 720,
  followUpSettle: 580,
  awardsExit: 480,
  adjustmentMinProcess: 720,
  adjustmentCopy: 110,
  adjustmentUpdatedHold: 1500,
  optimizationStages: [1250, 1450, 1300, 1650],
  optimizationExit: 380,
}

const programs = systemServices.rewards.programs
const AWARDWALLET_PROGRAM_IDS = ['amex', 'citi', 'alaska', 'jetblue', 'southwest']
const AWARDWALLET_CONNECTOR = {
  id: 'awardwallet',
  name: 'AwardWallet',
  program: 'Rewards portfolio',
  mark: 'AW',
  balance: AWARDWALLET_PROGRAM_IDS.reduce((total, programId) => (
    total + (programs.find((program) => program.id === programId)?.balance || 0)
  ), 0),
  color: '#17233d',
  tint: '#eef1f5',
  status: `${AWARDWALLET_PROGRAM_IDS.length} programs connected`,
  isAggregator: true,
}
const PROGRAM_ACCOUNT_STATUSES = {
  amex: 'Platinum Card',
  chase: 'Sapphire Reserve',
  capitalone: 'Venture X',
  citi: 'Strata Premier',
  bilt: 'Bilt Mastercard',
  american: 'Platinum Pro',
  united: 'Premier Gold',
  delta: 'Diamond Medallion',
  southwest: 'A-List Preferred',
  aeroplan: 'Aeroplan 50K',
  flyingblue: 'Flying Blue Gold',
  alaska: 'MVP Gold 75K',
  jetblue: 'Mosaic 2',
  britishairways: 'Gold Tier',
  virginatlantic: 'Flying Club Gold',
  marriott: 'Platinum Elite',
  hilton: 'Diamond',
  hyatt: 'Explorist',
  ihg: 'Platinum Elite',
}
const CARD_PROGRAM_IDS = new Set([
  'amex', 'chase', 'capitalone', 'citi', 'bilt', 'wellsfargo', 'bankofamerica',
  'usbank', 'barclays', 'brex', 'rbc', 'td', 'cibc', 'bmo', 'sceneplus',
])
const HOTEL_PROGRAM_IDS = new Set(['marriott', 'hilton', 'hyatt', 'ihg', 'wyndham', 'choice', 'accor', 'radisson'])

function getMockAccountStatus(program) {
  if (program.status) return program.status
  if (PROGRAM_ACCOUNT_STATUSES[program.id]) return PROGRAM_ACCOUNT_STATUSES[program.id]
  if (CARD_PROGRAM_IDS.has(program.id)) return 'Primary cardholder'
  if (HOTEL_PROGRAM_IDS.has(program.id)) return 'Gold status'
  return 'Gold status'
}

const getOptimizationStages = ({ linkedProgramCount, legCount, candidateCount }) => [
  { label: 'Mapping routes around your non-negotiables', meta: `${legCount} confirmed flight leg${legCount === 1 ? '' : 's'} carried forward` },
  { label: 'Checking your connected rewards programs', meta: linkedProgramCount ? `${linkedProgramCount} connected program${linkedProgramCount === 1 ? '' : 's'} compared` : '0 connected programs · cash fallback enabled' },
  { label: 'Pricing every confirmed flight leg', meta: `${legCount * candidateCount} flight leg quote${legCount * candidateCount === 1 ? '' : 's'} compared` },
  { label: 'Ranking the strongest complete itineraries', meta: `${candidateCount} candidate itinerar${candidateCount === 1 ? 'y' : 'ies'} ranked` },
]

const LOCATION_EXAMPLES = new Map([
  ['spain', 'Valencia'],
  ['south korea', 'Seoul'],
  ['vietnam', 'Hanoi'],
  ['philippines', 'Cebu'],
  ['japan', 'Osaka'],
  ['italy', 'Florence'],
  ['france', 'Lyon'],
  ['greece', 'Thessaloniki'],
  ['portugal', 'Porto'],
  ['thailand', 'Chiang Mai'],
])

function getLocationExample(scope = '') {
  return LOCATION_EXAMPLES.get(String(scope).trim().toLowerCase()) || null
}

function getFollowUpPlaceholder(followUp) {
  const field = String(followUp?.key || followUp?.field || '')
  if (/traveler/i.test(field)) return 'For example, just me…'
  if (/destination|city|airport|location/i.test(field)) {
    const example = getLocationExample(followUp?.scope)
    return example ? `For example, ${example}…` : `For example, name a city in ${followUp?.scope || 'that area'}…`
  }
  if (/timing|date/i.test(field)) return 'For example, October 8…'
  if (/cabin/i.test(field)) return 'For example, premium economy…'
  return 'For example, flexible dates…'
}

function getAdjustmentPlaceholder(brief, issues) {
  const legs = brief?.flightLegs || []
  const unresolvedLeg = legs.find((leg) => (
    leg.pending || leg.originKind === 'broad_location' || leg.destinationKind === 'broad_location'
  ))
  if (issues.some((issue) => issue.type === 'city') && unresolvedLeg) {
    const scope = unresolvedLeg.originKind === 'broad_location' ? unresolvedLeg.origin : unresolvedLeg.destination
    const example = getLocationExample(scope)
    return example ? `For example, change ${scope} to ${example}…` : `For example, specify a city in ${scope}…`
  }
  if (issues.some((issue) => issue.type === 'timing')) return 'For example, move the return flight a day later…'

  const home = legs[0]?.origin
  const lastStop = [...legs]
    .reverse()
    .map((leg) => leg.destination)
    .find((destination) => destination && destination !== home)
  if (lastStop) return `For example, stay two more nights in ${lastStop}…`
  return 'For example, change the cabin to business class…'
}

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value)
let googleIdentityScriptPromise = null
let googleIdentityInitialized = false
let googleCredentialHandler = null

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-vetra-google-identity]')
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.vetraGoogleIdentity = 'true'
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', reject, { once: true })
    document.head.appendChild(script)
  })
  return googleIdentityScriptPromise
}

function normalizeItineraryText(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,?\s*(?:plus or minus|\+\/?-)\s*one day/gi, ' · ±1 day')
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase())
    .replace(/\bArrive By\b/g, 'Arrive by')
    .replace(/\bWithin Two-Week Trip\b/g, 'Within two-week trip')
    .replace(/\bWithin Trip Window\b/g, 'Within trip window')
    .replace(/\bNot Specified\b/g, 'Not specified')
    .replace(/\bPremium Economy\b/g, 'Premium economy')
    .replace(/\bBusiness Class\b/g, 'Business class')
}

function getSafeAdjustmentError(error) {
  const message = String(error?.message || '')
  if (/changed while|already applied|no longer exists/i.test(message)) {
    return 'Your itinerary changed while I was working. Try that adjustment again.'
  }
  return 'I couldn’t apply that change. Try naming the flight leg and what you want to update.'
}

function Brand() {
  return (
    <div className="brand" aria-label="Vetra">
      <img className="brand-logo" src={vetraLogo} alt="Vetra" />
    </div>
  )
}

function WordReveal({ children, className = '', speed = 55, instant = false, onComplete }) {
  const words = children.split(' ')
  let cumulativeDelay = 0
  const delays = words.map((word, index) => {
    const delay = cumulativeDelay
    if (index < words.length - 1) {
      let punctuationPause = 0
      if (/[.][”"']?$/.test(word)) punctuationPause = speed * 3
      else if (/[!?][”"']?$/.test(word)) punctuationPause = speed * 1.5
      else if (/[:][”"']?$/.test(word)) punctuationPause = speed * 1.1
      else if (/[—–][”"']?$/.test(word)) punctuationPause = speed * 0.8
      else if (/[,][”"']?$/.test(word)) punctuationPause = speed * 1.1
      else if (/[;][”"']?$/.test(word)) punctuationPause = speed * 0.55
      else if (/[)][”"']?$/.test(word)) punctuationPause = speed * 0.45
      cumulativeDelay += speed + punctuationPause
    }
    return delay
  })
  return (
    <span className={`word-reveal ${instant ? 'word-reveal--instant' : ''} ${className}`} aria-label={children}>
      {words.map((word, index) => (
        <span
          aria-hidden="true"
          key={`${word}-${index}`}
          style={{ '--word-delay': `${delays[index]}ms` }}
          onAnimationEnd={index === words.length - 1 ? onComplete : undefined}
        >
          {word}&nbsp;
        </span>
      ))}
    </span>
  )
}

function App() {
  const [phase, setPhase] = useState(DEV_GLOBE_MODE ? 'optimizing' : DEV_RESULTS_MODE ? 'results' : DEV_ADJUST_MODE ? 'adjust' : DEV_STEP3_MODE ? 'intake' : 'welcome')
  const [draft, setDraft] = useState(DEV_STEP3_MODE ? DEV_STEP3_BRIEF : '')
  const [brief, setBrief] = useState(DEV_BRIEF)
  const [followUp, setFollowUp] = useState(null)
  const [linked, setLinked] = useState(DEV_ADJUST_MODE || DEV_GLOBE_MODE ? ['amex', 'chase', 'capitalone', 'citi'] : [])
  const [linkedAccountDetails, setLinkedAccountDetails] = useState(() => (
    DEV_ADJUST_MODE || DEV_GLOBE_MODE
      ? Object.fromEntries(programs
        .filter((program) => ['amex', 'chase', 'capitalone', 'citi'].includes(program.id))
        .map((program) => [program.id, {
          balance: program.balance,
          status: getMockAccountStatus(program),
          method: 'credentials',
        }]))
      : {}
  ))
  const [optimizationStep, setOptimizationStep] = useState(0)
  const [optimizationFinishing, setOptimizationFinishing] = useState(false)
  const [optimizationReady, setOptimizationReady] = useState(false)
  const [optimizationGlobeComplete, setOptimizationGlobeComplete] = useState(false)
  const [recommendations, setRecommendations] = useState(() => DEV_RESULTS_MODE && DEV_BRIEF
    ? systemServices.recommend({ brief: DEV_BRIEF })
    : [])
  const [expandedResult, setExpandedResult] = useState(0)
  const [transitioning, setTransitioning] = useState(null)
  const [preliminaryLegCount, setPreliminaryLegCount] = useState(0)
  const [interpretationReady, setInterpretationReady] = useState(false)
  const [interpretationError, setInterpretationError] = useState('')
  const [interpretationDuration, setInterpretationDuration] = useState(0)
  const [adjustmentError, setAdjustmentError] = useState('')
  const [adjustmentCue, setAdjustmentCue] = useState('prompt')
  const [changedLegIds, setChangedLegIds] = useState([])
  const [adjustmentCopyComplete, setAdjustmentCopyComplete] = useState(false)
  const [hasAppliedAdjustment, setHasAppliedAdjustment] = useState(false)
  const [rewardsCopyComplete, setRewardsCopyComplete] = useState(false)
  const [rewardsTilesComplete, setRewardsTilesComplete] = useState(false)
  const [introCopyComplete, setIntroCopyComplete] = useState(DEV_STEP3_MODE || DEV_ADJUST_MODE || DEV_RESULTS_MODE || DEV_GLOBE_MODE)
  const [introExiting, setIntroExiting] = useState(false)
  const introTimers = useRef([])
  const transitionTimers = useRef([])
  const optimizationTimer = useRef(null)
  const resultTimer = useRef(null)
  const introCompleteRef = useRef(DEV_STEP3_MODE || DEV_ADJUST_MODE || DEV_RESULTS_MODE || DEV_GLOBE_MODE)
  const interpretationController = useRef(null)
  const adjustmentController = useRef(null)

  const scheduleTransition = (callback, delay) => {
    const timer = window.setTimeout(() => {
      transitionTimers.current = transitionTimers.current.filter((timerId) => timerId !== timer)
      callback()
    }, delay)
    transitionTimers.current.push(timer)
    return timer
  }

  const clearTransitionTimers = () => {
    transitionTimers.current.forEach(window.clearTimeout)
    transitionTimers.current = []
  }

  useEffect(() => {
    if (DEV_ADJUST_MODE || DEV_RESULTS_MODE) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPhase('intake')
      return undefined
    }
    return () => introTimers.current.forEach(window.clearTimeout)
  }, [])

  const movePastIntroCopy = (currentPhase = phase) => {
    introTimers.current.forEach(window.clearTimeout)
    introTimers.current = []
    if (currentPhase === 'welcome') {
      setIntroExiting(true)
      const timer = window.setTimeout(() => {
        setPhase('prompt')
        setIntroExiting(false)
        setIntroCopyComplete(false)
        introCompleteRef.current = false
      }, MOTION.copyExit)
      introTimers.current.push(timer)
    } else if (currentPhase === 'prompt') {
      setPhase('intake')
    }
  }

  const finishIntroCopy = () => {
    if (introCompleteRef.current) return
    introCompleteRef.current = true
    setIntroCopyComplete(true)
    const hold = phase === 'welcome' ? MOTION.welcomeHold : MOTION.promptHold
    const timer = window.setTimeout(() => movePastIntroCopy(phase), hold)
    introTimers.current.push(timer)
  }

  useEffect(() => {
    if (phase !== 'welcome' && phase !== 'prompt') return undefined
    const advance = () => {
      if (!introCompleteRef.current) finishIntroCopy()
      else movePastIntroCopy(phase)
    }
    window.addEventListener('keydown', advance)
    return () => window.removeEventListener('keydown', advance)
  }, [phase, introCopyComplete])

  useEffect(() => () => {
    interpretationController.current?.abort()
    adjustmentController.current?.abort()
    transitionTimers.current.forEach(window.clearTimeout)
    if (optimizationTimer.current) window.clearTimeout(optimizationTimer.current)
    if (resultTimer.current) window.clearTimeout(resultTimer.current)
  }, [])

  useEffect(() => {
    if (phase !== 'building' || !brief || !interpretationReady || !brief.flightLegs?.length) return undefined

    const legCount = brief.flightLegs.length
    const timers = []
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const rowBeat = reducedMotion
      ? 240
      : Math.round(Math.min(
        MOTION.preliminaryMaxBeat,
        Math.max(MOTION.preliminaryMinBeat, interpretationDuration / legCount),
      ))
    const resolveDuration = reducedMotion ? 20 : MOTION.preliminaryResolve
    const finalHold = reducedMotion ? 160 : MOTION.preliminaryHold
    setPreliminaryLegCount(0)

    for (let index = 0; index < legCount; index += 1) {
      timers.push(scheduleTransition(
        () => setPreliminaryLegCount(index + 1),
        rowBeat * (index + 1),
      ))
    }

    const finalRowStart = rowBeat * legCount
    timers.push(scheduleTransition(() => {
      if (followUp) {
        setPhase('followup')
      } else {
        setAdjustmentCue('prompt')
        setAdjustmentCopyComplete(false)
        setPhase('adjust')
      }
    }, finalRowStart + resolveDuration + finalHold))

    return () => {
      timers.forEach(window.clearTimeout)
      transitionTimers.current = transitionTimers.current.filter((timer) => !timers.includes(timer))
    }
  }, [phase, brief, followUp, interpretationDuration, interpretationReady])

  useEffect(() => {
    if (phase !== 'optimizing') return undefined
    setRecommendations(systemServices.recommend({
      brief,
      linkedProgramIds: linked,
    }))
    setOptimizationStep(0)
    setOptimizationFinishing(false)
    setOptimizationReady(false)
    setOptimizationGlobeComplete(false)
    let currentStep = 0
    const advanceOptimization = () => {
      optimizationTimer.current = window.setTimeout(() => {
        if (currentStep >= MOTION.optimizationStages.length - 1) {
          setOptimizationStep(MOTION.optimizationStages.length - 1)
          setOptimizationReady(true)
          return
        }
        currentStep += 1
        setOptimizationStep(currentStep)
        advanceOptimization()
      }, MOTION.optimizationStages[currentStep])
    }
    advanceOptimization()
    return () => {
      if (optimizationTimer.current) {
        window.clearTimeout(optimizationTimer.current)
        optimizationTimer.current = null
      }
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'optimizing' || !optimizationReady || !optimizationGlobeComplete || !recommendations.length) return undefined
    setOptimizationStep(MOTION.optimizationStages.length)
    setOptimizationFinishing(true)
    resultTimer.current = window.setTimeout(() => setPhase('results'), MOTION.optimizationExit)
    return () => {
      if (resultTimer.current) {
        window.clearTimeout(resultTimer.current)
        resultTimer.current = null
      }
    }
  }, [phase, optimizationGlobeComplete, optimizationReady, recommendations.length])

  const linkedPrograms = useMemo(() => programs
    .filter((program) => linked.includes(program.id))
    .map((program) => ({ ...program, ...(linkedAccountDetails[program.id] || {}) })), [linked, linkedAccountDetails])
  const totalBalance = linkedPrograms.reduce((total, program) => total + program.balance, 0)
  const itineraryIssues = useMemo(() => validateItinerary(brief?.flightLegs || []), [brief])
  const submitTrip = () => {
    if (!draft.trim() || transitioning) return
    const submitted = draft.trim()
    interpretationController.current?.abort()
    const controller = new AbortController()
    interpretationController.current = controller
    setBrief({
      raw: submitted,
      travelers: 'Not Specified',
      flexibility: 'Not Specified',
      flightLegs: [],
      followUpQuestions: [],
    })
    setFollowUp(null)
    setInterpretationReady(false)
    setInterpretationError('')
    setInterpretationDuration(0)
    setTransitioning('capture')
    const interpretationStartedAt = Date.now()

    interpretTrip(submitted, { signal: controller.signal })
      .then((intent) => {
        if (controller.signal.aborted) return
        const interpretedBrief = toUiTripBrief(intent, submitted)
        const firstQuestion = interpretedBrief.followUpQuestions[0]
        setBrief(interpretedBrief)
        setFollowUp(firstQuestion ? {
          key: firstQuestion.field,
          scope: firstQuestion.scope,
          question: firstQuestion.question,
        } : null)
        setInterpretationDuration(Date.now() - interpretationStartedAt)
        setInterpretationReady(true)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setInterpretationError('I couldn’t structure that trip reliably. Start over and try the request again.')
      })

    scheduleTransition(() => {
      setDraft('')
      setPreliminaryLegCount(0)
      setPhase('building')
      setTransitioning(null)
    }, MOTION.capture)
  }

  const submitFollowUp = () => {
    if (!draft.trim() || transitioning) return
    const answer = draft.trim()
    if (/destination|city|airport|location/i.test(followUp?.key || '') && !isPlausibleCityAnswer(answer, followUp?.scope)) {
      setInterpretationError(`Please name a city within ${followUp?.scope || 'that area'}.`)
      return
    }
    setInterpretationError('')
    setTransitioning('resolving')
    scheduleTransition(() => {
      const updatedBrief = applyFollowUpToBrief(brief, followUp, answer)
      const nextQuestion = updatedBrief.followUpQuestions[0]
      setBrief(updatedBrief)
      setTransitioning('resolved')
      scheduleTransition(() => {
        setDraft('')
        setTransitioning(null)
        if (nextQuestion) {
          setFollowUp({ key: nextQuestion.field, scope: nextQuestion.scope, question: nextQuestion.question })
          setPhase('followup')
        } else {
          setFollowUp(null)
          setAdjustmentCue('prompt')
          setAdjustmentCopyComplete(false)
          setPhase('adjust')
        }
      }, MOTION.followUpSettle)
    }, MOTION.followUpProcess)
  }

  const toggleProgram = (programId, accountDetails) => {
    if (linked.includes(programId)) {
      setLinked((current) => current.filter((id) => id !== programId))
      setLinkedAccountDetails((current) => {
        const next = { ...current }
        delete next[programId]
        return next
      })
      return
    }
    setLinked((current) => current.includes(programId) ? current : [...current, programId])
    const program = programs.find((entry) => entry.id === programId)
    setLinkedAccountDetails((current) => ({
      ...current,
      [programId]: accountDetails || {
        balance: program?.balance || 0,
        status: program ? getMockAccountStatus(program) : null,
        method: 'credentials',
      },
    }))
  }

  const connectAwardWalletPrograms = (programIds) => {
    setLinked((current) => [...new Set([...current, ...programIds])])
    setLinkedAccountDetails((current) => {
      const next = { ...current }
      programIds.forEach((programId) => {
        if (next[programId]) return
        const program = programs.find((entry) => entry.id === programId)
        if (!program) return
        next[programId] = {
          balance: program.balance,
          status: getMockAccountStatus(program),
          method: 'awardwallet',
        }
      })
      return next
    })
  }

  const disconnectAwardWalletPrograms = (programIds) => {
    setLinked((current) => current.filter((programId) => !programIds.includes(programId)))
    setLinkedAccountDetails((current) => {
      const next = { ...current }
      programIds.forEach((programId) => {
        if (next[programId]?.method === 'awardwallet') delete next[programId]
      })
      return next
    })
  }

  const finishRefinement = () => {
    if (transitioning || itineraryIssues.length) return
    setTransitioning('refinement-exit')
    scheduleTransition(() => {
      setRewardsCopyComplete(false)
      setRewardsTilesComplete(false)
      setPhase('rewards')
      setAdjustmentCopyComplete(false)
      setTransitioning(null)
    }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 20 : MOTION.copyExit)
  }

  const submitAdjustment = () => {
    if (!draft.trim() || transitioning || !brief) return
    const request = draft.trim()
    adjustmentController.current?.abort()
    const controller = new AbortController()
    adjustmentController.current = controller
    setTransitioning('adjusting')
    setAdjustmentError('')
    setChangedLegIds([])
    const startedAt = Date.now()

    interpretItineraryAdjustment(request, brief, { signal: controller.signal })
      .then((adjustment) => {
        if (controller.signal.aborted) return
        const wait = Math.max(0, MOTION.adjustmentMinProcess - (Date.now() - startedAt))
        scheduleTransition(() => {
          try {
            const result = applyItineraryOperations(brief, adjustment)
            setBrief(result.brief)
            setChangedLegIds(result.changedLegIds)
            setHasAppliedAdjustment(true)
            setDraft('')
            setTransitioning(null)
            setAdjustmentCopyComplete(false)
            setAdjustmentCue('updated')
          } catch (error) {
            setTransitioning(null)
            setAdjustmentError(getSafeAdjustmentError(error))
          }
        }, wait)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setTransitioning(null)
        setAdjustmentError('I couldn’t tell what to change. Try naming the stop, date, or cabin.')
      })
  }

  const beginOptimization = () => {
    if (transitioning || itineraryIssues.length) return
    setExpandedResult(0)
    setTransitioning('awards-exit')
    scheduleTransition(() => {
      setPhase('optimizing')
      setTransitioning(null)
    }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 20 : MOTION.awardsExit)
  }

  const finishRewards = () => beginOptimization()

  const handleOptimizationFlightComplete = useCallback(() => {
    setOptimizationGlobeComplete(true)
  }, [])

  const reset = () => {
    interpretationController.current?.abort()
    adjustmentController.current?.abort()
    interpretationController.current = null
    introTimers.current.forEach(window.clearTimeout)
    clearTransitionTimers()
    if (optimizationTimer.current) window.clearTimeout(optimizationTimer.current)
    optimizationTimer.current = null
    if (resultTimer.current) window.clearTimeout(resultTimer.current)
    resultTimer.current = null
    setDraft(DEV_STEP3_MODE ? DEV_STEP3_BRIEF : '')
    setBrief(null)
    setFollowUp(null)
    setLinked([])
    setLinkedAccountDetails({})
    setOptimizationStep(0)
    setOptimizationFinishing(false)
    setOptimizationReady(false)
    setOptimizationGlobeComplete(false)
    setRecommendations([])
    setExpandedResult(0)
    setTransitioning(null)
    setPreliminaryLegCount(0)
    setInterpretationReady(false)
    setInterpretationError('')
    setInterpretationDuration(0)
    setAdjustmentError('')
    setAdjustmentCue('prompt')
    setChangedLegIds([])
    setAdjustmentCopyComplete(false)
    setHasAppliedAdjustment(false)
    setRewardsCopyComplete(false)
    setRewardsTilesComplete(false)
    setIntroCopyComplete(true)
    introCompleteRef.current = true
    setPhase('intake')
  }

  const isIntro = ['welcome', 'prompt', 'intake'].includes(phase)
  const workspacePhase = ['building', 'followup', 'rewards', 'adjust'].includes(phase)
  const requestedLegs = brief?.flightLegs || []
  const adjustmentBusy = transitioning === 'adjusting'
  const itineraryBlocked = itineraryIssues.length > 0
  const primaryIssueType = itineraryIssues[0]?.type
  const blockedStatusLabel = primaryIssueType === 'city'
    ? 'City needed'
    : primaryIssueType === 'timing'
      ? 'Timing issue'
      : 'Continuity issue'
  const summaryStatus = (() => {
    if (phase === 'building') return { label: interpretationError ? 'Stopped' : 'Building', tone: 'building' }
    if (phase === 'followup') {
      if (transitioning === 'resolving') return { label: 'Updating', tone: 'building' }
      if (transitioning === 'resolved') return { label: 'Updated', tone: 'complete', checked: true }
      return { label: 'Collecting details', tone: 'building' }
    }
    if (adjustmentBusy) return { label: 'Updating', tone: 'building' }
    if (phase === 'adjust' && itineraryBlocked) return { label: blockedStatusLabel, tone: 'warning', warning: true }
    if (phase === 'adjust' && adjustmentCue === 'updated') return { label: 'Updated', tone: 'complete', checked: true }
    if (phase === 'adjust') return { label: 'Review', tone: '' }
    return { label: 'Ready', tone: 'complete', checked: true }
  })()

  return (
    <div
      className={`app app--${phase} ${transitioning ? `app--transition-${transitioning}` : ''}`}
      data-testid="vetra-app"
      data-phase={phase}
      data-system-contract={SYSTEM_CONTRACT_VERSION}
      data-recommendation-count={recommendations.length}
    >
      <header className="app-header">
        <Brand />
        {!isIntro && phase !== 'results' && (
          <button className="reset-button" onClick={reset}><RotateCcw size={14} /> Start over</button>
        )}
      </header>

      {isIntro && (
        <main
          className={`intro intro--${phase}`}
          onPointerDown={phase === 'welcome' || phase === 'prompt' ? () => {
            if (!introCompleteRef.current) finishIntroCopy()
            else movePastIntroCopy(phase)
          } : undefined}
        >
          <div className="ambient-glow" />
          <section className="intro-content" aria-live="polite">
            {phase === 'welcome' && (
              <h1 key="welcome" className={introExiting ? 'intro-copy--exiting' : ''}>
                <WordReveal speed={MOTION.welcomeWord} instant={introCopyComplete} onComplete={finishIntroCopy}>{WELCOME_COPY}</WordReveal>
              </h1>
            )}
            {(phase === 'prompt' || phase === 'intake') && (
              <h1 key="prompt">
                <WordReveal speed={MOTION.promptWord} instant={introCopyComplete || phase === 'intake'} onComplete={phase === 'prompt' ? finishIntroCopy : undefined}>{PROMPT_COPY}</WordReveal>
              </h1>
            )}
            <div className="intro-composer-wrap">
              <TripComposer
                value={draft}
                onChange={setDraft}
                onSubmit={submitTrip}
                placeholder="I’m flying from New York to Tokyo on October 8…"
                large
                autoFocus={phase === 'intake'}
                busy={transitioning === 'capture'}
                busyLabel="Capturing your trip…"
              />
            </div>
          </section>
        </main>
      )}

      {workspacePhase && brief && (
        <main
          className="journey-shell"
          style={{ '--summary-height': `${136 + Math.max(requestedLegs.length, 3) * 100}px` }}
        >
          <section className={`journey-conversation ${['rewards', 'adjust'].includes(phase) ? 'journey-conversation--rewards' : ''}`}>
            <h1 className={`journey-question ${['rewards', 'adjust'].includes(phase) ? 'journey-question--rewards' : ''}`} key={`${phase}-${phase === 'adjust' ? adjustmentCue : ''}`}>
              <WordReveal
                speed={phase === 'building' ? 76 : phase === 'adjust' ? MOTION.adjustmentCopy : MOTION.questionWord}
                onComplete={phase === 'rewards'
                  ? () => setRewardsCopyComplete(true)
                  : phase === 'adjust'
                    ? () => {
                      if (adjustmentCue === 'updated') {
                        scheduleTransition(() => {
                          setChangedLegIds([])
                          setAdjustmentCue('prompt')
                          setAdjustmentCopyComplete(false)
                        }, MOTION.adjustmentUpdatedHold)
                      } else {
                        setAdjustmentCopyComplete(true)
                      }
                    }
                    : undefined}
              >
                {phase === 'building'
                  ? interpretationError || 'I’m building a preliminary itinerary.'
                  : phase === 'followup'
                  ? followUp.question
                  : phase === 'rewards'
                    ? 'One last step: connect your airline and card rewards programs.'
                    : adjustmentCue === 'updated'
                      ? 'Itinerary updated.'
                      : hasAppliedAdjustment
                        ? 'Any more changes before I generate your personalized flight paths?'
                        : 'Any changes before I generate your personalized flight paths?'}
              </WordReveal>
            </h1>
            {phase === 'building' || phase === 'followup' ? (
              <div className="journey-action-slot">
                {phase === 'building' ? (
                  (interpretationError || interpretationReady) && (
                    <div className={`preliminary-progress ${preliminaryLegCount === requestedLegs.length ? 'complete' : ''}`} role="status" aria-live="polite">
                      {interpretationError
                        ? 'Trip interpretation stopped'
                        : preliminaryLegCount < requestedLegs.length
                          ? `Identifying flight leg ${preliminaryLegCount + 1} of ${requestedLegs.length}`
                          : 'Preliminary itinerary assembled'}
                    </div>
                  )
                ) : (
                  <div className="followup-composer-wrap">
                  <TripComposer
                    value={draft}
                    onChange={setDraft}
                    onSubmit={submitFollowUp}
                    placeholder={getFollowUpPlaceholder(followUp)}
                    autoFocus
                    focusDelay={740}
                    busy={transitioning === 'resolving' || transitioning === 'resolved'}
                    busyLabel="Updating your itinerary…"
                  />
                  {interpretationError && <p className="inline-error"><CircleAlert size={13} /> {interpretationError}</p>}
                  </div>
                )}
              </div>
            ) : phase === 'rewards' ? (
              <div className="rewards-controls">
                {rewardsCopyComplete && (
                  <>
                    <div className="left-program-stage">
                      <ProgramPicker
                        linked={linked}
                        linkedAccountDetails={linkedAccountDetails}
                        onToggle={toggleProgram}
                        onAwardWalletConnect={connectAwardWalletPrograms}
                        onAwardWalletDisconnect={disconnectAwardWalletPrograms}
                        onRevealComplete={() => setRewardsTilesComplete(true)}
                      />
                    </div>
                    {rewardsTilesComplete && (
                      <button className="done-button" onClick={finishRewards} disabled={Boolean(transitioning)}>
                        Done <ArrowRight size={17} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className={`adjustment-controls ${adjustmentCopyComplete ? 'is-ready' : ''}`}>
                {adjustmentCue === 'prompt' && adjustmentCopyComplete && (
                  <>
                    <TripComposer
                      value={draft}
                      onChange={setDraft}
                      onSubmit={submitAdjustment}
                      placeholder={getAdjustmentPlaceholder(brief, itineraryIssues)}
                      ariaLabel="Itinerary changes"
                      autoFocus
                      focusDelay={140}
                      busy={adjustmentBusy}
                      busyLabel="Applying that change…"
                    />
                    {adjustmentError && <p className="inline-error" role="status" aria-live="polite"><CircleAlert size={13} /> {adjustmentError}</p>}
                    {!adjustmentBusy && (
                      <button
                        className="generate-button looks-good-button"
                        onClick={finishRefinement}
                        disabled={itineraryBlocked || Boolean(transitioning)}
                      >
                        Looks good <ArrowRight size={17} />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

          </section>

          <aside className="journey-summary">
            <div className="summary-heading">
              <span className="step-label">Itinerary</span>
              <span role="status" aria-live="polite" className={`summary-status ${summaryStatus.tone}`}>
                {summaryStatus.checked && <Check size={12} />}
                {summaryStatus.warning && <CircleAlert size={12} />}
                {summaryStatus.label}
              </span>
            </div>
            <FlightLegRows
              legs={requestedLegs}
              building={phase === 'building'}
              visibleCount={preliminaryLegCount}
              interpreting={!interpretationReady && !interpretationError}
              justResolved={transitioning === 'resolved'}
              changedLegIds={changedLegIds}
              issues={phase === 'adjust' ? itineraryIssues : []}
            />
          </aside>
        </main>
      )}

      {phase === 'optimizing' && (
        <OptimizationView
          step={optimizationStep}
          linkedPrograms={linkedPrograms}
          recommendations={recommendations}
          finishing={optimizationFinishing}
          brief={brief}
          onFlightComplete={handleOptimizationFlightComplete}
        />
      )}

      {phase === 'results' && (
        <ResultsView
          linkedPrograms={linkedPrograms}
          totalBalance={totalBalance}
          brief={brief}
          recommendations={recommendations}
          expanded={expandedResult}
          onExpand={setExpandedResult}
          onReset={reset}
        />
      )}
    </div>
  )
}

function TripComposer({ value, onChange, onSubmit, placeholder, ariaLabel = 'Trip details', large = false, autoFocus = false, focusDelay = 620, busy = false, busyLabel = '' }) {
  const textareaRef = useRef(null)
  useEffect(() => {
    if (!autoFocus) return undefined
    const timer = window.setTimeout(() => textareaRef.current?.focus(), focusDelay)
    return () => window.clearTimeout(timer)
  }, [autoFocus, focusDelay])
  return (
    <div className={`composer ${large ? 'composer--large' : ''} ${busy ? 'composer--busy' : ''}`} aria-busy={busy}>
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        value={value}
        rows={large ? 4 : 2}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        readOnly={busy}
        onKeyDown={(event) => {
          const shouldSubmit = event.key === 'Enter' && !event.shiftKey
          if (shouldSubmit) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <div className={`composer-footer ${!busy ? 'composer-footer--actions-only' : ''}`}>
        {busy && <span>{busyLabel}</span>}
        <button onClick={onSubmit} disabled={!value.trim() || busy} aria-label={busy ? busyLabel : 'Continue'}>
          {busy ? <i className="composer-busy-dot" /> : <ArrowUp size={18} />}
        </button>
      </div>
    </div>
  )
}

function FlightLegRows({ legs, result = false, building = false, visibleCount = legs.length, interpreting = false, justResolved = false, changedLegIds = [], issues = [] }) {
  const visibleLegs = building ? legs.slice(0, visibleCount) : legs
  const legCount = Math.max(legs.length, interpreting ? 3 : 1)
  const loaderVisible = building && (interpreting || visibleCount < legs.length)
  return (
    <div
      className={`flight-leg-list ${result ? 'flight-leg-list--result' : 'flight-leg-list--fixed'} ${building ? 'flight-leg-list--building' : ''}`}
      style={!result ? {
        '--leg-count': legCount,
        '--visible-count': Math.min(visibleCount, legCount),
      } : undefined}
      aria-busy={building && loaderVisible}
    >
      {result && (
        <div className="result-leg-columns" role="row">
          <span role="columnheader" aria-label="Flight leg number" />
          <span role="columnheader">Flight</span>
          <span role="columnheader">Departure</span>
          <span role="columnheader">Arrival</span>
          <span role="columnheader">Cabin</span>
          <span role="columnheader">Award cost</span>
          <span role="columnheader">Cash value</span>
          <span
            className="point-value-heading"
            role="columnheader"
            tabIndex="0"
            aria-label="Point value. Net cents per point equals cash fare minus fees, divided by points."
            data-tooltip="Net cents per point: (cash fare − fees) / points"
          >
            Point value <span aria-hidden="true">ⓘ</span>
          </span>
        </div>
      )}
      {!result && (
        <div className="flight-leg-columns" aria-hidden="true">
          <span />
          <span>Flight leg</span>
          <span>Departure</span>
          <span>Arrival</span>
          <span>Cabin</span>
        </div>
      )}
      {visibleLegs.map((leg, index) => (
        (() => {
          const legIssues = issues.filter((issue) => issue.legIds.includes(leg.legId))
          const hasIssue = legIssues.length > 0
          const hasChanged = changedLegIds.includes(leg.legId)
          const isArrivalDeadline = /arrive_by/i.test(leg.timingKind || '')
          const isTripWindow = /trip_window/i.test(leg.timingKind || '')
          const departure = leg.departure || (isArrivalDeadline ? 'Flexible' : isTripWindow ? 'Within trip window' : leg.timing)
          const arrival = leg.arrival || (isTripWindow ? 'Flexible' : leg.timing)
          const fundingProgram = leg.economics?.fundingProgram
          const cashOnly = result && leg.economics?.fundingMode === 'cash'
          return (
          <div
            className={`flight-leg-row ${building ? 'flight-leg-row--building-ready' : ''} ${leg.pending ? 'pending' : ''} ${justResolved && leg.resolved ? 'flight-leg-row--just-resolved' : ''} ${hasChanged ? 'flight-leg-row--changed' : ''} ${hasIssue ? 'flight-leg-row--warning' : ''}`}
            key={leg.legId || `${leg.route}-${index}`}
            style={{ '--tile-delay': building ? '0ms' : `${index * (result ? 48 : 70)}ms`, ...(!result ? { gridRow: index + 1 } : {}) }}
            aria-label={hasIssue ? `${leg.route}. ${legIssues[0].message}` : undefined}
            data-funding-program-id={result ? fundingProgram?.id || 'cash' : undefined}
            data-pricing-source={result ? leg.economics?.source : undefined}
          >
            <span className="leg-number">
              {hasIssue ? <CircleAlert className="leg-warning-icon" size={14} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}
            </span>
            <div className="leg-route">
              {result && <span>{leg.detail}{fundingProgram ? ` · ${fundingProgram.name}` : ' · Cash fare'}</span>}
              <strong>{normalizeItineraryText(leg.route)}</strong>
            </div>
            <div className="leg-timing">
              <strong>{normalizeItineraryText(departure)}</strong>
            </div>
            <div className="leg-arrival"><strong>{normalizeItineraryText(arrival)}</strong></div>
            <div className="leg-cabin">
              <strong>{normalizeItineraryText(leg.cabin)}</strong>
            </div>
            {result && (
              <>
                <div className="leg-cost">
                  <strong>{cashOnly ? `$${formatNumber(leg.economics.cashValue)} cash` : `${formatNumber(leg.economics.points)} points`}</strong>
                  <small>{cashOnly ? 'No program connected' : `${fundingProgram.name} · + $${formatNumber(leg.economics.fees)}`}</small>
                </div>
                <div className="leg-cash-value"><strong>${formatNumber(leg.economics.cashValue)}</strong></div>
                <div className="leg-point-value"><strong>{cashOnly ? '—' : `${leg.economics.pointValue.toFixed(1)}¢`}</strong><small>{cashOnly ? 'cash only' : 'per point'}</small></div>
              </>
            )}
          </div>
          )
        })()
      ))}
      {loaderVisible && (
        <div
          className="building-leg-loader"
          style={{ gridRow: Math.min(visibleCount, legCount) + 1 }}
          aria-hidden="true"
        >
          <i />
          <span>{interpreting ? 'Preparing flight legs…' : visibleCount === 0 ? 'Identifying first flight leg…' : 'Identifying next flight leg…'}</span>
        </div>
      )}
      {building && (
        <span className="sr-only" role="status" aria-live="polite">
          {visibleCount > 0 ? `Flight leg ${visibleCount} of ${legs.length} added.` : 'Identifying flight legs.'}
        </span>
      )}
    </div>
  )
}

function ProgramPicker({
  linked,
  linkedAccountDetails,
  onToggle,
  onAwardWalletConnect,
  onAwardWalletDisconnect,
  onRevealComplete,
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [connectionProgram, setConnectionProgram] = useState(null)
  const [connectingId, setConnectingId] = useState(null)
  const [justLinkedIds, setJustLinkedIds] = useState([])
  const [awardWalletAccount, setAwardWalletAccount] = useState(null)
  const [awardWalletImportedIds, setAwardWalletImportedIds] = useState([])
  const [displayedProgramIds, setDisplayedProgramIds] = useState(() => (
    programs.filter((program) => program.featured).map((program) => program.id)
  ))
  const [tilesRevealed, setTilesRevealed] = useState(false)
  const searchTileRef = useRef(null)
  const linkedAnimationTimer = useRef(null)
  const pendingAnimationIds = useRef([])
  const linkedRef = useRef(linked)
  const displayedProgramIdsRef = useRef(displayedProgramIds)
  linkedRef.current = linked
  displayedProgramIdsRef.current = displayedProgramIds
  const displayedPrograms = displayedProgramIds
    .map((programId) => programs.find((program) => program.id === programId))
    .filter(Boolean)
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    window.setTimeout(() => searchTileRef.current?.focus(), 0)
  }, [])
  const focusProgramTile = useCallback((programId) => {
    window.setTimeout(() => document.querySelector(`[data-program-id="${programId}"]`)?.focus(), 0)
  }, [])
  const handleProgramAction = useCallback((program) => {
    if (program.isAggregator && awardWalletAccount) {
      onAwardWalletDisconnect(awardWalletImportedIds)
      setAwardWalletAccount(null)
      setAwardWalletImportedIds([])
      return
    }
    if (linked.includes(program.id)) {
      onToggle(program.id)
      return
    }
    setSearchOpen(false)
    setConnectionProgram(program)
  }, [awardWalletAccount, awardWalletImportedIds, linked, onAwardWalletDisconnect, onToggle])
  const startConnection = useCallback((program) => {
    setConnectingId(program.id)
  }, [])
  const completeConnection = useCallback((program, accountDetails) => {
    if (program.isAggregator) {
      const importedIds = AWARDWALLET_PROGRAM_IDS.filter((programId) => !linkedRef.current.includes(programId))
      const nextDisplayedIds = [...displayedProgramIdsRef.current]
      AWARDWALLET_PROGRAM_IDS.forEach((programId) => {
        if (nextDisplayedIds.includes(programId)) return
        const replacementIndex = nextDisplayedIds.findLastIndex((displayedId) => (
          !AWARDWALLET_PROGRAM_IDS.includes(displayedId) && !linkedRef.current.includes(displayedId)
        ))
        if (replacementIndex >= 0) nextDisplayedIds[replacementIndex] = programId
      })
      if (nextDisplayedIds.some((programId, index) => programId !== displayedProgramIdsRef.current[index])) {
        displayedProgramIdsRef.current = nextDisplayedIds
        setDisplayedProgramIds(nextDisplayedIds)
      }
      setAwardWalletImportedIds(importedIds)
      setAwardWalletAccount({ ...accountDetails, programCount: AWARDWALLET_PROGRAM_IDS.length })
      onAwardWalletConnect(AWARDWALLET_PROGRAM_IDS)
      pendingAnimationIds.current = [program.id, ...importedIds]
    } else {
      onToggle(program.id, accountDetails)
      pendingAnimationIds.current = [program.id]
    }
    setConnectingId(null)
  }, [onAwardWalletConnect, onToggle])
  const finishConnection = useCallback((program) => {
    if (!program.isAggregator && !displayedProgramIdsRef.current.includes(program.id)) {
      const currentIds = displayedProgramIdsRef.current
      const replacementIndex = currentIds.findLastIndex((programId) => !linkedRef.current.includes(programId))
      if (replacementIndex >= 0) {
        const nextIds = [...currentIds]
        nextIds[replacementIndex] = program.id
        displayedProgramIdsRef.current = nextIds
        setDisplayedProgramIds(nextIds)
      }
    }
    setConnectionProgram(null)
    setJustLinkedIds(pendingAnimationIds.current)
    if (linkedAnimationTimer.current) window.clearTimeout(linkedAnimationTimer.current)
    linkedAnimationTimer.current = window.setTimeout(() => setJustLinkedIds([]), 1100)
    focusProgramTile(program.id)
  }, [focusProgramTile])
  const closeConnection = useCallback(() => {
    const programId = connectionProgram?.id
    setConnectingId(null)
    setConnectionProgram(null)
    if (programId) focusProgramTile(programId)
  }, [connectionProgram, focusProgramTile])

  useEffect(() => () => {
    if (linkedAnimationTimer.current) window.clearTimeout(linkedAnimationTimer.current)
  }, [])

  return (
    <>
      <div className="program-picker">
        <div className={`program-grid ${tilesRevealed ? 'program-grid--revealed' : ''}`}>
          {displayedPrograms.map((program, index) => (
            <ProgramTile
              key={program.id}
              program={program}
              index={index}
              linked={linked}
              accountDetails={linkedAccountDetails}
              connecting={connectingId === program.id}
              justLinked={justLinkedIds.includes(program.id)}
              onAction={handleProgramAction}
            />
          ))}
          <ProgramTile
            program={AWARDWALLET_CONNECTOR}
            index={displayedPrograms.length}
            linked={awardWalletAccount ? [AWARDWALLET_CONNECTOR.id] : []}
            accountDetails={awardWalletAccount ? { [AWARDWALLET_CONNECTOR.id]: awardWalletAccount } : {}}
            connecting={connectingId === AWARDWALLET_CONNECTOR.id}
            justLinked={justLinkedIds.includes(AWARDWALLET_CONNECTOR.id)}
            onAction={handleProgramAction}
          />
          <button
            ref={searchTileRef}
            className="program-tile program-tile--search"
            onClick={() => setSearchOpen(true)}
            onAnimationEnd={(event) => {
              if (event.animationName !== 'tileEnter') return
              setTilesRevealed(true)
              onRevealComplete?.()
            }}
            style={{ '--tile-delay': `${Math.floor(displayedPrograms.length / 2) * PROGRAM_ROW_REVEAL_DELAY}ms` }}
            aria-label="Search for another rewards program"
          >
            <span className="program-logo program-logo--search">•••</span>
            <span className="program-copy"><strong>Missing program?</strong><small>Search</small></span>
            <span className="program-action"><Search size={13} /></span>
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {linked.length ? `${linked.length} rewards program${linked.length === 1 ? '' : 's'} connected.` : ''}
          {awardWalletAccount ? ' AwardWallet connected.' : ''}
        </span>
      </div>
      {searchOpen && createPortal(
        <ProgramSearchModal
          linked={linked}
          linkedAccountDetails={linkedAccountDetails}
          displayedProgramIds={displayedProgramIds}
          onProgramAction={handleProgramAction}
          onClose={closeSearch}
        />,
        document.body,
      )}
      {connectionProgram && createPortal(
        <ProgramConnectionModal
          program={connectionProgram}
          onConnectionStart={startConnection}
          onConnected={completeConnection}
          onFinished={finishConnection}
          onClose={closeConnection}
        />,
        document.body,
      )}
    </>
  )
}

function ProgramTile({ program, index, linked, accountDetails = {}, connecting, justLinked, onAction }) {
  const isLinked = linked.includes(program.id)
  const account = accountDetails[program.id]
  const isUserProvided = account?.method === 'manual'
  const connectedSummary = program.isAggregator && account
    ? `${account.programCount || AWARDWALLET_PROGRAM_IDS.length} programs connected`
    : account
      ? isUserProvided
        ? `${formatNumber(account.balance)} pts · User-provided`
        : `${formatNumber(account.balance)} points${account.status ? ` · ${account.status}` : ''}`
      : `${formatNumber(program.balance)} points`
  return (
    <button
      className={`program-tile ${isLinked ? 'linked' : ''} ${isUserProvided ? 'user-provided' : ''} ${connecting ? 'linking' : ''} ${justLinked ? 'just-linked' : ''}`}
      data-program-id={program.id}
      onClick={() => onAction(program)}
      style={{ '--tile-delay': `${Math.floor(index / 2) * PROGRAM_ROW_REVEAL_DELAY}ms` }}
      aria-pressed={isLinked}
      aria-busy={connecting}
      aria-label={`${connecting ? 'Connecting' : isLinked ? 'Disconnect' : 'Connect'} ${program.name}${isLinked ? `, ${connectedSummary}` : ''}`}
      disabled={connecting}
    >
      <span className="program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
      <span className="program-copy"><strong>{program.isAggregator && !isLinked ? 'Connect AwardWallet' : program.name}</strong><small>{isLinked ? connectedSummary : program.program}</small></span>
      <span className="program-action">{connecting ? <i /> : isLinked ? isUserProvided ? <Minus size={14} /> : <Check size={14} /> : '+'}</span>
    </button>
  )
}

function GoogleSignInButton({ onAuthenticated }) {
  const hostRef = useRef(null)
  const [mode, setMode] = useState(GOOGLE_CLIENT_ID ? 'loading' : 'fallback')

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined
    let cancelled = false
    googleCredentialHandler = (response) => {
      if (response?.credential) onAuthenticated()
    }
    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !hostRef.current) return
        if (!googleIdentityInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => googleCredentialHandler?.(response),
            ux_mode: 'popup',
          })
          googleIdentityInitialized = true
        }
        hostRef.current.replaceChildren()
        window.google.accounts.id.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 396,
        })
        setMode('official')
      })
      .catch(() => !cancelled && setMode('fallback'))
    return () => {
      cancelled = true
    }
  }, [onAuthenticated])

  return (
    <div className="google-signin-slot" data-google-mode={mode}>
      <div className="google-signin-official" ref={hostRef} />
      {mode !== 'official' && (
        <button className="google-signin-fallback" type="button" onClick={onAuthenticated} disabled={mode === 'loading'}>
          <svg aria-hidden="true" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.613Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.182l-2.909-2.258c-.806.54-1.835.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A8.998 8.998 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A8.998 8.998 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
          </svg>
          <span>Sign in with Google</span>
        </button>
      )}
    </div>
  )
}

function GoogleFlowButton({ onClick }) {
  return (
    <button className="google-signin-fallback google-signin-fallback--static" type="button" onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.613Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.182l-2.909-2.258c-.806.54-1.835.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A8.998 8.998 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A8.998 8.998 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
      </svg>
      <span>Sign in with Google</span>
    </button>
  )
}

function getProgramLoginHost(program) {
  const slug = program.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)
  return `secure.${slug || 'rewards'}.com`
}

function ProgramConnectionModal({ program, onConnectionStart, onConnected, onFinished, onClose }) {
  const [phase, setPhase] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [manualBalance, setManualBalance] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [manualError, setManualError] = useState('')
  const [connectedAccount, setConnectedAccount] = useState(null)
  const dialogRef = useRef(null)
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)
  const connectionTimers = useRef([])

  const queueConnectionTimer = (callback, delay) => {
    const timer = window.setTimeout(() => {
      connectionTimers.current = connectionTimers.current.filter((timerId) => timerId !== timer)
      callback()
    }, delay)
    connectionTimers.current.push(timer)
  }

  const beginConnection = useCallback((details = {}) => {
    const accountDetails = {
      balance: details.balance ?? program.balance,
      status: details.method === 'manual' ? null : getMockAccountStatus(program),
      method: details.method || 'credentials',
      ...(program.isAggregator ? { programCount: AWARDWALLET_PROGRAM_IDS.length } : {}),
    }
    setError('')
    setManualError('')
    setConnectedAccount(accountDetails)
    setPhase('connecting')
    onConnectionStart(program)
    queueConnectionTimer(() => {
      setPhase('success')
      onConnected(program, accountDetails)
      queueConnectionTimer(() => onFinished(program), 2100)
    }, CONNECTION_PROGRESS_MS)
  }, [onConnected, onConnectionStart, onFinished, program])

  const submitCredentials = (event) => {
    event.preventDefault()
    if (!username.trim()) {
      setError('Enter a username or email to continue.')
      usernameRef.current?.focus()
      return
    }
    if (!password) {
      setError('Enter your password to continue.')
      passwordRef.current?.focus()
      return
    }
    beginConnection({ method: 'credentials' })
  }

  const submitManualBalance = (event) => {
    event.preventDefault()
    const balance = Number(manualBalance.replace(/,/g, ''))
    if (!Number.isSafeInteger(balance) || balance < 0) {
      setManualError('Enter a whole-number balance of zero or greater.')
      return
    }
    const accountDetails = { balance, status: null, method: 'manual' }
    setError('')
    setManualError('')
    setConnectedAccount(accountDetails)
    setPhase('success')
    onConnected(program, accountDetails)
    queueConnectionTimer(() => onFinished(program), 2100)
  }

  const beginGoogleNavigation = () => {
    setPhase('navigating')
    queueConnectionTimer(() => setPhase('provider'), GOOGLE_NAVIGATION_CUE_MS)
  }

  useEffect(() => {
    const focusTimer = window.setTimeout(() => usernameRef.current?.focus(), 100)
    return () => window.clearTimeout(focusTimer)
  }, [])

  useEffect(() => {
    if (phase !== 'login') dialogRef.current?.focus()
  }, [phase])

  useEffect(() => {
    const handleDialogKeys = (event) => {
      if (event.key === 'Escape' && ['login', 'navigating', 'provider'].includes(phase)) {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleDialogKeys)
    return () => window.removeEventListener('keydown', handleDialogKeys)
  }, [onClose, phase])

  useEffect(() => () => {
    connectionTimers.current.forEach(window.clearTimeout)
    connectionTimers.current = []
  }, [])

  return (
    <div className="connection-backdrop" onMouseDown={(event) => event.target === event.currentTarget && ['login', 'navigating', 'provider'].includes(phase) && onClose()}>
      <section
        ref={dialogRef}
        className={`connection-modal connection-modal--${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
        aria-describedby="connection-description"
        tabIndex="-1"
      >
        <header className="connection-modal-bar">
          <span><LockKeyhole size={12} /> Secure connection</span>
          {['login', 'navigating', 'provider'].includes(phase) && <button onClick={onClose} aria-label={`Close ${program.name} sign-in`}><X size={16} /></button>}
        </header>

        {phase === 'login' && (
          <div className="connection-login">
            <div className="connection-program-brand">
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <span>Powered by <strong>{program.name}</strong></span>
            </div>
            <h2 id="connection-title">Sign in to {program.name}</h2>
            <p id="connection-description">{program.isAggregator
              ? 'Bring your existing rewards portfolio into Vetra in one step.'
              : `Connect ${program.program} so Vetra can include your balance in this search.`}</p>

            <form className="connection-form" onSubmit={submitCredentials} noValidate>
              <label>
                <span>Username or email</span>
                <input
                  ref={usernameRef}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="name@example.com"
                  aria-invalid={Boolean(error && !username.trim())}
                />
              </label>
              <label>
                <span>Password</span>
                <div className="connection-password-field">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={Boolean(error && username.trim() && !password)}
                  />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>
              {error && <p className="connection-error" role="alert"><CircleAlert size={13} /> {error}</p>}
              <button className="connection-submit" type="submit">Sign in</button>
            </form>

            <div className="connection-divider"><span>or</span></div>
            <div className="google-signin-slot">
              <GoogleFlowButton onClick={beginGoogleNavigation} />
            </div>

            {!program.isAggregator && (
              <>
                <div className="connection-divider connection-divider--manual"><span>or add points manually</span></div>
                <form className="connection-manual" onSubmit={submitManualBalance} noValidate>
                  <label>
                    <span className="sr-only">Current points balance</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={manualBalance}
                      onChange={(event) => setManualBalance(event.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Current points balance"
                      aria-label="Current points balance"
                      aria-invalid={Boolean(manualError)}
                    />
                  </label>
                  <button type="submit">Use balance</button>
                </form>
                {manualError && <p className="connection-error connection-error--manual" role="alert"><CircleAlert size={13} /> {manualError}</p>}
              </>
            )}
          </div>
        )}

        {phase === 'navigating' && (
          <div className="connection-navigation-cue" aria-live="polite">
            <div className="navigation-cue-window" aria-hidden="true">
              <div className="provider-browser-bar">
                <span /><span /><span />
                <strong><LockKeyhole size={10} /> {getProgramLoginHost(program)}</strong>
              </div>
              <div className="navigation-cue-brand" style={{ '--provider-color': program.color, '--provider-tint': program.tint }}>
                <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
                <i />
              </div>
            </div>
            <span className="connection-eyebrow">Opening secure sign-in</span>
            <h2 id="connection-title">Taking you to {program.name}</h2>
            <p id="connection-description">Loading the {program.program} sign-in page…</p>
            <span className="navigation-progress" aria-hidden="true"><i /></span>
          </div>
        )}

        {phase === 'provider' && (
          <div className="provider-interstitial">
            <div className="provider-browser-bar" aria-label={`${program.name} secure rewards login`}>
              <span /><span /><span />
              <strong><LockKeyhole size={10} /> {getProgramLoginHost(program)}</strong>
            </div>
            <div className="provider-brand-strip" style={{ '--provider-color': program.color, '--provider-tint': program.tint }}>
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <strong>{program.name}</strong>
            </div>
            <div className="provider-login-card">
              <span className="connection-eyebrow">{program.program}</span>
              <h2 id="connection-title">Welcome back</h2>
              <p id="connection-description">Continue with Google to sign in securely to your {program.name} rewards account.</p>
              <GoogleSignInButton onAuthenticated={() => beginConnection({ method: 'google' })} />
              <small><LockKeyhole size={11} /> You’ll return to Vetra after signing in.</small>
            </div>
          </div>
        )}

        {phase === 'connecting' && (
          <div className="connection-progress" aria-live="polite">
            <div className="connection-bridge" aria-hidden="true">
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <span className="connection-bridge-track"><i /><i /><i /></span>
              <span className="connection-vetra-mark"><img src={vetraMark} alt="" aria-hidden="true" /></span>
            </div>
            <h2 id="connection-title">Securely connecting</h2>
            <p id="connection-description" className="sr-only">Connecting {program.name} to Vetra.</p>
          </div>
        )}

        {phase === 'success' && (
          <div className={`connection-success ${connectedAccount?.method === 'manual' ? 'connection-success--provided' : ''}`} aria-live="polite">
            <span className={`connection-success-mark ${connectedAccount?.method === 'manual' ? 'connection-success-mark--provided' : ''}`}>
              {connectedAccount?.method === 'manual' ? <Minus size={33} /> : <CheckCircle2 size={33} />}
            </span>
            <span className="connection-eyebrow">{connectedAccount?.method === 'manual' ? 'Balance added' : 'Connection complete'}</span>
            <h2 id="connection-title">{connectedAccount?.method === 'manual' ? `${program.name} balance added` : `${program.name} is connected`}</h2>
            <p id="connection-description">{connectedAccount?.method === 'manual'
              ? 'We’ll use the balance you provided for this search.'
              : program.isAggregator
                ? `${AWARDWALLET_PROGRAM_IDS.length} rewards programs are now connected and ready to use.`
                : 'Your rewards balance and account status are ready to use in this search.'}</p>
            <div className={`connection-balance ${connectedAccount?.method === 'manual' ? 'connection-balance--provided' : ''}`}>
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <div>
                <small>{connectedAccount?.method === 'manual'
                  ? 'User-provided balance'
                  : program.isAggregator
                    ? program.program
                    : connectedAccount?.status || program.program}</small>
                <strong>{program.isAggregator
                  ? `${connectedAccount?.programCount || AWARDWALLET_PROGRAM_IDS.length} programs connected`
                  : `${formatNumber(connectedAccount?.balance ?? program.balance)} points`}</strong>
              </div>
              {connectedAccount?.method === 'manual' ? <Minus size={15} /> : <Check size={15} />}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function ProgramSearchModal({ linked, linkedAccountDetails, displayedProgramIds, onProgramAction, onClose }) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PROGRAM_SEARCH_PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const loadMoreTimer = useRef(null)
  const searchablePrograms = useMemo(() => (
    programs.filter((program) => !displayedProgramIds.includes(program.id))
  ), [displayedProgramIds])
  const filteredPrograms = searchablePrograms.filter((program) => {
    const haystack = `${program.name} ${program.program}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  const visiblePrograms = filteredPrograms.slice(0, visibleCount)

  useEffect(() => {
    if (loadMoreTimer.current) window.clearTimeout(loadMoreTimer.current)
    loadMoreTimer.current = null
    setLoadingMore(false)
    setVisibleCount(PROGRAM_SEARCH_PAGE_SIZE)
    if (listRef.current) listRef.current.scrollTop = 0
  }, [query])

  const loadMorePrograms = () => {
    if (loadingMore || visibleCount >= filteredPrograms.length) return
    setLoadingMore(true)
    loadMoreTimer.current = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + PROGRAM_SEARCH_PAGE_SIZE, filteredPrograms.length))
      setLoadingMore(false)
      loadMoreTimer.current = null
    }, 1000)
  }

  const handleProgramScroll = (event) => {
    const list = event.currentTarget
    if (!loadingMore && list.scrollHeight - list.scrollTop - list.clientHeight <= 32 && visibleCount < filteredPrograms.length) {
      loadMorePrograms()
    }
  }

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
      if (loadMoreTimer.current) window.clearTimeout(loadMoreTimer.current)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="program-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="program-modal" role="dialog" aria-modal="true" aria-labelledby="program-search-title">
        <header className="program-modal-heading">
          <div>
            <h2 id="program-search-title">Find your program</h2>
            <p>Search additional airline and card rewards programs.</p>
          </div>
          <button onClick={onClose} aria-label="Close program search"><X size={17} /></button>
        </header>
        <label className="program-search-field">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search programs"
            aria-label="Search rewards programs"
          />
        </label>
        <div
          className="program-search-list"
          ref={listRef}
          onScroll={handleProgramScroll}
          tabIndex="0"
          aria-label="Rewards programs"
          data-testid="program-search-list"
        >
          {visiblePrograms.map((program) => {
            const isLinked = linked.includes(program.id)
            const account = linkedAccountDetails[program.id]
            const isUserProvided = account?.method === 'manual'
            const connectedSummary = account
              ? isUserProvided
                ? `${formatNumber(account.balance)} pts · User-provided`
                : `${formatNumber(account.balance)} points${account.status ? ` · ${account.status}` : ''}`
              : `${formatNumber(program.balance)}-point balance connected`
            return (
              <button
                key={program.id}
                className={`program-search-result ${isLinked ? 'linked' : ''} ${isUserProvided ? 'user-provided' : ''}`}
                onClick={() => onProgramAction(program)}
                aria-pressed={isLinked}
              >
                <span className="program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
                <span className="program-copy"><strong>{program.name}</strong><small>{isLinked ? connectedSummary : program.program}</small></span>
                <span className="program-action">{isLinked ? isUserProvided ? <Minus size={14} /> : <Check size={14} /> : '+'}</span>
              </button>
            )
          })}
          {!filteredPrograms.length && <div className="program-search-empty">No matching rewards program found.</div>}
          {visiblePrograms.length > 0 && (
            <div className="program-search-progress" role="status" aria-live="polite">
              {loadingMore
                ? <span className="program-search-loading"><i /> Loading 20 more programs…</span>
                : visiblePrograms.length < filteredPrograms.length
                ? `Showing ${visiblePrograms.length} of ${filteredPrograms.length} programs · scroll for more`
                : `All ${filteredPrograms.length} programs loaded`}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function OptimizationView({ step, linkedPrograms, recommendations, finishing, brief, onFlightComplete }) {
  const stages = getOptimizationStages({
    linkedProgramCount: linkedPrograms.length,
    legCount: brief?.flightLegs?.length || 0,
    candidateCount: recommendations.length,
  })
  return (
    <main className={`optimization-view ${finishing ? 'optimization-view--finishing' : ''}`}>
      <Suspense fallback={<div className="flight-globe flight-globe--loading" aria-label="Preparing animated route" />}>
        <FlightGlobe brief={brief} onFirstTraversalComplete={onFlightComplete} />
      </Suspense>
      <section className="optimization-copy" aria-live="polite">
        <span className="step-label">Intelligent optimization</span>
        <h1>Building your best ways to fly.</h1>
        <div className="optimization-list">
          {stages.map((stage, index) => (
            <div className={index < step ? 'complete' : index === step ? 'active' : ''} key={stage.label}>
              <span className="stage-dot">{index < step ? <Check size={12} /> : index === step ? <i /> : null}</span>
              <div><strong>{stage.label}</strong><small>{index <= step ? stage.meta : ''}</small></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function ResultsView({ linkedPrograms, totalBalance, brief, recommendations, expanded, onExpand, onReset }) {
  return (
    <main className="results-view">
      <section className="results-heading">
        <span className="step-label"><Sparkles size={13} /> Optimization complete</span>
        <h1>Three strong ways to make this trip work.</h1>
        <p>{linkedPrograms.length ? `${formatNumber(totalBalance)} points across connected rewards programs were considered.` : 'No rewards programs were connected, so cash fares are shown.'}</p>
      </section>
      <section className="results-itinerary-handoff" aria-labelledby="finalized-itinerary-title">
        <header>
          <h2 id="finalized-itinerary-title">{normalizeItineraryText(brief?.route)}</h2>
        </header>
        <div className="results-plan-legs" style={{ '--plan-leg-count': Math.max(brief?.flightLegs?.length || 0, 1) }}>
          {(brief?.flightLegs || []).map((leg, index) => (
            <div key={leg.legId}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{normalizeItineraryText(leg.route)}</strong>
              <small>{normalizeItineraryText(leg.timing)}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="result-list">
        {recommendations.map((result, index) => (
          <article
            className={`result-card ${expanded === index ? 'expanded' : ''}`}
            data-funding-mode={result.economics.fundingMode}
            data-program-ids={result.fundingPrograms.map((program) => program.id).join(',') || 'cash'}
            key={result.title}
            style={{ '--result-color': result.color, '--tile-delay': `${index * 90}ms` }}
          >
            <button className="result-summary" data-testid={`result-summary-${index + 1}`} onClick={() => onExpand(expanded === index ? -1 : index)} aria-expanded={expanded === index}>
              <span className="result-rank">0{index + 1}</span>
              <span className="result-title"><small>{result.label}</small><strong>{result.title}</strong></span>
              <span className="result-metric"><small>Trip total</small><strong>{result.points}</strong><em>{result.fees}</em></span>
              <span className="result-metric"><small>Point value</small><strong>{result.value}</strong></span>
              <span className="result-score"><strong>{result.score}</strong><small>Vetra score</small></span>
              <span className="result-chevron">⌄</span>
            </button>
            <div className="result-detail-shell" aria-hidden={expanded !== index}>
              <div className="result-detail-clip" inert={expanded !== index}>
                <div className="result-detail">
                  <section className="result-flight-plan">
                    <FlightLegRows legs={result.segments} result />
                  </section>
                  <aside className="result-rationale">
                    <div className="detail-heading"><strong>Rationale</strong></div>
                    <p className="result-rationale-summary">{result.detail}</p>
                    <div className="tradeoff-groups">
                      <section className="tradeoff-group tradeoff-group--pros">
                        <h3><Check size={12} /> {result.pros.length} {result.pros.length === 1 ? 'Pro' : 'Pros'}</h3>
                        <ul>
                          {result.pros.map((pro) => <li key={pro}>{pro}</li>)}
                        </ul>
                      </section>
                      <section className="tradeoff-group tradeoff-group--cons">
                        <h3><X size={12} /> {result.cons.length} {result.cons.length === 1 ? 'Con' : 'Cons'}</h3>
                        <ul>
                          {result.cons.map((con) => <li key={con}>{con}</li>)}
                        </ul>
                      </section>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
      <button className="new-trip-button" onClick={onReset}>Plan another trip <ArrowRight size={15} /></button>
    </main>
  )
}

export default App
