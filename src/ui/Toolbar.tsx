import { useState } from 'preact/hooks'
import { Zone, Building, type ActiveTool, type BulldozeMode } from '../core/tile'

export type ToolKey = 'R' | 'C' | 'I' | 'PP' | 'WT' | 'PS' | 'road' | 'power' | 'dozeNormal' | 'dozeTerrain' | 'dozeZoning'

export function keyToTool(key: ToolKey): ActiveTool {
  if (key === 'R')       return { kind: 'zone',     zone: Zone.Residential }
  if (key === 'C')       return { kind: 'zone',     zone: Zone.Commercial }
  if (key === 'I')       return { kind: 'zone',     zone: Zone.Industrial }
  if (key === 'PP')      return { kind: 'building', building: Building.PowerPlant }
  if (key === 'WT')      return { kind: 'building', building: Building.WaterTower }
  if (key === 'PS')      return { kind: 'building', building: Building.PoliceStation }
  if (key === 'road')    return { kind: 'road' }
  if (key === 'power')   return { kind: 'power' }
  return { kind: 'bulldoze', mode: bulldozeModeForKey(key) }
}

interface Props {
  activeKey:    ToolKey | null
  onKeyChange:  (key: ToolKey | null) => void
  onNewGame:    () => void | Promise<void>
  onSaveState:  () => void | Promise<void>
  onLoadState:  () => void | Promise<void>
  onOptionsOpen: () => void | Promise<void>
  cityName:     string
  onCityNameChange: (name: string) => void
  savedCities:  string[]
  status:       string
}

const ZONE_BTNS: { key: ToolKey; label: string; bg: string; title: string }[] = [
  { key: 'R', label: 'R', bg: '#4aaa4a', title: 'Residential zone [1]' },
  { key: 'C', label: 'C', bg: '#4a6eee', title: 'Commercial zone [2]' },
  { key: 'I', label: 'I', bg: '#eecc4a', title: 'Industrial zone [3]' },
]

const INFRA_BTNS: { key: ToolKey; label: string; bg: string; title: string }[] = [
  { key: 'PP',    label: '⚙',  bg: '#3a3a3a', title: 'Power Plant ($5,000) [P]' },
  { key: 'WT',    label: '~',  bg: '#2d5c7a', title: 'Water Tower ($500) [W]' },
  { key: 'PS',    label: '★',  bg: '#1f4f8f', title: 'Police Station ($1,000) [O]' },
  { key: 'road',  label: '━',  bg: '#2a2a2a', title: 'Road ($10/tile) [R]' },
  { key: 'power', label: '⚡', bg: '#2a2a2a', title: 'Power line ($5/tile) [L]' },
]

const UTIL_BTNS: { key: ToolKey; label: string; title: string }[] = [
  { key: 'dozeNormal',  label: 'B1', title: 'Bulldoze normal: remove buildings, roads, and development [B]' },
  { key: 'dozeTerrain', label: 'B2', title: 'Bulldoze terrain: clear and level tile [B then 2]' },
  { key: 'dozeZoning',  label: 'B3', title: 'Bulldoze zoning: remove zone only [B then 3]' },
]

export function bulldozeModeForKey(key: ToolKey): BulldozeMode {
  if (key === 'dozeTerrain') return 'terrain'
  if (key === 'dozeZoning')  return 'zoning'
  return 'normal'
}

export function bulldozeKeyForMode(mode: BulldozeMode): ToolKey {
  if (mode === 'terrain') return 'dozeTerrain'
  if (mode === 'zoning')  return 'dozeZoning'
  return 'dozeNormal'
}

export function Toolbar({
  activeKey,
  onKeyChange,
  onNewGame,
  onSaveState,
  onLoadState,
  onOptionsOpen,
  cityName,
  onCityNameChange,
  savedCities,
  status,
}: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false)

  function handleClick(key: ToolKey) {
    onKeyChange(activeKey === key ? null : key)
  }

  async function runAction(action: () => void | Promise<void>) {
    await action()
  }

  function toggleOptions() {
    setOptionsOpen((open) => {
      if (!open) void onOptionsOpen()
      return !open
    })
  }

  const btn = (key: ToolKey, label: string, bg: string, fg: string, title: string) => (
    <button
      key={key}
      title={title}
      onClick={() => handleClick(key)}
      style={{
        width: 38, height: 38,
        border:      `2px solid ${activeKey === key ? '#fff' : 'transparent'}`,
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
      {divider}
      <button
        type="button"
        title="Options"
        onClick={toggleOptions}
        style={{
          width: 38, height: 38,
          border:      `2px solid ${optionsOpen ? '#fff' : 'transparent'}`,
          background:  '#242424',
          color:       '#eee',
          cursor:      'pointer',
          borderRadius: 4,
          fontSize:    18,
          fontWeight:  'bold',
        }}
      >...</button>
      {optionsOpen && (
        <div style={{
          position:   'absolute',
          left:       56,
          bottom:     8,
          width:      150,
          background: 'rgba(0,0,0,0.88)',
          border:     '1px solid #555',
          borderRadius: 6,
          padding:    6,
          display:    'flex',
          flexDirection: 'column',
          gap:        4,
        }}>
          <input
            value={cityName}
            placeholder="City name"
            onInput={(e) => onCityNameChange((e.currentTarget as HTMLInputElement).value)}
            style={{
              height: 28,
              border: '1px solid #555',
              background: '#111',
              color: '#eee',
              borderRadius: 4,
              padding: '0 8px',
            }}
          />
          {savedCities.length > 0 && (
            <select
              value={savedCities.includes(cityName) ? cityName : ''}
              onChange={(e) => onCityNameChange((e.currentTarget as HTMLSelectElement).value)}
              style={{
                height: 28,
                border: '1px solid #555',
                background: '#111',
                color: '#eee',
                borderRadius: 4,
              }}
            >
              <option value="">Load...</option>
              {savedCities.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {[
            { label: 'New City', action: onNewGame },
            { label: 'Save City', action: onSaveState },
            { label: 'Load City', action: onLoadState },
          ].map(({ label, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => { void runAction(action) }}
              style={{
                height: 28,
                border: '1px solid #555',
                background: '#1f1f1f',
                color: '#eee',
                cursor: 'pointer',
                borderRadius: 4,
                textAlign: 'left',
                padding: '0 8px',
              }}
            >{label}</button>
          ))}
          {status && <div style={{ color: '#aaa', fontSize: 11, padding: '2px 4px' }}>{status}</div>}
        </div>
      )}
    </div>
  )
}
