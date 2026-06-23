import { ORDINANCES, type OrdinanceId, type OrdinanceState } from '../simulation/ordinances'

interface Props {
  ordinances:  OrdinanceState
  population:   number
  onToggle:     (id: OrdinanceId, on: boolean) => void
}

/** Toggleable budget ordinances — each shows its current annual cost/income at
 *  the city's population so the player can see the trade-off before enacting. */
export function OrdinancesPanel({ ordinances, population, onToggle }: Props) {
  return (
    <section>
      <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Ordinances
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {ORDINANCES.map((o) => {
          const on = ordinances[o.id]
          const amt = o.amount(population)
          const income = o.kind === 'income'
          return (
            <button
              key={o.id}
              title={o.description}
              onClick={() => onToggle(o.id, !on)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '4px 6px',
                border: `1px solid ${on ? '#5a7d4a' : '#333'}`,
                background: on ? '#1c2a18' : '#161616',
                borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ color: on ? '#9ddd7d' : '#666', fontSize: 12, width: 12 }}>
                {on ? '✓' : '○'}
              </span>
              <span style={{ color: '#ddd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.label}
              </span>
              <span style={{ color: income ? '#7ddd7d' : '#dd9a7d', fontSize: 11 }}>
                {income ? '+' : '−'}${amt.toLocaleString()}/yr
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
