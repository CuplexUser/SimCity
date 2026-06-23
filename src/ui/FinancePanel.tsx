import { useState } from 'preact/hooks'
import { type Bond, type CreditRating, MIN_BOND, MAX_BOND } from '../simulation/finance'

interface Props {
  rating:       CreditRating
  debt:         number
  debtService:  number
  nextRate:     number   // interest rate a new bond would carry (fraction)
  bonds:        Bond[]
  funds:        number
  onIssueBond:  (amount: number) => void
  onPayoffBond: (id: number) => void
}

// Investment-grade ratings stay green; speculative grades shade toward red.
const RATING_COLOR: Record<CreditRating, string> = {
  AAA: '#5aee5a', AA: '#7ddd7d', A: '#aadd6a', BBB: '#ffd23a',
  BB: '#ffae42', B: '#ff8c2a', CCC: '#ee5555',
}

export function FinancePanel({ rating, debt, debtService, nextRate, bonds, funds, onIssueBond, onPayoffBond }: Props) {
  const [amount, setAmount] = useState(MIN_BOND)

  const row = (label: string, value: string, color = '#ddd') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '1.7' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )

  const clamp = (n: number) => Math.max(MIN_BOND, Math.min(MAX_BOND, Math.round(n)))

  const inputStyle = {
    width: '100%', height: 26, border: '1px solid #555', background: '#111',
    color: '#eee', borderRadius: 4, padding: '0 6px', fontSize: 12, boxSizing: 'border-box' as const,
  }
  const btnStyle = (enabled: boolean) => ({
    border: '1px solid #555', borderRadius: 4, fontSize: 11, padding: '3px 6px',
    background: enabled ? '#1f3a1f' : '#222', color: enabled ? '#9cffa0' : '#666',
    cursor: enabled ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' as const,
  })

  return (
    <section>
      <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Finance
      </div>
      {row('Credit rating', rating, RATING_COLOR[rating])}
      {row('Total debt', `$${debt.toLocaleString()}`, debt > 0 ? '#ffb27d' : '#ddd')}
      {debtService > 0 && row('Annual payment', `$${debtService.toLocaleString()}`, '#ffb27d')}

      <div style={{ borderTop: '1px solid #444', margin: '6px 0' }} />

      {/* Issue a new bond */}
      <div style={{ fontSize: 11, color: '#999', marginBottom: 3 }}>
        Issue 10-yr bond @ {(nextRate * 100).toFixed(1)}%
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="number"
          min={MIN_BOND}
          max={MAX_BOND}
          step={1000}
          value={amount}
          onInput={(e) => setAmount(clamp(Number((e.currentTarget as HTMLInputElement).value)))}
          style={inputStyle}
        />
        <button
          onClick={() => onIssueBond(clamp(amount))}
          title={`Borrow $${clamp(amount).toLocaleString()} now; repay over 10 years`}
          style={btnStyle(true)}
        >Issue</button>
      </div>

      {/* Outstanding bonds */}
      {bonds.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {bonds.map((b) => {
            const canPay = funds >= Math.round(b.balance)
            return (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <span style={{ color: '#bbb' }}>
                  ${Math.round(b.balance).toLocaleString()} @ {(b.rate * 100).toFixed(1)}% · {b.remaining}y
                </span>
                <button
                  onClick={() => canPay && onPayoffBond(b.id)}
                  title={canPay ? `Pay off $${Math.round(b.balance).toLocaleString()} now` : 'Not enough funds to pay this off'}
                  style={btnStyle(canPay)}
                >Pay off</button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
