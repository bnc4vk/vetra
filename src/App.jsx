import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  RotateCcw,
  Search,
  ShieldCheck,
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
import { buildDemoRecommendations } from './flightRecommendations'

const WELCOME_COPY =
  'Welcome to Vetra, the intelligent flights agent personalized to your travel style and award balances.'
const PROMPT_COPY = "Tell me where you need to be. I’ll get started on the trip planning."
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
const DEV_BRIEF = DEV_ADJUST_MODE || DEV_RESULTS_MODE ? {
  raw: DEV_STEP3_BRIEF,
  revision: 0,
  appliedOperationIds: [],
  travelers: 'Travelers Not Specified',
  flexibility: 'Two-Week Trip',
  tripDurationDays: 14,
  tripSummary: '14-Day Trip',
  cities: ['New York', 'Tokyo', 'Seoul', 'New York'],
  route: 'New York → Tokyo → Seoul → New York',
  followUpQuestions: [],
  flightLegs: [
    { legId: 'dev-leg-1', route: 'New York → Tokyo', origin: 'New York', originKind: 'city', destination: 'Tokyo', destinationKind: 'city', timing: 'Arrive By Nov 12', timingKind: 'arrive_by', timingEvidence: 'explicit', cabin: 'Not Specified', cabinEvidence: 'missing', detail: 'Tokyo Arrival Required', status: 'captured', statusLabel: 'Captured', pending: false, resolved: false },
    { legId: 'dev-leg-2', route: 'Tokyo → Seoul', origin: 'Tokyo', originKind: 'city', destination: 'Seoul', destinationKind: 'city', timing: 'Within Two-Week Trip', timingKind: 'trip_window', timingEvidence: 'implied', cabin: 'Not Specified', cabinEvidence: 'missing', detail: 'South Korea Stop', status: 'captured', statusLabel: 'Captured', pending: false, resolved: false },
    { legId: 'dev-leg-3', route: 'Seoul → New York', origin: 'Seoul', originKind: 'city', destination: 'New York', destinationKind: 'city', timing: 'Within Two-Week Trip', timingKind: 'trip_window', timingEvidence: 'implied', cabin: 'Not Specified', cabinEvidence: 'missing', detail: 'Return Home', status: 'suggested', statusLabel: 'Return Implied', pending: false, resolved: false },
  ],
  source: { kind: 'dev', model: 'gpt-5.4-2026-03-05', contractVersion: 'itinerary-intent/v1' },
} : null
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
  rewardsReveal: 720,
  awardsExit: 480,
  adjustmentMinProcess: 720,
  adjustmentSettle: 380,
  adjustmentCopy: 110,
  optimizationStages: [1250, 1450, 1300, 1650],
  optimizationExit: 380,
}

