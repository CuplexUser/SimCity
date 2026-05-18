import { useState, useEffect } from 'preact/hooks'
import { events, type LogEvent } from '../core/events'

const MAX_MESSAGES = 8

export function CityLog() {
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    return events.on<LogEvent>('log', ({ message }) => {
      setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), message])
    })
  }, [])

  if (messages.length === 0) return null

  return (
    <div style={{
      position:      'absolute',
      bottom:        36,
      left:          8,
      maxWidth:      340,
      background:    'rgba(0,0,0,0.72)',
      padding:       '6px 10px',
      borderRadius:  4,
      userSelect:    'none',
      pointerEvents: 'none',
    }}>
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            color:      '#ccc',
            fontSize:   12,
            fontFamily: 'monospace',
            lineHeight: '1.5',
            // Newest message full brightness, oldest at 40%
            opacity: messages.length === 1
              ? 1
              : 0.4 + 0.6 * (i / (messages.length - 1)),
          }}
        >
          {msg}
        </div>
      ))}
    </div>
  )
}
