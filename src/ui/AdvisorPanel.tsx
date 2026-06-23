interface Props {
  messages: string[]
}

export function AdvisorPanel({ messages }: Props) {
  return (
    <section>
      <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Advisors
      </div>
      {messages.length === 0
        ? <div style={{ color: '#666', fontSize: 11 }}>No advice right now.</div>
        : messages.map((message, index) => (
            <div key={index} style={{ color: '#ccc', fontSize: 12, lineHeight: '1.6' }}>
              {message}
            </div>
          ))}
    </section>
  )
}
