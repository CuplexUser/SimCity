import { useState } from 'preact/hooks'
import { Zone, type ActiveTool } from '../core/tile'

interface Props {
  onToolChange: (tool: ActiveTool) => void
}

type ToolKey = 'R' | 'C' | 'I' | 'road' | 'power' | 'bulldoze'

function keyToTool(key: ToolKey): ActiveTool {
  if (key === 'R')       return { kind: 'zone', zone: Zone.Residential }
  if (key === 'C')       return { kind: 'zone', zone: Zone.Commercial }
  if (key === 'I')       return { kind: 'zone', zone: Zone.Industrial }
  if (key === 'road')    return { kind: 'road' }
  if (key === 'power')   return { kind: 'power' }
  // bulldoze
  return { kind: 'bulldoze' }
}

const ZONE_BUTTONS: { key: ToolKey; label: string; color: string; title: string }[] = [
  { key: 'R', label: 'R', color: '#4aaa4a', title: 'Residential zone' },
  { key: 'C', label: 'C', color: '#4a6eee', title: 'Commercial zone' },
  { key: 'I', label: 'I', color: '#eecc4a', title: 'Industrial zone' },
]

const TOOL_BUTTONS: { key: ToolKey; label: string; title: string }[] = [
  { key: 'road',    label: '━', title: 'Road' },
  { key: 'power',   label: '⚡', title: 'Power line' },
  { key: 'bulldoze',label: '✕', title: 'Bulldoze' },
]

export function Toolbar({ onToolChange }: Props) {
  const [active, setActive] = useState<ToolKey | null>(null)

  function handleClick(key: ToolKey) {
    const next = active === key ? null : key
    setActive(next)
    onToolChange(next ? keyToTool(next) : null)
  }

  const btnBase: preact.JSX.CSSProperties = {
    width: 38, height: 38,
    border: '2px solid transparent',
    cursor: 'pointer', borderRadius: 4,
    fontSize: 14, fontWeight: 'bold',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8,
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(0,0,0,0.78)', padding: 8, borderRadius: 6,
      userSelect: 'none',
    }}>
      {ZONE_BUTTONS.map(({ key, label, color, title }) => (
        <button
          key={key}
          title={title}
          onClick={() => handleClick(key)}
          style={{
            ...btnBase,
            background: color,
            color: '#000',
            borderColor: active === key ? '#fff' : 'transparent',
          }}
        >{label}</button>
      ))}

      <div style={{ height: 1, background: '#444', margin: '2px 0' }} />

      {TOOL_BUTTONS.map(({ key, label, title }) => (
        <button
          key={key}
          title={title}
          onClick={() => handleClick(key)}
          style={{
            ...btnBase,
            background: '#2a2a2a',
            color: '#ddd',
            borderColor: active === key ? '#fff' : 'transparent',
            fontSize: key === 'bulldoze' ? 16 : 18,
          }}
        >{label}</button>
      ))}
    </div>
  )
}
