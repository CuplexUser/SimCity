interface Props {
  title: string
  values: number[]
}

export function GraphPanel({ title, values }: Props) {
  const max = Math.max(1, ...values)
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 80 }}>
        {values.map((value, index) => (
          <div
            key={index}
            title={value.toLocaleString()}
            style={{ width: 8, height: `${Math.max(2, (value / max) * 80)}px`, background: '#5aee5a' }}
          />
        ))}
      </div>
    </section>
  )
}
