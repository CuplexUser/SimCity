import { useState } from 'preact/hooks'
import { Zone, Building, type ActiveTool } from '../core/tile'

interface Props {
  onToolChange: (tool: ActiveTool) => void
}

type ToolKey = 'R' | 'C' | 'I' | 'PP' | 'WT' | 'road' | 'power' | 'bulldoze'

function keyToTool(key: ToolKey): ActiveTool {
  if (key === 'R')       return { kind: 'zone',     zone: Zone.Residential }
  if (key === 'C')       return { kind: 'zone',     zone: Zone.Commercial }
  if (key === 'I')       return { kind: 'zone',     zone: Zone.Industrial }
  if (key === 'PP')      return { kind: 'building', building: Building.PowerPlant }
  if (key === 'WT')      return { kind: 'building', building: Building.WaterTower }
  if (key === 'road')    return { kind: 'road' }
  if (key === 'power')   return { kind: 'power' }
  return { kind: 'bulldoze' }
}

const ZONE_BTNS: { key: ToolKey; label: string; bg: string; title: string }[] = [
  { key: 'R', label: 'R', bg: '#4aaa4a', title: 'Residential zone' },
  { key: 'C', label: 'C', bg: '#4a6eee', title: 'Commercial zone' },
  { key: 'I', label: 'I', bg: '#eecc4a', title: 'Industrial zone' },
]

const INFRA_BTNS: { key: ToolKey; label: string; bg: string; title: string }[] = [
  { key: 'PP',   label: '⚙',  bg: '#3a3a3a', title: 'Power Plant ($5,000)' },
  { key: 'WT',   label: '~',  bg: '#2d5c7a', title: 'Water Tower ($500)' },
  { key: 'road', label: '━',  bg: '#2a2a2a', title: 'Road' },
  { key: 'power',label: '⚡', bg: '#2a2a2a', title: 'Power line' },
]

const UTIL_BTNS: { key: ToolKey; label: string; title: string }[] = [
  { key: 'bulldoze', label: '✕', title: 'Bulldoze' },
]

export function Toolbar({ onToolChange }: Props) {
  const [active, setActive] = useState<ToolKey | null>(null)

  function handleClick(key: ToolKey) {
    const next = active === key ? null : key
    setActive(next)
    onToolChange(next ? keyToTool(next) : null)
  }

  const btn = (key: ToolKey, label: string, bg: string, fg: string, title: string) => (
    <button
      key={key}
      title={title}
      onClick={() => handleClick(key)}
      style={{
        width: 38, height: 38,
        border:      `2px solid ${active === key ? '#fff' : 'transparent'}`,
        background:  bg,
        color:       fg,
        cursor:      'pointer',
        borderRadius: 4,
        fontSize:    15,
        fontWeight:  'bold',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
      }}
    >{label}</button>
  )

  const divider = <div style={{ height: 1, background: '#444', margin: '2px 0' }} />

  return (
    <div style={{
      position:      'absolute',
      top:           8,
      left:          8,
      display:       'flex',
      flexDirection: 'column',
      gap:           4,
      background:    'rgba(0,0,0,0.80)',
      padding:       8,
      borderRadius:  6,
      userSelect:    'none',
    }}>
      {ZONE_BTNS.map(({ key, label, bg, title }) =>
        btn(key, label, bg, '#000', title)
      )}
      {divider}
      {INFRA_BTNS.map(({ key, label, bg, title }) =>
        btn(key, label, bg, '#eee', title)
      )}
      {divider}
      {UTIL_BTNS.map(({ key, label, title }) =>
        btn(key, label, '#2a2a2a', '#eee', title)
      )}
    </div>
  )
}
