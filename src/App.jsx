import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Gauge,
  Globe2,
  Info,
  Link2,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Plane,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Unplug,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'

const DEMO_PROMPT =
  "I'm traveling solo from New York. I need to arrive in Tokyo before 4pm on October 8, then fly to Seoul on October 12, Honolulu on October 16, and return to New York on October 20, plus or minus one day. Business class is required from New York to Tokyo; I'm flexible on cabin for the other flights. Optimize the complete itinerary using my linked points and miles, including transfer options, fees, and cash alternatives."

const REQUIRED_DEMO_PROGRAM_IDS = ['amex', 'chase', 'aeroplan']
const normalizeBrief = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const isCanonicalDemoBrief = (value) => normalizeBrief(value) === normalizeBrief(DEMO_PROMPT)

const programs = [
  {
    id: 'amex',
    name: 'American Express',
    program: 'Membership Rewards',
    mark: 'AM',
    color: '#1677d2',
    tint: '#eaf4ff',
    balance: 342800,
    type: 'Flexible points',
  },
  {
    id: 'chase',
    name: 'Chase',
    program: 'Ultimate Rewards',
    mark: 'CH',
    color: '#0b6158',
    tint: '#e9f7f3',
    balance: 186400,
    type: 'Flexible points',
  },
  {
    id: 'aeroplan',
    name: 'Air Canada',
    program: 'Aeroplan',
    mark: 'AC',
    color: '#d8292f',
    tint: '#fff0f0',
    balance: 41250,
    type: 'Airline miles',
  },
  {
    id: 'united',
    name: 'United',
    program: 'MileagePlus',
    mark: 'UA',
    color: '#154aa0',
    tint: '#eef3ff',
    balance: 62100,
    type: 'Airline miles',
  },
  {
    id: 'capitalone',
    name: 'Capital One',
    program: 'Miles',
    mark: 'C1',
    color: '#9f173d',
    tint: '#fff0f4',
    balance: 0,
    type: 'Flexible points',
  },
  {
    id: 'flyingblue',
    name: 'Flying Blue',
    program: 'Air France · KLM',
    mark: 'FB',
    color: '#142b8f',
    tint: '#eff2ff',
    balance: 0,
    type: 'Airline miles',
  },
]

const constraints = [
  { icon: 'route', label: 'Route', value: 'NYC → Tokyo → Seoul → Honolulu → NYC' },
  { icon: 'date', label: 'Hard arrival', value: 'Tokyo · Oct 8 before 4:00 PM', hard: true },
  { icon: 'cabin', label: 'Cabin', value: 'Business required · NYC to Tokyo', hard: true },
  { icon: 'date', label: 'Fixed dates', value: 'Seoul Oct 12 · Honolulu Oct 16' },
  { icon: 'flex', label: 'Return window', value: 'Oct 19–21' },
  { icon: 'traveler', label: 'Travelers', value: '1 adult' },
]

const DEMO_INTERPRETATION = {
  assistantMessage:
    'I’ve translated that into a flight brief. Before I work through your points, check that I’ve treated the right things as non-negotiable.',
  routeCities: ['New York', 'Tokyo', 'Seoul', 'Honolulu', 'New York'],
  constraints,
  meta: { fallback: true },
}

const analysisStages = [
  { label: 'Mapping viable award routes', detail: '41 route combinations' },
  { label: 'Checking the Tokyo arrival constraint', detail: '18 remain' },
  { label: 'Pricing across loyalty programs', detail: '9 programs' },
  { label: 'Testing transfer paths against balances', detail: '27 paths' },
  { label: 'Comparing taxes and cash alternatives', detail: '$8,240 analyzed' },
  { label: 'Ranking complete flight strategies', detail: '3 recommendations' },
]

