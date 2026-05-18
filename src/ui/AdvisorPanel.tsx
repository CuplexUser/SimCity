interface Props {
  messages: string[]
}

export function AdvisorPanel({ messages }: Props) {
  return (
    <aside>
      <h2>Advisors</h2>
      <ul>
        {messages.map((message, index) => <li key={index}>{message}</li>)}
      </ul>
    </aside>
  )
}