const programs = [
  { id: 'amex', name: 'Amex', program: 'Membership Rewards', mark: 'AM', balance: 342800, color: '#1769aa', tint: '#eaf5ff', featured: true },
  { id: 'chase', name: 'Chase', program: 'Ultimate Rewards', mark: 'CH', balance: 186400, color: '#146b5b', tint: '#e8f6f1', featured: true },
  { id: 'capitalone', name: 'Capital One', program: 'Miles', mark: 'C1', balance: 91800, color: '#a01f46', tint: '#fff0f4', featured: true },
  { id: 'citi', name: 'Citi', program: 'ThankYou Rewards', mark: 'CI', balance: 128600, color: '#056dae', tint: '#eaf5fb', featured: true },
  { id: 'bilt', name: 'Bilt', program: 'Rewards', mark: 'BI', balance: 74600, color: '#2d3132', tint: '#f0f1f1', featured: true },
  { id: 'american', name: 'American', program: 'AAdvantage', mark: 'AA', balance: 84400, color: '#c3273c', tint: '#fff0f2', featured: true },
  { id: 'united', name: 'United', program: 'MileagePlus', mark: 'UA', balance: 62100, color: '#174ea6', tint: '#edf3ff', featured: true },
  { id: 'delta', name: 'Delta', program: 'SkyMiles', mark: 'DL', balance: 53750, color: '#9b1834', tint: '#fff0f4', featured: true },
  { id: 'southwest', name: 'Southwest', program: 'Rapid Rewards', mark: 'WN', balance: 47600, color: '#304cb2', tint: '#eef1ff', featured: true },
  { id: 'aeroplan', name: 'Aeroplan', program: 'Air Canada', mark: 'AC', balance: 41250, color: '#d8292f', tint: '#fff0f0', featured: true },
  { id: 'flyingblue', name: 'Flying Blue', program: 'Air France · KLM', mark: 'FB', balance: 28750, color: '#293893', tint: '#eef0ff', featured: true },
  { id: 'alaska', name: 'Alaska', program: 'Atmos Rewards', mark: 'AS', balance: 36400, color: '#005f6a', tint: '#e9f6f7', featured: true },
  { id: 'jetblue', name: 'JetBlue', program: 'TrueBlue', mark: 'B6', balance: 23100, color: '#003876', tint: '#edf3fa', featured: true },
  { id: 'britishairways', name: 'British Airways', program: 'The British Airways Club', mark: 'BA', balance: 52900, color: '#1b3f8b', tint: '#eef2fb' },
  { id: 'virginatlantic', name: 'Virgin Atlantic', program: 'Flying Club', mark: 'VS', balance: 44750, color: '#c4143c', tint: '#fff0f4' },
  { id: 'singapore', name: 'Singapore Airlines', program: 'KrisFlyer', mark: 'SQ', balance: 31800, color: '#d19b2a', tint: '#fff8e8' },
  { id: 'emirates', name: 'Emirates', program: 'Skywards', mark: 'EK', balance: 26400, color: '#c52732', tint: '#fff0f1' },
  { id: 'qatar', name: 'Qatar Airways', program: 'Privilege Club', mark: 'QR', balance: 35600, color: '#6d1740', tint: '#f8edf2' },
  { id: 'cathay', name: 'Cathay Pacific', program: 'Asia Miles', mark: 'CX', balance: 24900, color: '#0c776c', tint: '#ebf7f5' },
  { id: 'turkish', name: 'Turkish Airlines', program: 'Miles&Smiles', mark: 'TK', balance: 21400, color: '#c5162e', tint: '#fff0f2' },
  { id: 'wellsfargo', name: 'Wells Fargo', program: 'Rewards', mark: 'WF', balance: 48600, color: '#b31b34', tint: '#fff0f2' },
  { id: 'avianca', name: 'Avianca', program: 'LifeMiles', mark: 'AV', balance: 33700, color: '#d71920', tint: '#fff0f0' },
  { id: 'qantas', name: 'Qantas', program: 'Frequent Flyer', mark: 'QF', balance: 29500, color: '#d51b2b', tint: '#fff0f1' },
  { id: 'etihad', name: 'Etihad Airways', program: 'Etihad Guest', mark: 'EY', balance: 27300, color: '#8a6c3d', tint: '#f8f3ea' },
  { id: 'korean', name: 'Korean Air', program: 'SKYPASS', mark: 'KE', balance: 19200, color: '#2369b3', tint: '#edf5fc' },
]

const optimizationStages = [
  { label: 'Mapping routes around your non-negotiables', meta: '41 paths considered' },
  { label: 'Checking award options across your programs', meta: '9 programs compared' },
  { label: 'Testing transfer combinations and fees', meta: '27 funding paths' },
  { label: 'Ranking the strongest complete itineraries', meta: '3 final strategies' },
]

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value)

function normalizeItineraryText(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,?\s*(?:plus or minus|\+\/?-)\s*one day/gi, ' · ±1 Day')
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase())
    .split(' ')
    .map((word) => {
      if (/^[A-Z]{2,}(?:\d+)?$/.test(word) || /^[±\d$]/.test(word)) return word
      return word.replace(/^([^A-Za-z]*)([A-Za-z])/, (_, prefix, first) => `${prefix}${first.toUpperCase()}`)
    })
    .join(' ')
}