const strategies = [
  {
    rank: 1,
    label: 'Best overall',
    title: 'Aeroplan-led strategy',
    subtitle: 'Strongest balance of cabin quality, value, and simplicity',
    points: 168000,
    fees: 312,
    cash: 6840,
    cpp: 3.89,
    score: 94,
    confidence: 'High modeled confidence',
    accent: '#5f5ce6',
    reason:
      'It meets every hard constraint, preserves business class on the longest flight, and saves 12,000 points versus the simplest option without adding a risky connection.',
    tradeoff: 'One connection in Toronto on the outbound',
    transfer: 'Transfer 126,750 Amex points to Aeroplan',
    airportChanges: ['Seoul: arrive GMP on Oct 12; depart ICN on Oct 16'],
    segments: [
      {
        date: 'Oct 7, 2026',
        from: 'JFK',
        to: 'YYZ',
        airline: 'Air Canada',
        flight: 'AC 701',
        time: '9:10 AM – 10:48 AM',
        cabin: 'Business',
        aircraft: 'A220-300',
        bookWith: 'Included in the JFK–HND Aeroplan award',
      },
      {
        date: 'Oct 7–8, 2026',
        from: 'YYZ',
        to: 'HND',
        airline: 'Air Canada',
        flight: 'AC 1',
        time: '1:15 PM – 3:05 PM +1',
        cabin: 'Business',
        aircraft: 'Boeing 777-300ER',
        hard: 'Arrives 55m before cutoff',
        bookWith: 'Aeroplan · 110,000 pts for JFK–HND',
      },
      {
        date: 'Oct 12, 2026',
        from: 'HND',
        to: 'GMP',
        airline: 'ANA',
        flight: 'NH 865',
        time: '4:10 PM – 6:35 PM',
        cabin: 'Economy',
        aircraft: 'Boeing 787-8',
        bookWith: 'Aeroplan · 18,000 pts',
      },
      {
        date: 'Oct 16, 2026',
        from: 'ICN',
        to: 'HNL',
        airline: 'Asiana',
        flight: 'OZ 232',
        time: '8:20 PM – 9:50 AM',
        cabin: 'Economy',
        aircraft: 'Airbus A330-300',
        bookWith: 'Aeroplan · 20,000 pts',
      },
      {
        date: 'Oct 20, 2026',
        from: 'HNL',
        to: 'EWR',
        airline: 'United',
        flight: 'UA 362',
        time: '4:55 PM – 7:36 AM +1',
        cabin: 'Economy Plus',
        aircraft: 'Boeing 767-400',
        bookWith: 'Aeroplan · 20,000 pts',
      },
    ],
    funding: [
      { source: 'Aeroplan balance', amount: '41,250', use: 'Use existing miles' },
      { source: 'Amex Membership Rewards', amount: '126,750', use: 'Transfer 1:1 to Aeroplan' },
    ],
  },
  {
    rank: 2,
    label: 'Highest point value',
    title: 'Virgin + United strategy',
    subtitle: 'Fewer points, with a more involved booking path',
    points: 145000,
    fees: 684,
    cash: 6910,
    cpp: 4.29,
    score: 89,
    confidence: 'Medium modeled confidence',
    accent: '#c64984',
    reason:
      'This extracts the highest modeled value from your points and uses fewer of them overall, but requires two transfers and a phone booking for the ANA segment.',
    tradeoff: '$372 more in surcharges and two separate transfers',
    transfer: 'Transfer Amex to Virgin Atlantic and Chase to United',
    airportChanges: ['Tokyo: arrive HND on Oct 8; depart NRT on Oct 12'],
    segments: [
      {
        date: 'Oct 7–8, 2026',
        from: 'JFK',
        to: 'HND',
        airline: 'ANA',
        flight: 'NH 159',
        time: '2:05 AM – 5:15 AM +1',
        cabin: 'Business',
        aircraft: 'Boeing 777-300ER',
        hard: 'Arrives 10h 45m before cutoff',
        bookWith: 'Virgin Atlantic · 75,000 pts',
      },
      {
        date: 'Oct 12, 2026',
        from: 'NRT',
        to: 'ICN',
        airline: 'Asiana',
        flight: 'OZ 101',
        time: '1:20 PM – 4:05 PM',
        cabin: 'Economy',
        aircraft: 'Airbus A321',
        bookWith: 'United · 15,000 pts',
      },
      {
        date: 'Oct 16, 2026',
        from: 'ICN',
        to: 'HNL',
        airline: 'Asiana',
        flight: 'OZ 232',
        time: '8:20 PM – 9:50 AM',
        cabin: 'Economy',
        aircraft: 'Airbus A330-300',
        bookWith: 'United · 25,000 pts',
      },
      {
        date: 'Oct 20, 2026',
        from: 'HNL',
        to: 'EWR',
        airline: 'United',
        flight: 'UA 362',
        time: '4:55 PM – 7:36 AM +1',
        cabin: 'Economy Plus',
        aircraft: 'Boeing 767-400',
        bookWith: 'United · 30,000 pts',
      },
    ],
    funding: [
      { source: 'Amex Membership Rewards', amount: '75,000', use: 'Transfer 1:1 to Virgin Atlantic' },
      { source: 'Chase Ultimate Rewards', amount: '70,000', use: 'Transfer 1:1 to United' },
    ],
  },
  {
    rank: 3,
    label: 'Simplest booking',
    title: 'United-only strategy',
    subtitle: 'One program and one transfer across the entire trip',
    points: 180000,
    fees: 149,
    cash: 6770,
    cpp: 3.68,
    score: 84,
    confidence: 'High modeled confidence',
    accent: '#167c6c',
    reason:
      'Every segment can be booked in one session through United. It is the easiest strategy to execute, but consumes 35,000 more transferable points than the highest-value option.',
    tradeoff: 'Uses 35,000 more points than option two',
    transfer: 'Transfer 180,000 Chase points to United',
    airportChanges: ['Seoul: arrive GMP on Oct 12; depart ICN on Oct 16'],
    segments: [
      {
        date: 'Oct 7–8, 2026',
        from: 'EWR',
        to: 'HND',
        airline: 'United',
        flight: 'UA 131',
        time: '10:25 AM – 1:35 PM +1',
        cabin: 'Polaris business',
        aircraft: 'Boeing 777-200',
        hard: 'Arrives 2h 25m before cutoff',
        bookWith: 'United · 100,000 pts',
      },
      {
        date: 'Oct 12, 2026',
        from: 'HND',
        to: 'GMP',
        airline: 'ANA',
        flight: 'NH 867',
        time: '8:05 PM – 10:30 PM',
        cabin: 'Economy',
        aircraft: 'Boeing 787-8',
        bookWith: 'United · 20,000 pts',
      },
      {
        date: 'Oct 16, 2026',
        from: 'ICN',
        to: 'HNL',
        airline: 'Asiana',
        flight: 'OZ 232',
        time: '8:20 PM – 9:50 AM',
        cabin: 'Economy',
        aircraft: 'Airbus A330-300',
        bookWith: 'United · 30,000 pts',
      },
      {
        date: 'Oct 20, 2026',
        from: 'HNL',
        to: 'EWR',
        airline: 'United',
        flight: 'UA 362',
        time: '4:55 PM – 7:36 AM +1',
        cabin: 'Economy Plus',
        aircraft: 'Boeing 767-400',
        bookWith: 'United · 30,000 pts',
      },
    ],
    funding: [
      { source: 'Chase Ultimate Rewards', amount: '180,000', use: 'Transfer 1:1 to United' },
    ],
  },
]

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value)

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <span>vetra</span>
    </div>
  )
}

