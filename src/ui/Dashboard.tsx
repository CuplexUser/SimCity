import { BudgetPanel } from './BudgetPanel'
import { GraphPanel } from './GraphPanel'
import { AdvisorPanel } from './AdvisorPanel'
import { FinancePanel } from './FinancePanel'
import { type Bond, type CreditRating } from '../simulation/finance'

interface Props {
  revenue:      number
  expenses:     number
  popHistory:   number[]
  fundsHistory: number[]
  population:   number
  funds:        number
  power:        { powered: number; unpowered: number }
  water:        { watered: number; unwatered: number }
  burning:      number
  // Finance
  rating:       CreditRating
  debt:         number
  debtService:  number
  nextRate:     number
  bonds:        Bond[]
  onIssueBond:  (amount: number) => void
  onPayoffBond: (id: number) => void
  onClose:      () => void
}

/** Derive advisor messages from the current city state — the most actionable
 *  problems first, then a fallback if all's well. */
function buildAdvice(p: Props): string[] {
  const msgs: string[] = []
  if (p.burning > 0)            msgs.push(`🔥 ${p.burning} tile${p.burning === 1 ? '' : 's'} on fire — build fire stations for coverage.`)
  if (p.funds < 0)             msgs.push('💸 Treasury is in deficit — raise taxes or cut spending.')
  if (p.power.unpowered > 0)   msgs.push(`⚡ ${p.power.unpowered} zone${p.power.unpowered === 1 ? '' : 's'} lack power.`)
  if (p.water.unwatered > 0)   msgs.push(`💧 ${p.water.unwatered} zone${p.water.unwatered === 1 ? '' : 's'} lack water.`)
  if (p.population === 0)      msgs.push('🏘 Zone some land near roads to attract residents.')
  if (msgs.length === 0)       msgs.push('✅ The city is running smoothly.')
  return msgs
}

export function Dashboard(props: Props) {
  const { revenue, expenses, popHistory, fundsHistory, onClose } = props

  return (
    <div style={{
      position: 'absolute',
      top: 48,
      right: 8,
      width: 220,
      background: 'rgba(0,0,0,0.88)',
      border: '1px solid #444',
      borderRadius: 8,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      userSelect: 'none',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontSize: 13, letterSpacing: 1 }}>📊 City Data</span>
        <button
          onClick={onClose}
          title="Close"
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
        >×</button>
      </div>
      <BudgetPanel revenue={revenue} expenses={expenses} />
      <FinancePanel
        rating={props.rating}
        debt={props.debt}
        debtService={props.debtService}
        nextRate={props.nextRate}
        bonds={props.bonds}
        funds={props.funds}
        onIssueBond={props.onIssueBond}
        onPayoffBond={props.onPayoffBond}
      />
      <GraphPanel title="Population" values={popHistory} color="#5aee5a" />
      <GraphPanel title="Funds" values={fundsHistory} color="#7d9dff" />
      <AdvisorPanel messages={buildAdvice(props)} />
    </div>
  )
}