function Brand() {
  return (
    <div className="brand" aria-label="Vetra">
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      <span>vetra</span>
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
      else if (/[:][”"']?$/.test(word)) punctuationPause = speed * 0.7
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
  const [phase, setPhase] = useState(DEV_RESULTS_MODE ? 'results' : DEV_ADJUST_MODE ? 'adjust' : DEV_STEP3_MODE ? 'intake' : 'welcome')
  const [draft, setDraft] = useState(DEV_STEP3_MODE ? DEV_STEP3_BRIEF : '')
  const [brief, setBrief] = useState(DEV_BRIEF)
  const [followUp, setFollowUp] = useState(null)
  const [linked, setLinked] = useState([])
  const [optimizationStep, setOptimizationStep] = useState(0)
  const [optimizationFinishing, setOptimizationFinishing] = useState(false)
  const [expandedResult, setExpandedResult] = useState(0)
  const [transitioning, setTransitioning] = useState(null)
  const [rewardsReady, setRewardsReady] = useState(false)
  const [preliminaryLegCount, setPreliminaryLegCount] = useState(0)
  const [interpretationReady, setInterpretationReady] = useState(false)
  const [interpretationError, setInterpretationError] = useState('')
  const [interpretationDuration, setInterpretationDuration] = useState(0)
  const [adjustmentError, setAdjustmentError] = useState('')
  const [changedLegIds, setChangedLegIds] = useState([])
  const [adjustmentCopyComplete, setAdjustmentCopyComplete] = useState(false)
  const [reviewCopyComplete, setReviewCopyComplete] = useState(false)
  const [reviewLegCapacity, setReviewLegCapacity] = useState(Math.max(DEV_BRIEF?.flightLegs?.length || 0, 3))
  const [introCopyComplete, setIntroCopyComplete] = useState(DEV_STEP3_MODE || DEV_ADJUST_MODE || DEV_RESULTS_MODE)
  const [introExiting, setIntroExiting] = useState(false)
  const introTimers = useRef([])
  const transitionTimers = useRef([])
  const optimizationTimer = useRef(null)
  const resultTimer = useRef(null)
  const introCompleteRef = useRef(DEV_STEP3_MODE || DEV_ADJUST_MODE || DEV_RESULTS_MODE)
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
        setPhase('rewards')
        setRewardsReady(false)
        scheduleTransition(() => setRewardsReady(true), MOTION.rewardsReveal)
      }
    }, finalRowStart + resolveDuration + finalHold))

    return () => {
      timers.forEach(window.clearTimeout)
      transitionTimers.current = transitionTimers.current.filter((timer) => !timers.includes(timer))
    }
  }, [phase, brief, followUp, interpretationDuration, interpretationReady])

  useEffect(() => {
    if (phase !== 'optimizing') return undefined
    setOptimizationStep(0)
    setOptimizationFinishing(false)
    let currentStep = 0
    const advanceOptimization = () => {
      optimizationTimer.current = window.setTimeout(() => {
        if (currentStep >= optimizationStages.length - 1) {
          setOptimizationFinishing(true)
          resultTimer.current = window.setTimeout(() => setPhase('results'), MOTION.optimizationExit)
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
      if (resultTimer.current) {
        window.clearTimeout(resultTimer.current)
        resultTimer.current = null
      }
    }
  }, [phase])

  const linkedPrograms = useMemo(() => programs.filter((program) => linked.includes(program.id)), [linked])
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
          setPhase('rewards')
          setFollowUp(null)
          setRewardsReady(false)
          scheduleTransition(() => setRewardsReady(true), MOTION.rewardsReveal)
        }
      }, MOTION.followUpSettle)
    }, MOTION.followUpProcess)
  }

  const toggleProgram = (programId) => {
    if (linked.includes(programId)) {
      setLinked((current) => current.filter((id) => id !== programId))
      return
    }
    setLinked((current) => current.includes(programId) ? current : [...current, programId])
  }

  const finishRewards = () => {
    if (transitioning) return
    setReviewLegCapacity(Math.max(brief?.flightLegs?.length || 0, 3))
    setTransitioning('rewards-exit')
    scheduleTransition(() => {
      setPhase('adjust')
      setAdjustmentCopyComplete(false)
      setReviewCopyComplete(false)
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
            setDraft('')
            setTransitioning('adjusted')
            scheduleTransition(() => {
              setReviewCopyComplete(false)
              setPhase('review')
              setTransitioning(null)
            }, MOTION.adjustmentSettle)
          } catch (error) {
            setTransitioning(null)
            setAdjustmentError(error.message)
          }
        }, wait)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setTransitioning(null)
        setAdjustmentError('I couldn’t tell what to change. Try naming the stop, date, or cabin.')
      })
  }

  const reviewWithoutChanges = () => {
    setDraft('')
    setAdjustmentError('')
    setReviewCopyComplete(false)
    setPhase('review')
  }

  const makeMoreChanges = () => {
    setChangedLegIds([])
    setAdjustmentError('')
    setAdjustmentCopyComplete(false)
    setReviewCopyComplete(false)
    setPhase('adjust')
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
    setOptimizationStep(0)
    setOptimizationFinishing(false)
    setExpandedResult(0)
    setTransitioning(null)
    setRewardsReady(false)
    setPreliminaryLegCount(0)
    setInterpretationReady(false)
    setInterpretationError('')
    setInterpretationDuration(0)
    setAdjustmentError('')
    setChangedLegIds([])
    setAdjustmentCopyComplete(false)
    setReviewCopyComplete(false)
    setReviewLegCapacity(3)
    setIntroCopyComplete(true)
    introCompleteRef.current = true
    setPhase('intake')
  }

  const isIntro = ['welcome', 'prompt', 'intake'].includes(phase)
  const workspacePhase = ['building', 'followup', 'rewards', 'adjust', 'review'].includes(phase)
  const requestedLegs = brief?.flightLegs || []
  const adjustmentBusy = transitioning === 'adjusting' || transitioning === 'adjusted'
  const reviewBlocked = itineraryIssues.length > 0
  const primaryIssueType = itineraryIssues[0]?.type
  const blockedReviewHeading = primaryIssueType === 'city'
    ? 'One stop still needs a city.'
    : primaryIssueType === 'timing'
      ? 'One date falls out of sequence.'
      : 'One connection needs a little more detail.'
  const blockedStatusLabel = primaryIssueType === 'city'
    ? 'City needed'
    : primaryIssueType === 'timing'
      ? 'Timing issue'
      : 'Continuity issue'

  return (
    <div className={`app app--${phase} ${transitioning ? `app--transition-${transitioning}` : ''}`}>
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
        <main className="journey-shell">
          <section className={`journey-conversation ${['rewards', 'adjust', 'review'].includes(phase) ? 'journey-conversation--rewards' : ''}`}>
            {phase === 'building' && (
              <div className="step-label" key={`${phase}-label`}>
                Building your trip
              </div>
            )}
            {phase === 'adjust' && <div className="step-label">Final check</div>}
            {phase === 'review' && <div className="step-label">{reviewBlocked ? 'Action needed' : 'Ready to search'}</div>}
            <h1 className={`journey-question ${['rewards', 'adjust', 'review'].includes(phase) ? 'journey-question--rewards' : ''}`} key={phase}>
              <WordReveal
                speed={phase === 'building' ? 76 : phase === 'adjust' ? MOTION.adjustmentCopy : MOTION.questionWord}
                onComplete={phase === 'adjust'
                  ? () => setAdjustmentCopyComplete(true)
                  : phase === 'review'
                    ? () => setReviewCopyComplete(true)
                    : undefined}
              >
                {phase === 'building'
                  ? interpretationError || 'I’m building a preliminary itinerary.'
                  : phase === 'followup'
                  ? followUp.question
                  : phase === 'rewards'
                    ? 'Let’s link.'
                    : phase === 'adjust'
                      ? 'Anything you’d like to change before I search?'
                      : reviewBlocked
                        ? blockedReviewHeading
                        : 'Your itinerary is ready.'}
              </WordReveal>
            </h1>
            {phase === 'rewards' && (
              <p className="rewards-subheader">Connect your airline and card rewards programs.</p>
            )}
            {phase === 'building' && (
              <p className="journey-support" key={`${phase}-support`}>
                {interpretationError
                  ? 'No itinerary details were substituted or guessed.'
                  : 'Mapping your route into complete flight legs'}
              </p>
            )}
            {phase === 'adjust' && (
              <p className="rewards-subheader">Add or remove flight legs alongside editing the timing and cabin details of an existing one.</p>
            )}
            {phase === 'review' && (
              <p className="rewards-subheader" id="itinerary-readiness-description">
                {reviewBlocked ? itineraryIssues[0].message : 'I’ll compare cash and award options across every complete route.'}
              </p>
            )}

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
                    placeholder={followUp.key === 'travelers' ? 'Just me' : 'Add the missing detail…'}
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
                <div className="left-program-stage">
                  {rewardsReady
                    ? <ProgramPicker linked={linked} onToggle={toggleProgram} />
                    : <div className="rewards-preparing"><span /> Preparing your programs…</div>}
                </div>
                {rewardsReady && (
                  <button className="done-button" onClick={finishRewards} disabled={Boolean(transitioning)}>
                    Done <ArrowRight size={17} />
                  </button>
                )}
              </div>
            ) : phase === 'adjust' ? (
              <div className={`adjustment-controls ${adjustmentCopyComplete ? 'is-ready' : ''}`}>
                {adjustmentCopyComplete && (
                  <>
                    <TripComposer
                      value={draft}
                      onChange={setDraft}
                      onSubmit={submitAdjustment}
                      placeholder="Add three nights in Kyoto, remove Honolulu, or fly home a day later…"
                      ariaLabel="Itinerary changes"
                      autoFocus
                      focusDelay={140}
                      busy={adjustmentBusy}
                      busyLabel="Applying that change…"
                    />
                    {adjustmentError && <p className="inline-error" role="status" aria-live="polite"><CircleAlert size={13} /> {adjustmentError}</p>}
                    {!adjustmentBusy && <button className="more-changes-button looks-good-button" onClick={reviewWithoutChanges}>Looks good as is</button>}
                  </>
                )}
              </div>
            ) : (
              <div className="review-action-slot">
                {reviewCopyComplete && (
                  <div className="review-controls">
                    <button
                      className="generate-button"
                      onClick={beginOptimization}
                      disabled={reviewBlocked || Boolean(transitioning)}
                      aria-describedby="itinerary-readiness-description"
                    >
                      Generate personalized flight paths <ArrowRight size={17} />
                    </button>
                    <button className="more-changes-button" onClick={makeMoreChanges}>Make more changes</button>
                  </div>
                )}
              </div>
            )}

          </section>

          <aside
            className="journey-summary"
            style={{
              '--summary-height': `${173 + (['adjust', 'review'].includes(phase)
                ? reviewLegCapacity
                : Math.max(requestedLegs.length, 3)) * 100}px`,
            }}
          >
            <div className="summary-heading">
              <div>
                <span className="step-label">Itinerary</span>
                <h2>{phase === 'building'
                  ? 'Preliminary itinerary'
                  : adjustmentBusy
                    ? 'Review your itinerary'
                    : phase === 'adjust'
                      ? 'Review your itinerary'
                      : phase === 'review' && reviewBlocked
                        ? 'Check your itinerary'
                        : phase === 'review'
                          ? 'Ready to search'
                  : transitioning === 'resolved'
                    ? 'Itinerary updated'
                    : phase === 'followup'
                      ? 'Taking shape'
                      : 'Ready to optimize'}</h2>
              </div>
              {phase !== 'followup' && <span role="status" aria-live="polite" className={`summary-status ${phase === 'building' || adjustmentBusy ? 'building' : ''} ${phase === 'rewards' || phase === 'adjust' || (phase === 'review' && !reviewBlocked) || transitioning === 'resolved' ? 'complete' : ''} ${phase === 'review' && reviewBlocked ? 'warning' : ''}`}>
                {(phase === 'rewards' || phase === 'adjust' || (phase === 'review' && !reviewBlocked) || transitioning === 'resolved') && <Check size={12} />}
                {phase === 'building'
                  ? interpretationError ? 'Stopped' : 'Building'
                  : adjustmentBusy
                    ? 'Updating'
                    : phase === 'review' && reviewBlocked
                      ? <><CircleAlert size={12} /> {blockedStatusLabel}</>
                      : 'Complete'}
              </span>}
            </div>
            <FlightLegRows
              legs={requestedLegs}
              building={phase === 'building'}
              visibleCount={preliminaryLegCount}
              interpreting={!interpretationReady && !interpretationError}
              justResolved={transitioning === 'resolved'}
              changedLegIds={changedLegIds}
              issues={['adjust', 'review'].includes(phase) ? itineraryIssues : []}
            />
          </aside>
        </main>
      )}

      {phase === 'optimizing' && (
        <OptimizationView step={optimizationStep} linkedPrograms={linkedPrograms} finishing={optimizationFinishing} brief={brief} />
      )}

      {phase === 'results' && (
        <ResultsView
          linkedPrograms={linkedPrograms}
          totalBalance={totalBalance}
          brief={brief}
          expanded={expandedResult}
          onExpand={setExpandedResult}
          onReset={reset}
        />
      )}

      <div className="prototype-note"><ShieldCheck size={12} /> Demo data · no bookings or transfers are made</div>
    </div>
  )
}