function App() {
  const [phase, setPhase] = useState('welcome')
  const [draft, setDraft] = useState(DEMO_PROMPT)
  const [submittedPrompt, setSubmittedPrompt] = useState(DEMO_PROMPT)
  const [tripBrief, setTripBrief] = useState(DEMO_INTERPRETATION)
  const [parseError, setParseError] = useState('')
  const [linked, setLinked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vetra-linked-programs') || '[]')
    } catch {
      return []
    }
  })
  const [connectTarget, setConnectTarget] = useState(null)
  const [connectStep, setConnectStep] = useState('login')
  const [analysisStep, setAnalysisStep] = useState(0)
  const [selectedStrategy, setSelectedStrategy] = useState(0)

  useEffect(() => {
    localStorage.setItem('vetra-linked-programs', JSON.stringify(linked))
  }, [linked])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [phase])

  useEffect(() => {
    if (phase !== 'analysis') return undefined
    setAnalysisStep(0)
    const timer = window.setInterval(() => {
      setAnalysisStep((current) => {
        if (current >= analysisStages.length) {
          window.clearInterval(timer)
          window.setTimeout(() => setPhase('results'), 500)
          return current
        }
        return current + 1
      })
    }, 620)
    return () => window.clearInterval(timer)
  }, [phase])

  const linkedPrograms = useMemo(
    () => programs.filter((program) => linked.includes(program.id)),
    [linked],
  )
  const totalBalance = linkedPrograms.reduce((sum, program) => sum + program.balance, 0)
  const hardConstraintCount = tripBrief?.constraints?.filter((item) => item.hard).length || 2
  const tripTitle = tripBrief?.routeCities?.length
    ? tripBrief.routeCities.slice(1, -1).join(' · ')
    : 'Flight brief'

  const submitBrief = async () => {
    if (!draft.trim()) return
    const submitted = draft.trim()
    const isDemoBrief = isCanonicalDemoBrief(submitted)
    setSubmittedPrompt(submitted)
    setParseError('')
    setPhase('parsing')

    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
      const response = await fetch(`${apiBaseUrl}/api/parse-trip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: submitted }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'GPT parsing failed')
      if (!Array.isArray(payload.routeCities) || !Array.isArray(payload.constraints)) {
        throw new Error('GPT returned an invalid brief')
      }
      setTripBrief(payload)
    } catch (error) {
      if (isDemoBrief) {
        setTripBrief(DEMO_INTERPRETATION)
        setParseError('GPT was unavailable, so Vetra loaded the matching scripted interpretation for this demo brief.')
      } else {
        setTripBrief(null)
        setParseError('Vetra could not interpret this brief. Nothing has been inferred or substituted—edit the brief and try again.')
      }
    }
    setPhase('constraints')
  }

  const openConnect = (program) => {
    setConnectTarget(program)
    setConnectStep('login')
  }

  const completeConnection = () => {
    setConnectStep('syncing')
    window.setTimeout(() => {
      setLinked((current) =>
        current.includes(connectTarget.id) ? current : [...current, connectTarget.id],
      )
      setConnectStep('done')
    }, 700)
  }

  const disconnect = (programId) => {
    setLinked((current) => current.filter((id) => id !== programId))
  }

  const resetDemo = () => {
    setPhase('welcome')
    setDraft(DEMO_PROMPT)
    setSubmittedPrompt(DEMO_PROMPT)
    setTripBrief(DEMO_INTERPRETATION)
    setParseError('')
    setSelectedStrategy(0)
    setAnalysisStep(0)
  }

  const resetFirstTimeDemo = () => {
    localStorage.removeItem('vetra-linked-programs')
    setLinked([])
    resetDemo()
  }

  if (phase === 'welcome') {
    return <Welcome draft={draft} setDraft={setDraft} onSubmit={submitBrief} />
  }

  return (
    <div className="app-shell">
      <Sidebar
        phase={phase}
        linkedPrograms={linkedPrograms}
        totalBalance={totalBalance}
        onReset={resetDemo}
        onResetFirstTime={resetFirstTimeDemo}
      />
      <main className="main-panel">
        <Topbar phase={phase} linkedCount={linkedPrograms.length} tripTitle={tripTitle} />
        {phase === 'parsing' && <ParsingView prompt={submittedPrompt} />}
        {phase === 'constraints' && (
          <ConstraintsView
            prompt={submittedPrompt}
            tripBrief={tripBrief}
            parseError={parseError}
            canContinue={isCanonicalDemoBrief(submittedPrompt) && Boolean(tripBrief)}
            onEdit={() => {
              setDraft(submittedPrompt)
              setPhase('welcome')
            }}
            onConfirm={() => setPhase('programs')}
          />
        )}
        {phase === 'programs' && (
          <ProgramsView
            linked={linked}
            onConnect={openConnect}
            onDisconnect={disconnect}
            onContinue={() => setPhase('ready')}
          />
        )}
        {phase === 'ready' && (
          <ReadyView
            linkedPrograms={linkedPrograms}
            totalBalance={totalBalance}
            hardConstraintCount={hardConstraintCount}
            onBack={() => setPhase('programs')}
            onAnalyze={() => setPhase('analysis')}
          />
        )}
        {phase === 'analysis' && <AnalysisView step={analysisStep} />}
        {phase === 'results' && (
          <ResultsView selected={selectedStrategy} setSelected={setSelectedStrategy} hardConstraintCount={hardConstraintCount} />
        )}
      </main>
      {connectTarget && (
        <ConnectionModal
          program={connectTarget}
          step={connectStep}
          onConnect={completeConnection}
          onClose={() => setConnectTarget(null)}
        />
      )}
    </div>
  )
}

function Welcome({ draft, setDraft, onSubmit }) {
  return (
    <div className="welcome">
      <div className="welcome-nav">
        <Brand />
        <div className="welcome-nav__right">
          <span className="demo-chip"><Sparkles size={12} /> Interactive prototype</span>
          <span className="welcome-nav__divider" />
          <span className="avatar-button" aria-label="Personal demo workspace">BC</span>
        </div>
      </div>

      <div className="welcome-orbit welcome-orbit--one" />
      <div className="welcome-orbit welcome-orbit--two" />
      <div className="welcome-glow" />

      <section className="welcome-content">
        <div className="eyebrow"><Sparkles size={14} /> Award intelligence, personalized</div>
        <h1>Tell me where you need to be.<br />I’ll work out the points.</h1>
        <p className="welcome-lede">
          Vetra reasons across your balances, transfer partners, award pricing, and cash fares to
          find the strongest complete flight strategy.
        </p>

        <div className="prompt-box">
          <textarea
            aria-label="Describe your trip"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit()
            }}
          />
          <div className="prompt-box__footer">
            <div className="prompt-hints">
              <span><Plane size={14} /> Multi-city</span>
              <span><Clock3 size={14} /> Hard constraints</span>
            </div>
            <button className="send-button" onClick={onSubmit} aria-label="Send trip brief">
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
        <div className="prompt-footnote">
          <span><ShieldCheck size={14} /> Program connections and inventory are simulated</span>
          <span>⌘ + Enter to send</span>
        </div>
      </section>

      <footer className="welcome-footer">
        <span>Built for people who know their points</span>
        <div>
          <span>9 transfer ecosystems</span>
          <span>·</span>
          <span>100+ airline programs</span>
          <span>·</span>
          <span>Illustrative award logic</span>
        </div>
      </footer>
    </div>
  )
}

function Sidebar({ phase, linkedPrograms, totalBalance, onReset, onResetFirstTime }) {
  return (
    <aside className="sidebar">
      <div>
        <Brand compact />
        <button className="new-search" onClick={onReset}>
          <Plus size={16} /> New search
        </button>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-label">Workspace</span>
        <div className={phase === 'results' ? '' : 'active'}>
          <MessageSquareText size={17} /> Current search
          <span className="nav-dot" />
        </div>
        <div className={phase === 'results' ? 'active' : ''}>
          <Route size={17} /> Recommendations
          {phase === 'results' && <span className="nav-count">3</span>}
        </div>
      </nav>

      <div className="sidebar-wallet">
        <div className="sidebar-wallet__head">
          <span className="sidebar-label">Linked balances</span>
        </div>
        {linkedPrograms.length ? (
          <>
            <strong>{formatNumber(totalBalance)}</strong>
            <small>points and miles available</small>
            <div className="mini-programs">
              {linkedPrograms.slice(0, 4).map((program) => (
                <span
                  key={program.id}
                  style={{ background: program.color }}
                  title={program.program}
                >
                  {program.mark}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="wallet-empty">
            <WalletCards size={20} />
            <span>No programs linked yet</span>
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button className="demo-reset" onClick={onResetFirstTime}>Reset first-time demo data</button>
        <div className="sidebar-security"><ShieldCheck size={15} /> Demo balances stay local</div>
        <div className="sidebar-profile">
          <span>BC</span>
          <div><strong>Ben Cohen</strong><small>Personal workspace</small></div>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ phase, linkedCount, tripTitle }) {
  const steps = [
    { id: 'constraints', label: 'Brief' },
    { id: 'programs', label: 'Balances' },
    { id: 'ready', label: 'Review' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'results', label: 'Results' },
  ]
  const current = Math.max(0, steps.findIndex((step) => step.id === phase))
  return (
    <header className="topbar">
      <div>
        <span className="topbar-kicker">Current search</span>
        <strong>{tripTitle}</strong>
      </div>
      <div className="progress-steps" aria-label="Search progress">
        {steps.map((step, index) => (
          <div key={step.id} className={index <= current ? 'complete' : ''}>
            <span>{index < current ? <Check size={11} /> : index + 1}</span>
            <small>{step.label}</small>
          </div>
        ))}
      </div>
      <div className="topbar-status">
        <span className="demo-dot" />
        Demo mode · {linkedCount ? `${linkedCount} programs linked` : 'simulated data'}
      </div>
    </header>
  )
}

function ConversationFrame({ children }) {
  return <div className="conversation">{children}</div>
}

function UserMessage({ children }) {
  return (
    <div className="message message--user">
      <div className="message-avatar message-avatar--user">BC</div>
      <div><span className="message-name">You</span><div className="user-bubble">{children}</div></div>
    </div>
  )
}

function VetraMessage({ children }) {
  return (
    <div className="message message--vetra">
      <div className="message-avatar"><div className="brand-mark brand-mark--small"><span /><span /></div></div>
      <div><span className="message-name">Vetra</span><div className="vetra-bubble">{children}</div></div>
    </div>
  )
}

function ParsingView({ prompt }) {
  return (
    <ConversationFrame>
      <UserMessage>{prompt}</UserMessage>
      <VetraMessage>
        <div className="gpt-thinking">
          <div className="gpt-thinking__orb"><Sparkles size={18} /></div>
          <div>
            <strong>Understanding your flight brief</strong>
            <span>GPT is separating hard constraints from preferences…</span>
          </div>
          <div className="thinking-dots"><i /><i /><i /></div>
        </div>
      </VetraMessage>
    </ConversationFrame>
  )
}

function ConstraintsView({ prompt, tripBrief, parseError, canContinue, onEdit, onConfirm }) {
  const parsedConstraints = tripBrief?.constraints || []
  const routeCities = tripBrief?.routeCities || []
  return (
    <ConversationFrame>
      <UserMessage>{prompt}</UserMessage>
      <VetraMessage>
        <p>{tripBrief?.assistantMessage || 'I couldn’t create a reliable flight brief from that request.'}</p>
        {parseError && <div className="parse-fallback"><Info size={13} /> {parseError}</div>}
        {!canContinue && tripBrief && (
          <div className="prototype-boundary">
            <AlertTriangle size={16} />
            <div><strong>Parsed, but outside this prototype’s modeled scenario</strong><span>The GPT interpretation is shown for inspection. Mock optimization is only available for the prefilled Tokyo–Seoul–Honolulu brief, so Vetra will not substitute unrelated results.</span></div>
          </div>
        )}
        {!tripBrief && (
          <div className="prototype-boundary">
            <AlertTriangle size={16} />
            <div><strong>No trip brief was created</strong><span>Edit your request and retry. Vetra has not inferred a route or loaded fallback constraints.</span></div>
          </div>
        )}
        {tripBrief && (
        <div className="interpretation-card">
          <div className="interpretation-card__head">
            <div><Sparkles size={16} /><strong>My understanding</strong></div>
            <span className={tripBrief?.meta?.poweredBy ? 'gpt-powered' : ''}>
              {tripBrief?.meta?.poweredBy && <Zap size={10} />}
              {tripBrief?.meta?.poweredBy
                ? `${parsedConstraints.length} constraints · GPT-5.4 interpreted`
                : `${parsedConstraints.length} constraints extracted`}
            </span>
          </div>
          <div className="route-strip">
            {routeCities.map((city, index, list) => (
              <div className="route-stop" key={`${city}-${index}`}>
                <span className={index === 1 ? 'route-stop__hard' : ''}>{index + 1}</span>
                <strong>{city}</strong>
                {index < list.length - 1 && <div className="route-connector"><Plane size={13} /></div>}
              </div>
            ))}
          </div>
          <div className="constraint-grid">
            {parsedConstraints.map((constraint) => (
              <div className="constraint-item" key={`${constraint.label}-${constraint.value}`}>
                <div className="constraint-icon">
                  {constraint.icon === 'route' && <Route size={17} />}
                  {constraint.icon === 'date' && <Clock3 size={17} />}
                  {constraint.icon === 'cabin' && <Star size={17} />}
                  {constraint.icon === 'flex' && <RefreshCw size={17} />}
                  {constraint.icon === 'traveler' && <span>1</span>}
                </div>
                <div><small>{constraint.label}{constraint.hard && <em>Hard</em>}</small><strong>{constraint.value}</strong></div>
              </div>
            ))}
          </div>
          <div className="interpretation-card__footer">
            <button className="secondary-button" onClick={onEdit}>Edit brief</button>
            <button className="primary-button" disabled={!canContinue} onClick={onConfirm}>That’s right <ArrowRight size={16} /></button>
          </div>
        </div>
        )}
        {!tripBrief && <button className="secondary-button" onClick={onEdit}>Edit brief</button>}
      </VetraMessage>
    </ConversationFrame>
  )
}

function ProgramsView({ linked, onConnect, onDisconnect, onContinue }) {
  const linkedCount = linked.length
  const missingRequired = REQUIRED_DEMO_PROGRAM_IDS.filter((id) => !linked.includes(id))
  const requiredReady = missingRequired.length === 0
  return (
    <ConversationFrame>
      <VetraMessage>
        <p>Great. Next, connect the balances used by this modeled scenario. The recommendations will only use balances shown in your wallet.</p>
        <div className="security-note"><LockKeyhole size={16} /><div><strong>Simulated connections for this prototype</strong><span>No airline credentials are requested or transmitted. Balances are sample data saved in this browser.</span></div></div>
      </VetraMessage>

      <div className="program-section">
        <div className="section-heading">
          <div><span className="section-kicker">Your wallet</span><h2>Connect programs</h2></div>
          <span className="selection-count"><strong>{linkedCount}</strong> connected</span>
        </div>
        <div className="program-grid">
          {programs.map((program) => {
            const isLinked = linked.includes(program.id)
            const isRequired = REQUIRED_DEMO_PROGRAM_IDS.includes(program.id)
            return (
              <div className={`program-card ${isLinked ? 'program-card--linked' : ''}`} key={program.id}>
                <div className="program-card__top">
                  <div className="program-logo" style={{ color: program.color, background: program.tint }}>{program.mark}</div>
                  {isLinked ? <span className="connected-pill"><Check size={12} /> Connected</span> : <span className="program-type">{isRequired ? 'Needed for demo' : program.type}</span>}
                </div>
                <div className="program-card__name"><strong>{program.name}</strong><span>{program.program}</span></div>
                {isLinked ? (
                  <>
                    <div className="program-balance"><strong>{formatNumber(program.balance)}</strong><span>Sample balance · saved locally</span></div>
                    <button className="text-button danger" onClick={() => onDisconnect(program.id)}><Unplug size={13} /> Disconnect</button>
                  </>
                ) : (
                  <button className="connect-button" onClick={() => onConnect(program)}>Connect <ExternalLink size={14} /></button>
                )}
              </div>
            )
          })}
        </div>
        <div className="program-section__footer">
          <span>{requiredReady ? 'Amex, Chase, and Aeroplan can fund every modeled option' : `Connect the ${missingRequired.length} highlighted demo program${missingRequired.length === 1 ? '' : 's'} to continue`}</span>
          <button className="primary-button" disabled={!requiredReady} onClick={onContinue}>Use these balances <ArrowRight size={16} /></button>
        </div>
      </div>
    </ConversationFrame>
  )
}

function ReadyView({ linkedPrograms, totalBalance, hardConstraintCount, onBack, onAnalyze }) {
  return (
    <ConversationFrame>
      <VetraMessage>
        <p>I have enough to start. I’ll treat your linked balances as the funding constraint, compare them with cash, and rank complete strategies—not isolated cheap segments.</p>
        <div className="ready-card">
          <div className="ready-card__hero">
            <div className="ready-orb"><Sparkles size={27} /></div>
            <div><span>Ready to optimize</span><h2>One trip. Every viable points path.</h2><p>Vetra will evaluate the itinerary as a whole, while enforcing your Tokyo arrival and business-class requirements.</p></div>
          </div>
          <div className="ready-metrics">
            <div><small>Linked value pool</small><strong>{formatNumber(totalBalance)}</strong><span>points + miles</span></div>
            <div><small>Programs in wallet</small><strong>{linkedPrograms.length}</strong><span>sample balances</span></div>
            <div><small>Hard constraints</small><strong>{hardConstraintCount}</strong><span>must be satisfied</span></div>
            <div><small>Travel legs</small><strong>4</strong><span>up to 5 flights</span></div>
          </div>
          <div className="ready-wallet-row">
            {linkedPrograms.map((program) => (
              <div key={program.id}><span className="program-logo program-logo--small" style={{ color: program.color, background: program.tint }}>{program.mark}</span><div><strong>{program.program}</strong><small>{formatNumber(program.balance)}</small></div></div>
            ))}
          </div>
          <div className="ready-card__footer">
            <button className="secondary-button" onClick={onBack}>Edit balances</button>
            <button className="primary-button primary-button--large" onClick={onAnalyze}><Sparkles size={17} /> Optimize my trip</button>
          </div>
        </div>
      </VetraMessage>
    </ConversationFrame>
  )
}

function AnalysisView({ step }) {
  return (
    <div className="analysis-view">
      <div className="analysis-visual">
        <div className="analysis-ring analysis-ring--outer" />
        <div className="analysis-ring analysis-ring--inner" />
        <div className="analysis-core"><div className="brand-mark"><span /><span /></div></div>
        <span className="analysis-node analysis-node--one">JFK</span>
        <span className="analysis-node analysis-node--two">HND</span>
        <span className="analysis-node analysis-node--three">ICN</span>
        <span className="analysis-node analysis-node--four">HNL</span>
      </div>
      <div className="analysis-copy">
        <span className="section-kicker">Vetra is running the simulated award model</span>
        <h1>Building complete strategies</h1>
        <p>Checking each candidate against your constraints before comparing point value.</p>
        <div className="analysis-stages">
          {analysisStages.map((stage, index) => {
            const complete = index < step
            const active = index === step
            return (
              <div className={`${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={stage.label}>
                <span className="stage-icon">{complete ? <Check size={14} /> : active ? <span className="spinner" /> : index + 1}</span>
                <strong>{stage.label}</strong>
                <small>{complete ? stage.detail : active ? 'In progress' : 'Waiting'}</small>
              </div>
            )
          })}
        </div>
        <div className="analysis-note"><ShieldCheck size={15} /> No points are moved during analysis</div>
      </div>
    </div>
  )
}

