import { BudgetPanel } from './BudgetPanel'
import { HistoryGraph } from './HistoryGraph'
import { AdvisorPanel } from './AdvisorPanel'
import { FinancePanel } from './FinancePanel'
import { OrdinancesPanel } from './OrdinancesPanel'
import { ratingLabel } from '../simulation/cityRating'
import { type OrdinanceId, type OrdinanceState } from '../simulation/ordinances'
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
  cityRating:   number
  // Finance
  rating:       CreditRating
  debt:         number
  debtService:  number
  nextRate:     number
  bonds:        Bond[]
  onIssueBond:  (amount: number) => void
  onPayoffBond: (id: number) => void
  // Ordinances
  ordinances:   OrdinanceState
  onOrdinance:  (id: OrdinanceId, on: boolean) => void
  onClose:      () => void
}

/** Color the rating number from red (crisis) through yellow to green (thriving). */
function ratingColor(score: number): string {
  if (score >= 70) return '#5aee5a'
  if (score >= 55) return '#b6e85a'
  if (score >= 40) return '#e8d35a'
  if (score >= 25) return '#e8985a'
  return '#e85a5a'
}

/** Derive advisor messages from the current city state — the most actionable
 *  problems first, then a fallback if all's well. */
function buildAdvice(p: Props): string[] {
  const msgs: string[] = []
  if (p.burning > 0)            msgs.push(`🔥 ${p.burning} tile${p.burning === 1 ? '' : 's'} on fire — build fire stations for coverage.`)
  if (p.funds < 0)             msgs.push('💸 Treasury is in deficit — raise taxes or cut spending.')
  if (p.power.unpowered > 0)   msgs.push(`⚡ ${p.power.unpowered} zone${p.power.unpowered === 1 ? '' : 's'} lack power.`)
  if (p.water.unwatered > 0)   msgs.push(`💧 ${p.water.unwatered} zone${p.water.unwatered === 1 ? '' : 's'} lack water.`)
  if (p.cityRating < 40)       msgs.push('📉 Approval is low — add parks and services to lift land value.')
  if (p.population === 0)      msgs.push('🏘 Zone some land near roads to attract residents.')
  if (msgs.length === 0)       msgs.push('✅ The city is running smoothly.')
  return msgs
}

export function Dashboard(props: Props) {
  const { revenue, expenses, popHistory, fundsHistory, cityRating, onClose } = props

  return (
    <div style={{
      position: 'absolute',
      top: 48,
      right: 8,
      width: 220,
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
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

      {/* City approval rating */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>City Rating</span>
        <span style={{ color: ratingColor(cityRating), fontSize: 13 }}>
          {cityRating} · {ratingLabel(cityRating)}
        </span>
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
      <OrdinancesPanel
        ordinances={props.ordinances}
        population={props.population}
        onToggle={props.onOrdinance}
      />
      <HistoryGraph title="Population" values={popHistory} color="#5aee5a" />
      <HistoryGraph title="Funds" values={fundsHistory} color="#7d9dff" />
      <AdvisorPanel messages={buildAdvice(props)} />
    </div>
  )
}
