interface Props {
  revenue: number
  expenses: number
}

export function BudgetPanel({ revenue, expenses }: Props) {
  const net = revenue - expenses
  const netColor = net >= 0 ? '#5aee5a' : '#ee5555'

  const row = (label: string, value: number, color: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '1.7' }}>
      <span style={{ color: '#aaa' }}>{label}</span>
      <span style={{ color }}>${value.toLocaleString()}</span>
    </div>
  )

  return (
    <section>
      <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Annual Budget
      </div>
      {row('Revenue', revenue, '#9cc8ff')}
      {row('Expenses', -expenses, '#ffb27d')}
      <div style={{ borderTop: '1px solid #444', margin: '4px 0' }} />
      {row('Net', net, netColor)}
    </section>
  )
}