function ResultsView({ selected, setSelected, hardConstraintCount }) {
  const [assumptionsStrategy, setAssumptionsStrategy] = useState(null)
  return (
    <div className="results-view">
      <div className="simulation-banner"><Info size={15} /><span><strong>Interactive prototype</strong> Award inventory, prices, balances, and route counts below are simulated—not live airline availability.</span></div>
      <div className="results-hero">
        <div>
          <span className="section-kicker"><Check size={13} /> Simulated analysis complete</span>
          <h1>Three strong ways to book this trip</h1>
          <p>All options satisfy your hard constraints. They’re ranked on value, execution risk, cabin quality, and use of your existing balances.</p>
        </div>
        <div className="results-summary">
          <div><span>41</span><small>routes modeled</small></div>
          <div><span>27</span><small>transfer paths modeled</small></div>
          <div><span>{hardConstraintCount}</span><small>hard constraints met</small></div>
        </div>
      </div>

      <div className="results-toolbar">
        <div className="results-tabs"><span className="active">Ranked strategies</span></div>
        <div className="results-actions"><span><Clock3 size={13} /> Oct 2026 · all times local</span></div>
      </div>

      <div className="strategy-list">
        {strategies.map((strategy, index) => (
          <StrategyCard
            key={strategy.rank}
            strategy={strategy}
            expanded={selected === index}
            onToggle={() => setSelected(selected === index ? -1 : index)}
            onShowAssumptions={() => setAssumptionsStrategy(strategy)}
          />
        ))}
      </div>

      <div className="results-disclaimer"><Info size={14} /> Never transfer points from this prototype. A production version would revalidate bookable inventory and transfer ratios immediately before any transfer.</div>
      {assumptionsStrategy && <AssumptionsModal strategy={assumptionsStrategy} onClose={() => setAssumptionsStrategy(null)} />}
    </div>
  )
}

