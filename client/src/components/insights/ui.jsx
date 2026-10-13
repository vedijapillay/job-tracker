import { useCallback, useId, useState } from 'react'

// A tooltip that follows the pointer on hover and sits above the mark on keyboard focus, so the
// same details are available either way. Text goes in as React text nodes, never as HTML.
export function useTooltip() {
  const [tip, setTip] = useState(null)

  const show = useCallback((event, title, lines = []) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fromPointer = typeof event.clientX === 'number' && event.type.startsWith('pointer')
    const x = fromPointer ? event.clientX : rect.left + rect.width / 2
    const y = fromPointer ? event.clientY : rect.top
    setTip({ x: Math.min(Math.max(x, 110), window.innerWidth - 110), y, title, lines })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  const tooltip = tip && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-xs rounded-md border bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.x, top: tip.y - 10, transform: 'translate(-50%, -100%)', borderColor: 'var(--viz-grid)', color: 'var(--viz-text-2)' }}
    >
      <div className="text-sm font-semibold" style={{ color: 'var(--viz-text)' }}>{tip.title}</div>
      {tip.lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )

  return { show, hide, tooltip }
}

// One headline number. The "hero" tile is the single figure the page leads with.
export function StatTile({ label, value, note, hero = false }) {
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: 'var(--viz-grid)' }}>
      <div className="text-sm font-medium" style={{ color: 'var(--viz-text-2)' }}>{label}</div>
      <div
        className={`mt-1 font-semibold leading-none ${hero ? 'text-5xl' : 'text-3xl'}`}
        style={{ color: 'var(--viz-text)' }}
      >
        {value}
      </div>
      {note && <div className="mt-2 text-xs" style={{ color: 'var(--viz-muted)' }}>{note}</div>}
    </div>
  )
}

// The same numbers as the chart, as a plain table: the accessible twin every chart has
export function DataTable({ caption, columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="viz-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (j === 0 ? <th key={j} scope="row" className="font-medium" style={{ color: 'var(--viz-text)' }}>{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChartCard({ title, takeaway, footnote, table, noTableToggle = false, children }) {
  const [asTable, setAsTable] = useState(false)
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="rounded-lg border bg-white p-5" style={{ borderColor: 'var(--viz-grid)' }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-semibold" style={{ color: 'var(--viz-text)' }}>{title}</h2>
          {takeaway && <p className="mt-1 text-sm" style={{ color: 'var(--viz-text-2)' }}>{takeaway}</p>}
        </div>
        {!noTableToggle && <button
          type="button"
          onClick={() => setAsTable(value => !value)}
          aria-pressed={asTable}
          className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50"
          style={{ borderColor: 'var(--viz-axis)', color: 'var(--viz-text-2)' }}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>}
      </div>

      {asTable ? <DataTable {...table} /> : children}

      {footnote && <p className="mt-4 text-xs" style={{ color: 'var(--viz-muted)' }}>{footnote}</p>}
    </section>
  )
}

export const formatPercent = (value) => (value === null || value === undefined ? '–' : `${value}%`)
