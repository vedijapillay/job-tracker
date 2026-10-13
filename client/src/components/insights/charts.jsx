import { formatPercent } from './ui'

const STAGE_COLORS = ['var(--viz-stage-1)', 'var(--viz-stage-2)', 'var(--viz-stage-3)', 'var(--viz-stage-4)']

// Outcome colors are fixed per outcome, so a filter that hides one never repaints the others.
// Text inside a segment is white on the dark blue and near-black on the lighter fills.
const OUTCOME_STYLE = {
  inProgress: { color: 'var(--viz-s1)', ink: '#ffffff' },
  rejected: { color: 'var(--viz-s2)', ink: 'var(--viz-text)' },
  offer: { color: 'var(--viz-s3)', ink: 'var(--viz-text)' },
  ghosted: { color: 'var(--viz-s4)', ink: 'var(--viz-text)' },
  declined: { color: 'var(--viz-s5)', ink: 'var(--viz-text)' }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// ---- Funnel: how far applications get, as ordered steps in one hue ----
export function Funnel({ steps, tooltip }) {
  const top = steps[0].count

  return (
    <div role="group" aria-label="Application funnel" className="space-y-4">
      {steps.map((step, i) => {
        const ratio = top > 0 ? step.count / top : 0
        const summary = `${step.label}: ${step.count} of ${top}`
        const lines = [
          `${formatPercent(step.pctOfTotal)} of all applications`,
          ...(i > 0 ? [`${formatPercent(step.pctOfPrevious)} of the step before`] : [])
        ]

        return (
          <div key={step.key} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[15rem_1fr]">
            <div>
              <div className="text-sm" style={{ color: 'var(--viz-text)' }}>{step.label}</div>
              {i > 0 && (
                <div className="text-xs" style={{ color: 'var(--viz-muted)' }}>
                  {formatPercent(step.pctOfPrevious)} of the step before
                </div>
              )}
            </div>

            {/* The whole row is the hover and keyboard target, so it is easy to hit */}
            <div
              tabIndex={0}
              role="img"
              aria-label={`${summary}${i > 0 ? `, ${formatPercent(step.pctOfPrevious)} of the step before` : ''}`}
              className="flex h-8 items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onPointerMove={event => tooltip.show(event, summary, lines)}
              onPointerLeave={tooltip.hide}
              onFocus={event => tooltip.show(event, summary, lines)}
              onBlur={tooltip.hide}
            >
              <div
                className="h-6 rounded-r-[4px]"
                style={{
                  // Leave room after the bar for its value
                  width: `calc((100% - 3.5rem) * ${ratio})`,
                  minWidth: step.count > 0 ? '4px' : 0,
                  background: STAGE_COLORS[i]
                }}
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--viz-text)' }}>{step.count}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---- Outcomes: one stacked bar, part of a whole, with 2px gaps between segments ----
export function OutcomesBar({ outcomes, total, tooltip }) {
  if (total === 0) {
    return <p className="text-sm" style={{ color: 'var(--viz-text-2)' }}>No applications in this period yet.</p>
  }

  const present = outcomes.filter(outcome => outcome.count > 0)

  return (
    <div role="group" aria-label="Outcomes of your applications">
      <div className="flex h-8 gap-[2px]">
        {present.map(outcome => {
          const style = OUTCOME_STYLE[outcome.key]
          const summary = `${outcome.label}: ${outcome.count}`
          const lines = [`${formatPercent(outcome.pct)} of ${plural(total, 'application', 'applications')}`]
          return (
            <div
              key={outcome.key}
              tabIndex={0}
              role="img"
              aria-label={`${summary}, ${formatPercent(outcome.pct)}`}
              className="flex items-center justify-center text-sm font-semibold first:rounded-l-[4px] last:rounded-r-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:opacity-85"
              style={{ flex: `${outcome.count} 1 0`, background: style.color, color: style.ink }}
              onPointerMove={event => tooltip.show(event, summary, lines)}
              onPointerLeave={tooltip.hide}
              onFocus={event => tooltip.show(event, summary, lines)}
              onBlur={tooltip.hide}
            >
              {/* Only label a segment when the text surely fits; the legend and tooltip carry the rest */}
              {outcome.pct >= 12 ? outcome.count : ''}
            </div>
          )
        })}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {outcomes.map(outcome => (
          <li key={outcome.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: OUTCOME_STYLE[outcome.key].color }} />
            <span style={{ color: 'var(--viz-text-2)' }}>{outcome.label}</span>
            <span className="font-semibold" style={{ color: 'var(--viz-text)' }}>{outcome.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Applications per week: one series, one color ----
function niceTop(max) {
  return Math.max(4, Math.ceil(max / 2) * 2) // even, so the middle tick is a whole number
}

export function WeeklyColumns({ weekly, tooltip }) {
  const max = Math.max(...weekly.map(week => week.count), 0)
  const top = niceTop(max)
  const busiest = max > 0 ? weekly.findIndex(week => week.count === max) : -1
  const last = weekly.length - 1
  const ticks = [top, top / 2, 0]

  return (
    <div role="group" aria-label="Applications per week">
      <div className="flex">
        {/* y-axis labels */}
        <div className="relative h-44 w-7 shrink-0 text-xs" style={{ color: 'var(--viz-muted)' }} aria-hidden="true">
          {ticks.map(tick => (
            <span key={tick} className="absolute right-1 -translate-y-1/2" style={{ top: `${100 - (tick / top) * 100}%` }}>{tick}</span>
          ))}
        </div>

        <div className="relative h-44 flex-1">
          {/* hairline, solid gridlines */}
          {ticks.map(tick => (
            <div
              key={tick}
              aria-hidden="true"
              className="absolute left-0 right-0 border-t"
              style={{ top: `${100 - (tick / top) * 100}%`, borderColor: tick === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)' }}
            />
          ))}

          <div className="absolute inset-0 flex">
            {weekly.map((week, i) => {
              const summary = `Week of ${week.label}: ${plural(week.count, 'application', 'applications')}`
              // Label only the current week and the busiest one; the axis, tooltip and table carry the rest
              const labelled = week.count > 0 && (i === last || i === busiest)
              return (
                <div
                  key={week.weekStart}
                  tabIndex={0}
                  role="img"
                  aria-label={summary}
                  className="group flex h-full min-w-[24px] flex-1 flex-col items-center justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  onPointerMove={event => tooltip.show(event, summary)}
                  onPointerLeave={tooltip.hide}
                  onFocus={event => tooltip.show(event, summary)}
                  onBlur={tooltip.hide}
                >
                  {labelled && <span className="mb-1 text-xs font-semibold" style={{ color: 'var(--viz-text)' }}>{week.count}</span>}
                  <div
                    className="w-full max-w-[24px] rounded-t-[4px] group-hover:opacity-80 group-focus:opacity-80"
                    style={{ height: `${(week.count / top) * 100}%`, background: 'var(--viz-s1)' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* x-axis labels: every other one on narrow screens so they never collide. Hidden labels keep
          their space (invisible, not removed), otherwise the rest would drift away from their columns. */}
      <div className="ml-7 mt-1 flex text-xs" style={{ color: 'var(--viz-muted)' }} aria-hidden="true">
        {weekly.map((week, i) => (
          <span key={week.weekStart} className={`min-w-[24px] flex-1 text-center ${i % 2 === (last % 2 === 0 ? 1 : 0) ? 'invisible sm:visible' : ''}`}>
            {week.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---- By source: a table with small bars. Sources have no natural order, so every bar is the same color. ----
export function SourceBars({ sources }) {
  const max = Math.max(...sources.map(source => source.count), 1)

  if (sources.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--viz-text-2)' }}>No applications in this period yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="viz-table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Applications</th>
            <th scope="col">Reached a screen or interview</th>
            <th scope="col">Offers</th>
          </tr>
        </thead>
        <tbody>
          {sources.map(source => (
            <tr key={source.source}>
              <th scope="row" className="font-medium" style={{ color: 'var(--viz-text)' }}>{source.source}</th>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 shrink-0" aria-hidden="true">
                    <div className="h-2 rounded-r-[4px]" style={{ width: `${(source.count / max) * 100}%`, background: 'var(--viz-s1)' }} />
                  </div>
                  <span className="font-semibold" style={{ color: 'var(--viz-text)' }}>{source.count}</span>
                </div>
              </td>
              <td style={{ color: 'var(--viz-text-2)' }}>
                {source.interviews} of {source.count} ({formatPercent(source.interviewRate)})
              </td>
              <td style={{ color: 'var(--viz-text-2)' }}>{source.offers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