function StrategyCard({ strategy, expanded, onToggle, onShowAssumptions }) {
  return (
    <article className={`strategy-card ${expanded ? 'strategy-card--expanded' : ''}`} style={{ '--strategy-accent': strategy.accent }}>
      <button className="strategy-summary" onClick={onToggle}>
        <div className="rank-block"><span>#{strategy.rank}</span><small>{strategy.label}</small></div>
        <div className="strategy-title">
          <span className="strategy-badge" style={{ color: strategy.accent, background: `${strategy.accent}12` }}>{strategy.label}</span>
          <h2>{strategy.title}</h2>
          <p>{strategy.subtitle}</p>
        </div>
        <div className="mini-route">
          {['NYC', 'TYO', 'SEL', 'HNL', 'NYC'].map((code, index) => (
            <div key={`${code}-${index}`}><span>{code}</span>{index < 4 && <i />}</div>
          ))}
        </div>
        <div className="strategy-cost"><small>Total trip</small><strong>{formatNumber(strategy.points)} <em>pts</em></strong><span>+ ${formatNumber(strategy.fees)} fees</span></div>
        <div className="strategy-value"><small>Point value</small><strong>{strategy.cpp.toFixed(2)}¢</strong><span>per point</span></div>
        <div className="strategy-score"><div><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" /><circle className="score-fill" cx="22" cy="22" r="18" style={{ strokeDashoffset: 113 - (113 * strategy.score) / 100 }} /></svg><strong>{strategy.score}</strong></div><small>Vetra score</small></div>
        <ChevronDown className={`expand-chevron ${expanded ? 'rotated' : ''}`} size={19} />
      </button>

      {expanded && (
        <div className="strategy-detail">
          <div className="decision-brief">
            <div className="decision-icon"><Sparkles size={18} /></div>
            <div><span>Why this ranks #{strategy.rank}</span><p>{strategy.reason}</p></div>
            <div className="confidence-pill"><ShieldCheck size={14} /> {strategy.confidence}</div>
          </div>

          <div className="strategy-detail__grid">
            <section className="itinerary-panel">
              <div className="panel-heading"><div><span>Complete itinerary</span><strong>{strategy.segments.length} flights · 2026 local times</strong></div><span className="constraint-pass"><Check size={13} /> All constraints met</span></div>
              {strategy.airportChanges.map((warning) => (
                <div className="airport-warning" key={warning}><AlertTriangle size={14} /><span><strong>Airport change</strong> {warning}. Ground transport is not included.</span></div>
              ))}
              <div className="segment-list">
                {strategy.segments.map((segment, index) => (
                  <div className="segment" key={`${segment.from}-${segment.to}`}>
                    <div className="segment-timeline"><span>{index + 1}</span>{index < strategy.segments.length - 1 && <i />}</div>
                    <div className="segment-date">{segment.date}</div>
                    <div className="segment-route"><strong>{segment.from}</strong><div><Plane size={14} /><span>{segment.time}</span></div><strong>{segment.to}</strong></div>
                    <div className="segment-airline"><strong>{segment.airline} · {segment.flight}</strong><span>{segment.aircraft}</span><em>{segment.bookWith}</em></div>
                    <div className="segment-cabin"><strong>{segment.cabin}</strong>{segment.hard && <span><Check size={11} /> {segment.hard}</span>}</div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="booking-panel">
              <div className="booking-block">
                <span className="panel-label">Funding plan</span>
                <div className="funding-list">
                  {strategy.funding.map((item) => (
                    <div key={item.source}><span>{item.source}</span><strong>{item.amount}</strong><small>{item.use}</small></div>
                  ))}
                </div>
              </div>
              <div className="booking-block valuation-block">
                <span className="panel-label">Value calculation</span>
                <div><span>Comparable cash fare</span><strong>${formatNumber(strategy.cash)}</strong></div>
                <div><span>Taxes and fees</span><strong>− ${formatNumber(strategy.fees)}</strong></div>
                <div><span>Points used</span><strong>÷ {formatNumber(strategy.points)}</strong></div>
                <div className="valuation-total"><span>Effective value</span><strong>{strategy.cpp.toFixed(2)}¢ / point</strong></div>
              </div>
              <div className="booking-block tradeoff-block">
                <span className="panel-label">Main tradeoff</span>
                <p>{strategy.tradeoff}</p>
              </div>
            </aside>
          </div>

          <div className="strategy-footer">
            <div><ShieldCheck size={15} /><span><strong>Transfer safeguard</strong> Vetra will confirm bookable inventory before any irreversible transfer.</span></div>
            <button className="secondary-button" onClick={onShowAssumptions}>View assumptions <ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </article>
  )
}

function AssumptionsModal({ strategy, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Assumptions for ${strategy.title}`}>
      <div className="assumptions-modal">
        <button autoFocus className="modal-close" onClick={onClose} aria-label="Close assumptions"><X size={18} /></button>
        <span className="section-kicker">Modeled ranking methodology</span>
        <h2>{strategy.title}</h2>
        <p>This prototype ranks illustrative options; it has not queried airline inventory.</p>
        <div className="assumption-list">
          <div><strong>Vetra score · {strategy.score}/100</strong><span>35% hard-constraint fit, 25% point value, 20% cabin quality, 10% booking simplicity, and 10% transfer/connection risk.</span></div>
          <div><strong>Value · {strategy.cpp.toFixed(2)}¢ per point</strong><span>(${formatNumber(strategy.cash)} modeled comparable mixed-cabin cash fare − ${formatNumber(strategy.fees)} taxes/fees) ÷ {formatNumber(strategy.points)} points.</span></div>
          <div><strong>Cash comparator</strong><span>A same-date, directionally comparable multi-city fare using business class for New York–Tokyo and the displayed cabins elsewhere. It is illustrative and excludes ground transfers.</span></div>
          <div><strong>Transfer assumptions</strong><span>1:1 Amex→Aeroplan, Amex→Virgin Atlantic, and Chase→United; no transfer bonuses; transfers assumed available but never initiated.</span></div>
          <div><strong>Confidence</strong><span>Reflects modeled booking complexity and transfer risk—not a probability that award seats are currently available.</span></div>
        </div>
        <button className="primary-button primary-button--full" onClick={onClose}>Understood</button>
      </div>
    </div>
  )
}

function ConnectionModal({ program, step, onConnect, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Connect ${program.name}`}>
      <div className="connection-modal">
        <button autoFocus className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="oauth-header"><div className="program-logo program-logo--large" style={{ color: program.color, background: program.tint }}>{program.mark}</div><div><strong>{program.name}</strong><span>{program.program}</span></div></div>

        {step === 'login' && (
          <>
            <div className="oauth-browser"><Sparkles size={12} /> Simulated program handoff <MoreHorizontal size={14} /></div>
            <div className="oauth-copy"><h2>Connect sample balance</h2><p>This demo mimics a read-only authorization without contacting {program.name} or collecting credentials.</p></div>
            <div className="demo-credential-note"><ShieldCheck size={16} /><span><strong>No sign-in data is sent</strong> Continue to load the prototype balance shown for this program.</span></div>
            <button className="oauth-button" style={{ background: program.color }} onClick={onConnect}>Authorize demo connection</button>
            <div className="oauth-permissions"><strong>The production connection would:</strong><span><Check size={13} /> Read your points balance</span><span><Check size={13} /> Read membership and status details</span><span className="not-allowed"><X size={13} /> Never transfer or redeem points</span></div>
          </>
        )}

        {step === 'syncing' && (
          <div className="modal-state"><div className="sync-orb"><RefreshCw size={24} /></div><h2>Loading sample balance</h2><p>Simulating a read-only connection to {program.program}…</p></div>
        )}

        {step === 'done' && (
          <div className="modal-state"><div className="success-orb"><Check size={25} /></div><h2>Demo program connected</h2><div className="modal-balance"><span>Sample balance</span><strong>{formatNumber(program.balance)}</strong><small>points · stored locally</small></div><button className="primary-button primary-button--full" onClick={onClose}>Done</button><p className="persistent-note"><Link2 size={13} /> This sample connection remains linked in this browser.</p></div>
        )}
        <div className="powered-by"><ShieldCheck size={13} /> Vetra prototype · no external connection</div>
      </div>
    </div>
  )
}

export default App