function TripComposer({ value, onChange, onSubmit, placeholder, hint, ariaLabel = 'Trip details', large = false, autoFocus = false, focusDelay = 620, busy = false, busyLabel = '' }) {
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
      <div className={`composer-footer ${!busy && !hint ? 'composer-footer--actions-only' : ''}`}>
        {(busy || hint) && <span>{busy ? busyLabel : hint}</span>}
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
          <span role="columnheader" aria-label="Segment number" />
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
          <span>Flight Leg</span>
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
          const departure = leg.departure || (isArrivalDeadline ? 'Flexible' : isTripWindow ? 'Within Trip Window' : leg.timing)
          const arrival = leg.arrival || (isTripWindow ? 'Flexible' : leg.timing)
          return (
          <div
            className={`flight-leg-row ${building ? 'flight-leg-row--building-ready' : ''} ${leg.pending ? 'pending' : ''} ${justResolved && leg.resolved ? 'flight-leg-row--just-resolved' : ''} ${hasChanged ? 'flight-leg-row--changed' : ''} ${hasIssue ? 'flight-leg-row--warning' : ''}`}
            key={leg.legId || `${leg.route}-${index}`}
            style={{ '--tile-delay': building ? '0ms' : `${index * (result ? 48 : 70)}ms`, ...(!result ? { gridRow: index + 1 } : {}) }}
            aria-label={hasIssue ? `${leg.route}. ${legIssues[0].message}` : undefined}
          >
            <span className="leg-number">
              {hasIssue ? <CircleAlert className="leg-warning-icon" size={14} aria-hidden="true" /> : String(index + 1).padStart(2, '0')}
            </span>
            <div className="leg-route">
              {result && <span>{leg.detail}</span>}
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
                <div className="leg-cost"><strong>{formatNumber(leg.economics.points)} pts</strong><small>+ ${formatNumber(leg.economics.fees)}</small></div>
                <div className="leg-cash-value"><strong>${formatNumber(leg.economics.cashValue)}</strong></div>
                <div className="leg-point-value"><strong>{leg.economics.pointValue.toFixed(1)}¢</strong><small>per point</small></div>
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
          <span>{interpreting ? 'Preparing flight legs…' : visibleCount === 0 ? 'Identifying first leg…' : 'Identifying next leg…'}</span>
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

function ProgramPicker({ linked, onToggle }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [connectionProgram, setConnectionProgram] = useState(null)
  const [connectingId, setConnectingId] = useState(null)
  const [justLinkedId, setJustLinkedId] = useState(null)
  const searchTileRef = useRef(null)
  const linkedAnimationTimer = useRef(null)
  const featuredPrograms = programs.filter((program) => program.featured)
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    window.setTimeout(() => searchTileRef.current?.focus(), 0)
  }, [])
  const focusProgramTile = useCallback((programId) => {
    window.setTimeout(() => document.querySelector(`[data-program-id="${programId}"]`)?.focus(), 0)
  }, [])
  const handleProgramAction = useCallback((program) => {
    if (linked.includes(program.id)) {
      onToggle(program.id)
      return
    }
    setSearchOpen(false)
    setConnectionProgram(program)
  }, [linked, onToggle])
  const startConnection = useCallback((program) => {
    setConnectingId(program.id)
  }, [])
  const completeConnection = useCallback((program) => {
    onToggle(program.id)
    setConnectingId(null)
    setJustLinkedId(program.id)
    if (linkedAnimationTimer.current) window.clearTimeout(linkedAnimationTimer.current)
    linkedAnimationTimer.current = window.setTimeout(() => setJustLinkedId(null), 1100)
  }, [onToggle])
  const finishConnection = useCallback((program) => {
    setConnectionProgram(null)
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
        <div className="program-grid">
          {featuredPrograms.map((program, index) => (
            <ProgramTile
              key={program.id}
              program={program}
              index={index}
              linked={linked}
              connecting={connectingId === program.id}
              justLinked={justLinkedId === program.id}
              onAction={handleProgramAction}
            />
          ))}
          <button
            ref={searchTileRef}
            className="program-tile program-tile--search"
            onClick={() => setSearchOpen(true)}
            style={{ '--tile-delay': `${featuredPrograms.length * 45}ms` }}
            aria-label="Search for another rewards program"
          >
            <span className="program-logo program-logo--search">•••</span>
            <span className="program-copy"><strong>Missing program?</strong><small>Search</small></span>
            <span className="program-action"><Search size={13} /></span>
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {linked.length ? `${linked.length} award program${linked.length === 1 ? '' : 's'} linked.` : ''}
        </span>
      </div>
      {searchOpen && createPortal(
        <ProgramSearchModal
          linked={linked}
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

function ProgramTile({ program, index, linked, connecting, justLinked, onAction }) {
  const isLinked = linked.includes(program.id)
  return (
    <button
      className={`program-tile ${isLinked ? 'linked' : ''} ${connecting ? 'linking' : ''} ${justLinked ? 'just-linked' : ''}`}
      data-program-id={program.id}
      onClick={() => onAction(program)}
      style={{ '--tile-delay': `${index * 45}ms` }}
      aria-pressed={isLinked}
      aria-busy={connecting}
      aria-label={`${connecting ? 'Connecting' : isLinked ? 'Disconnect' : 'Connect'} ${program.name}${isLinked ? `, ${formatNumber(program.balance)} points linked` : ''}`}
      disabled={connecting}
    >
      <span className="program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
      <span className="program-copy"><strong>{program.name}</strong><small>{isLinked ? `${formatNumber(program.balance)} points` : program.program}</small></span>
      <span className="program-action">{connecting ? <i /> : isLinked ? <Check size={14} /> : '+'}</span>
    </button>
  )
}

function ProgramConnectionModal({ program, onConnectionStart, onConnected, onFinished, onClose }) {
  const [phase, setPhase] = useState('login')
  const [connectionStep, setConnectionStep] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [signInMethod, setSignInMethod] = useState('credentials')
  const dialogRef = useRef(null)
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)
  const connectionTimers = useRef([])
  const stageCopy = [
    `Signing in to ${program.name}`,
    'Encrypting your account details',
    'Syncing your rewards balance',
  ]

  const queueConnectionTimer = (callback, delay) => {
    const timer = window.setTimeout(() => {
      connectionTimers.current = connectionTimers.current.filter((timerId) => timerId !== timer)
      callback()
    }, delay)
    connectionTimers.current.push(timer)
  }

  const beginConnection = (method) => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setSignInMethod(method)
    setError('')
    setConnectionStep(0)
    setPhase('connecting')
    onConnectionStart(program)
    queueConnectionTimer(() => setConnectionStep(1), reducedMotion ? 80 : 650)
    queueConnectionTimer(() => setConnectionStep(2), reducedMotion ? 150 : 1320)
    queueConnectionTimer(() => {
      setPhase('success')
      onConnected(program)
      queueConnectionTimer(() => onFinished(program), reducedMotion ? 320 : 1200)
    }, reducedMotion ? 230 : 2200)
  }

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
    beginConnection('credentials')
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
      if (event.key === 'Escape' && phase === 'login') {
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
    <div className="connection-backdrop" onMouseDown={(event) => event.target === event.currentTarget && phase === 'login' && onClose()}>
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
          {phase === 'login' && <button onClick={onClose} aria-label={`Close ${program.name} sign in`}><X size={16} /></button>}
        </header>

        {phase === 'login' && (
          <div className="connection-login">
            <div className="connection-program-brand">
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <span>Powered by <strong>{program.name}</strong></span>
            </div>
            <h2 id="connection-title">Sign in to {program.name}</h2>
            <p id="connection-description">Connect {program.program} so Vetra can include your balance in this search.</p>

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
              <button className="connection-submit" type="submit">Sign in securely <ArrowRight size={15} /></button>
            </form>

            <div className="connection-divider"><span>or</span></div>
            <button className="connection-google" type="button" onClick={() => beginConnection('google')}>
              <span aria-hidden="true">G</span> Sign in with Google
            </button>
            <p className="connection-privacy"><ShieldCheck size={13} /> Demo connection only. Credentials are never stored or transmitted.</p>
          </div>
        )}

        {phase === 'connecting' && (
          <div className="connection-progress" aria-live="polite">
            <div className="connection-bridge" aria-hidden="true">
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <span className="connection-bridge-track"><i /><i /><i /></span>
              <span className="connection-vetra-mark"><i /><i /></span>
            </div>
            <span className="connection-eyebrow">Encrypted connection</span>
            <h2 id="connection-title">Securely connecting</h2>
            <p id="connection-description">{signInMethod === 'google' && connectionStep === 0 ? 'Confirming your Google identity' : stageCopy[connectionStep]}</p>
            <ol className="connection-stages">
              {stageCopy.map((stage, index) => (
                <li className={index < connectionStep ? 'complete' : index === connectionStep ? 'active' : ''} key={stage}>
                  <span>{index < connectionStep ? <Check size={11} /> : index + 1}</span>
                  {stage}
                </li>
              ))}
            </ol>
            <p className="connection-privacy"><LockKeyhole size={12} /> 256-bit encrypted demo session</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="connection-success" aria-live="polite">
            <span className="connection-success-mark"><CheckCircle2 size={33} /></span>
            <span className="connection-eyebrow">Connection complete</span>
            <h2 id="connection-title">{program.name} is connected</h2>
            <p id="connection-description">Your rewards balance is ready to use in this search.</p>
            <div className="connection-balance">
              <span className="connection-program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
              <div><small>{program.program}</small><strong>{formatNumber(program.balance)} points</strong></div>
              <Check size={15} />
            </div>
            <span className="connection-closing">Returning to your trip…</span>
          </div>
        )}
      </section>
    </div>
  )
}

function ProgramSearchModal({ linked, onProgramAction, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const searchablePrograms = useMemo(() => programs.filter((program) => !program.featured), [])
  const filteredPrograms = searchablePrograms.filter((program) => {
    const haystack = `${program.name} ${program.program}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.clearTimeout(focusTimer)
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
        <div className="program-search-list">
          {filteredPrograms.map((program) => {
            const isLinked = linked.includes(program.id)
            return (
              <button
                key={program.id}
                className={`program-search-result ${isLinked ? 'linked' : ''}`}
                onClick={() => onProgramAction(program)}
                aria-pressed={isLinked}
              >
                <span className="program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</span>
                <span className="program-copy"><strong>{program.name}</strong><small>{isLinked ? `${formatNumber(program.balance)} points linked` : program.program}</small></span>
                <span className="program-action">{isLinked ? <Check size={14} /> : '+'}</span>
              </button>
            )
          })}
          {!filteredPrograms.length && <div className="program-search-empty">No matching program in this demo set.</div>}
        </div>
      </section>
    </div>
  )
}

function OptimizationView({ step, linkedPrograms, finishing, brief }) {
  return (
    <main className={`optimization-view ${finishing ? 'optimization-view--finishing' : ''}`}>
      <div className="optimization-orbit" aria-hidden="true">
        <span className="orbit orbit--one" /><span className="orbit orbit--two" />
        <span className="optimization-mark"><Brand /></span>
      </div>
      <section className="optimization-copy" aria-live="polite">
        <span className="step-label">Intelligent optimization</span>
        <h1>Building your best ways to fly.</h1>
        <p>{linkedPrograms.length ? `Using ${linkedPrograms.length} linked balance${linkedPrograms.length === 1 ? '' : 's'} alongside cash alternatives for ${brief?.route || 'your finalized route'}.` : `Comparing illustrative cash and award options for ${brief?.route || 'your finalized route'} without linked balances.`}</p>
        <div className="optimization-list">
          {optimizationStages.map((stage, index) => (
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

function ResultsView({ linkedPrograms, totalBalance, brief, expanded, onExpand, onReset }) {
  const recommendations = useMemo(() => buildDemoRecommendations(brief), [brief])
  return (
    <main className="results-view">
      <section className="results-heading">
        <span className="step-label"><Sparkles size={13} /> Optimization complete</span>
        <h1>Three strong ways to make this trip work.</h1>
        <p>{linkedPrograms.length ? `${formatNumber(totalBalance)} linked points were considered.` : 'No balances were linked, so point funding is illustrative.'}</p>
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
          <article className={`result-card ${expanded === index ? 'expanded' : ''}`} key={result.title} style={{ '--result-color': result.color, '--tile-delay': `${index * 90}ms` }}>
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
                    <div className="detail-heading"><span>Flight Plan</span><strong>{result.segments.length} Bookable Segments</strong></div>
                    <FlightLegRows legs={result.segments} result />
                  </section>
                  <aside className="result-rationale">
                    <div className="detail-heading"><span>Pros &amp; Cons</span><strong>Why This Ranks #{index + 1}</strong></div>
                    <p className="result-rationale-summary">{result.detail}</p>
                    <div className="tradeoff-groups">
                      <section className="tradeoff-group tradeoff-group--pros">
                        <h3><Check size={12} /> {result.pros.length} Pros</h3>
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
