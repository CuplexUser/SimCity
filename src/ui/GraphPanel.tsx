interface Props {
  title: string
  values: number[]
  color?: string
}

export function GraphPanel({ title, values, color = '#5aee5a' }: Props) {
  const max = Math.max(1, ...values)
  const latest = values.length > 0 ? values[values.length - 1] : 0

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
        <span style={{ color, fontSize: 12 }}>{latest.toLocaleString()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'end', gap: 1, height: 48 }}>
        {values.length === 0
          ? <span style={{ color: '#666', fontSize: 11 }}>No data yet</span>
          : values.map((value, index) => (
              <div
                key={index}
                title={value.toLocaleString()}
                style={{
                  flex: 1,
                  minWidth: 2,
                  height: `${Math.max(2, (value / max) * 48)}px`,
                  background: color,
                  opacity: 0.85,
                }}
              />
            ))}
      </div>
    </section>
  )
}
