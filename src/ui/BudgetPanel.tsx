interface Props {
  revenue: number
  expenses: number
}

export function BudgetPanel({ revenue, expenses }: Props) {
  const net = revenue - expenses
  return (
    <section>
      <h2>Budget</h2>
      <dl>
        <dt>Revenue</dt><dd>${revenue.toLocaleString()}</dd>
        <dt>Expenses</dt><dd>${expenses.toLocaleString()}</dd>
        <dt>Net</dt><dd>${net.toLocaleString()}</dd>
      </dl>
    </section>
  )
}
