import { useEffect, useState } from 'react'
import { ChartCard, StatTile, formatPercent, useTooltip } from './insights/ui'
import { Funnel, OutcomesBar, SourceBars, WeeklyColumns } from './insights/charts'

const RANGES = [
  { value: 'all', label: 'All time', words: 'all time' },
  { value: '90', label: 'Last 90 days', words: 'the last 90 days' },
  { value: '30', label: 'Last 30 days', words: 'the last 30 days' }
]

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export default function Insights() {
  const [range, setRange] = useState('all')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const tooltip = useTooltip()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/insights?range=${range}`)
      .then(res => {
        if (!res.ok) throw new Error('Could not load your insights.')
        return res.json()
      })
      .then(body => { if (!cancelled) setData(body) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [range])

  const rangeWords = RANGES.find(r => r.value === range).words

  return (
    <div className="viz-root space-y-6">
      {/* One filter row above everything it scopes */}
      <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--viz-text-2)' }}>Applications from</span>
        {RANGES.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={range === option.value}
            onClick={() => setRange(option.value)}
            className={`rounded-full border px-3 py-1 text-sm ${range === option.value ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
            style={range === option.value ? undefined : { borderColor: 'var(--viz-axis)', color: 'var(--viz-text-2)' }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-400 bg-red-100 p-4 text-red-700">{error}</div>
      )}

      {!data && !error && <p style={{ color: 'var(--viz-text-2)' }}>Loading your insights…</p>}

      {data && (
        // While a new range loads, keep the last picture on screen, slightly faded, so nothing jumps
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="col-span-2 md:col-span-1">
              <StatTile hero label="Applications" value={data.kpis.total} note={range === 'all' ? 'All time' : `In ${rangeWords}`} />
            </div>
            <StatTile label="Still open" value={data.kpis.active} note="Not rejected, declined or ghosted" />
            <StatTile label="Heard back" value={formatPercent(data.kpis.replyRate)} note={`${data.kpis.replied} of ${data.kpis.total} got a reply`} />
            <StatTile label="Reached an interview" value={formatPercent(data.kpis.interviewRate)} note={`${data.funnel[1].count} reached a screen or interview`} />
            <StatTile label="Offers" value={data.funnel[3].count} note={`${formatPercent(data.kpis.offerRate)} of applications`} />
          </div>

          {data.total === 0 ? (
            <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: 'var(--viz-grid)', color: 'var(--viz-text-2)' }}>
              <p className="font-medium" style={{ color: 'var(--viz-text)' }}>No applications in {rangeWords} yet.</p>
              <p className="mt-1 text-sm">Add jobs on the Tracker tab and your insights will appear here. Everything is worked out on your own computer.</p>
            </div>
          ) : (
            <>
              {data.smallSample && (
                <p className="text-sm" style={{ color: 'var(--viz-text-2)' }}>
                  This is based on only {plural(data.total, 'application', 'applications')}, so treat the percentages as rough.
                </p>
              )}

              {data.highlights.length > 0 && (
                <section aria-label="What stands out" className="rounded-lg border bg-white p-5" style={{ borderColor: 'var(--viz-grid)' }}>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--viz-text)' }}>What stands out</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--viz-text-2)' }}>
                    {data.highlights.map((highlight, i) => <li key={i}>{highlight}</li>)}
                  </ul>
                </section>
              )}

              <ChartCard
                title="Where applications get to"
                takeaway={`${data.funnel[1].count} of ${data.total} applications (${formatPercent(data.funnel[1].pctOfTotal)}) reached a screen or interview.`}
                footnote="The furthest stage is recorded as you update each job. Jobs that were closed before this was tracked count at the stage they had when last updated."
                table={{
                  caption: 'How far applications got',
                  columns: ['Step', 'Applications', 'Share of all applications', 'Share of the step before'],
                  rows: data.funnel.map(step => [step.label, step.count, formatPercent(step.pctOfTotal), formatPercent(step.pctOfPrevious)])
                }}
              >
                <Funnel steps={data.funnel} tooltip={tooltip} />
              </ChartCard>

              <ChartCard
                title="What happened to them"
                takeaway={`${data.outcomes[0].count} in progress, ${data.outcomes[1].count} rejected, ${data.outcomes[2].count} with an offer.`}
                table={{
                  caption: 'Outcomes of your applications',
                  columns: ['Outcome', 'Applications', 'Share'],
                  rows: data.outcomes.map(outcome => [outcome.label, outcome.count, formatPercent(outcome.pct)])
                }}
              >
                <OutcomesBar outcomes={data.outcomes} total={data.total} tooltip={tooltip} />
              </ChartCard>

              <ChartCard
                title="Applications per week"
                takeaway={`${plural(data.kpis.thisWeek, 'application', 'applications')} this week, ${data.kpis.lastFourWeeks} in the last 4 weeks.`}
                table={{
                  caption: 'Applications per week',
                  columns: ['Week starting', 'Applications'],
                  rows: data.weekly.map(week => [week.label, week.count])
                }}
              >
                <WeeklyColumns weekly={data.weekly} tooltip={tooltip} />
              </ChartCard>

              <ChartCard
                title="Where they come from"
                takeaway="Each source, and how far its applications get."
                noTableToggle
              >
                <SourceBars sources={data.sources} />
              </ChartCard>
            </>
          )}
        </div>
      )}

      {tooltip.tooltip}
    </div>
  )
}
