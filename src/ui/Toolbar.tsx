import { useRef, useState } from 'preact/hooks'
import { Zone, Building, type ActiveTool, type BulldozeMode } from '../core/tile'

export type ToolKey =
  | 'R' | 'C' | 'I'
  | 'PP' | 'GT' | 'NP' | 'SF' | 'WN'
  | 'WT' | 'PS' | 'FS' | 'HP' | 'SC' | 'LB'
  | 'road' | 'power'
  | 'dozeNormal' | 'dozeTerrain' | 'dozeZoning'

export function keyToTool(key: ToolKey): ActiveTool {
  if (key === 'R')    return { kind: 'zone',     zone: Zone.Residential }
  if (key === 'C')    return { kind: 'zone',     zone: Zone.Commercial }
  if (key === 'I')    return { kind: 'zone',     zone: Zone.Industrial }
  if (key === 'PP')   return { kind: 'building', building: Building.PowerPlant }
  if (key === 'GT')   return { kind: 'building', building: Building.GasTurbine }
  if (key === 'NP')   return { kind: 'building', building: Building.Nuclear }
  if (key === 'SF')   return { kind: 'building', building: Building.SolarFarm }
  if (key === 'WN')   return { kind: 'building', building: Building.WindTurbine }
  if (key === 'WT')   return { kind: 'building', building: Building.WaterTower }
  if (key === 'PS')   return { kind: 'building', building: Building.PoliceStation }
  if (key === 'FS')   return { kind: 'building', building: Building.FireStation }
  if (key === 'HP')   return { kind: 'building', building: Building.Hospital }
  if (key === 'SC')   return { kind: 'building', building: Building.School }
  if (key === 'LB')   return { kind: 'building', building: Building.Library }
  if (key === 'road') return { kind: 'road' }
  if (key === 'power')return { kind: 'power' }
  return { kind: 'bulldoze', mode: bulldozeModeForKey(key) }
}

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

type CategoryId = 'zones' | 'power' | 'services' | 'roads' | 'doze' | 'view' | 'options'

interface ToolBtn { key: ToolKey; label: string; bg: string; fg?: string; title: string }

const CATEGORIES: { id: CategoryId; icon: string; label: string }[] = [
  { id: 'zones',    icon: '🏘',  label: 'Zones' },
  { id: 'power',    icon: '⚡',  label: 'Power' },
  { id: 'services', icon: '🏛',  label: 'Services' },
  { id: 'roads',    icon: '🛣',  label: 'Roads' },
  { id: 'doze',     icon: '🔨',  label: 'Bulldoze' },
  { id: 'view',     icon: '👁',   label: 'View' },
  { id: 'options',  icon: '⚙',   label: 'Options' },
]

const ZONE_BTNS: ToolBtn[] = [
  { key: 'R', label: 'Residential', bg: '#1a3a1a', fg: '#7ddd7d', title: 'Residential zone [1]' },
  { key: 'C', label: 'Commercial',  bg: '#1a1e4a', fg: '#7d9dff', title: 'Commercial zone [2]' },
  { key: 'I', label: 'Industrial',  bg: '#3a2e00', fg: '#ffdd6a', title: 'Industrial zone [3]' },
]

const POWER_BTNS: ToolBtn[] = [
  { key: 'PP', label: 'Coal Plant ($5,000)',    bg: '#1e1e1e', title: 'Coal Plant [P]' },
  { key: 'GT', label: 'Gas Turbine ($3,000)',   bg: '#1e222e', title: 'Gas Turbine' },
  { key: 'NP', label: 'Nuclear ($15,000)',      bg: '#0e1a0e', title: 'Nuclear Plant' },
  { key: 'SF', label: 'Solar Farm ($2,000)',    bg: '#0e0e1e', title: 'Solar Farm' },
  { key: 'WN', label: 'Wind Turbine ($1,200)',  bg: '#1a1a22', title: 'Wind Turbine' },
]

const SERVICE_BTNS: ToolBtn[] = [
  { key: 'WT', label: 'Water Tower ($500)',     bg: '#0a1e2a', title: 'Water Tower [W]' },
  { key: 'PS', label: 'Police Station ($1,000)',bg: '#0a1230', title: 'Police Station [O]' },
  { key: 'FS', label: 'Fire Station ($1,000)',  bg: '#2a0a0a', title: 'Fire Station' },
  { key: 'HP', label: 'Hospital ($1,500)',      bg: '#0a1a0a', title: 'Hospital' },
  { key: 'SC', label: 'School ($750)',          bg: '#1a1200', title: 'School' },
  { key: 'LB', label: 'Library ($500)',         bg: '#120a00', title: 'Library' },
]

const ROAD_BTNS: ToolBtn[] = [
  { key: 'road',  label: 'Road ($10/tile)',       bg: '#1a1a1a', title: 'Road [R]' },
  { key: 'power', label: 'Power line ($5/tile)',  bg: '#1a1a00', title: 'Power line [L]' },
]

const DOZE_BTNS: ToolBtn[] = [
  { key: 'dozeNormal',  label: 'Bulldoze',         bg: '#2a1a0a', title: 'Bulldoze buildings, roads [B]' },
  { key: 'dozeTerrain', label: 'Level terrain',    bg: '#1a2a0a', title: 'Clear & level terrain' },
  { key: 'dozeZoning',  label: 'Remove zone',      bg: '#0a1a2a', title: 'Remove zoning only' },
]

const TOOL_ICONS: Partial<Record<ToolKey, string>> = {
  R: '🏘', C: '🏢', I: '🏭',
  PP: '🏭', GT: '💨', NP: '⚛', SF: '☀', WN: '🌬',
  WT: '💧', PS: '🚔', FS: '🚒', HP: '🏥', SC: '🏫', LB: '📚',
  road: '━', power: '⚡',
  dozeNormal: '🔨', dozeTerrain: '⛏', dozeZoning: '✂',
}

function categoryForKey(key: ToolKey): CategoryId {
  if (['R', 'C', 'I'].includes(key)) return 'zones'
  if (['PP', 'GT', 'NP', 'SF', 'WN'].includes(key)) return 'power'
  if (['WT', 'PS', 'FS', 'HP', 'SC', 'LB'].includes(key)) return 'services'
  if (['road', 'power'].includes(key)) return 'roads'
  return 'doze'
}

interface Props {
  activeKey:    ToolKey | null
  onKeyChange:  (key: ToolKey | null) => void
  onNewGame:    () => void | Promise<void>
  onSaveState:  () => void | Promise<void>
  onLoadState:  () => void | Promise<void>
  onExportFile: () => void | Promise<void>
  onImportFile: (file: File) => void | Promise<void>
  onOptionsOpen: () => void | Promise<void>
  cityName:     string
  onCityNameChange: (name: string) => void
  savedCities:  string[]
  status:       string
  nightMode:       boolean
  onNightMode:     (on: boolean) => void
  showZoneOverlay: boolean
  onZoneOverlay:   (on: boolean) => void
}

export function Toolbar({
  activeKey, onKeyChange,
  onNewGame, onSaveState, onLoadState, onExportFile, onImportFile, onOptionsOpen,
  cityName, onCityNameChange, savedCities, status,
  nightMode, onNightMode, showZoneOverlay, onZoneOverlay,
}: Props) {
  const [openCat, setOpenCat] = useState<CategoryId | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggleCat(id: CategoryId) {
    if (id === 'options') {
      setOpenCat(prev => {
        if (prev !== 'options') void onOptionsOpen()
        return prev === 'options' ? null : 'options'
      })
      return
    }
    setOpenCat(prev => prev === id ? null : id)
  }

  function handleToolClick(key: ToolKey) {
    onKeyChange(activeKey === key ? null : key)
  }

  const activeCat = activeKey ? categoryForKey(activeKey) : null

  const railBtn = (cat: { id: CategoryId; icon: string; label: string }) => {
    const isOpen = openCat === cat.id
    const hasActive = activeCat === cat.id
    return (
      <button
        key={cat.id}
        title={cat.label}
        onClick={() => toggleCat(cat.id)}
        style={{
          width: 44, height: 44,
          border: `2px solid ${isOpen ? '#aaa' : hasActive ? '#666' : 'transparent'}`,
          background: isOpen ? '#333' : hasActive ? '#2a2a2a' : '#1a1a1a',
          color: '#eee',
          cursor: 'pointer',
          borderRadius: 6,
          fontSize: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >{cat.icon}</button>
    )
  }

  const toolBtn = (btn: ToolBtn) => {
    const isActive = activeKey === btn.key
    const icon = TOOL_ICONS[btn.key] ?? btn.label[0]
    return (
      <button
        key={btn.key}
        title={btn.title}
        onClick={() => handleToolClick(btn.key)}
        style={{
          width: '100%',
          height: 36,
          border: `2px solid ${isActive ? '#fff' : 'transparent'}`,
          background: isActive ? '#444' : btn.bg,
          color: btn.fg ?? '#ddd',
          cursor: 'pointer',
          borderRadius: 4,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          textAlign: 'left',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{btn.label}</span>
      </button>
    )
  }

  const toggleBtn = (label: string, active: boolean, onChange: (v: boolean) => void, hint: string) => (
    <button
      key={label}
      title={hint}
      onClick={() => onChange(!active)}
      style={{
        width: '100%',
        height: 36,
        border: `2px solid ${active ? '#fff' : 'transparent'}`,
        background: active ? '#334' : '#1a1a2a',
        color: active ? '#aaeeff' : '#aaa',
        cursor: 'pointer',
        borderRadius: 4,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>
        {active ? '✓' : '○'}
      </span>
      <span>{label}</span>
    </button>
  )

  const submenuBtns = () => {
    if (openCat === 'zones')    return ZONE_BTNS.map(toolBtn)
    if (openCat === 'power')    return POWER_BTNS.map(toolBtn)
    if (openCat === 'services') return SERVICE_BTNS.map(toolBtn)
    if (openCat === 'roads')    return ROAD_BTNS.map(toolBtn)
    if (openCat === 'doze')     return DOZE_BTNS.map(toolBtn)
    if (openCat === 'view') return [
      toggleBtn('Night Mode',     nightMode,       onNightMode,     'Toggle night mode [N]'),
      toggleBtn('Zone Overlay',   showZoneOverlay, onZoneOverlay,   'Show zone color overlay [V]'),
    ]
    return null
  }

  return (
    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, userSelect: 'none', alignItems: 'flex-start' }}>
      {/* Rail */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        background: 'rgba(0,0,0,0.82)',
        padding: 6,
        borderRadius: 8,
      }}>
        {CATEGORIES.map(railBtn)}
      </div>

      {/* Submenu panel */}
      {openCat && openCat !== 'options' && (
        <div style={{
          background: 'rgba(0,0,0,0.88)',
          border: '1px solid #444',
          borderRadius: 8,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 200,
        }}>
          <div style={{ color: '#888', fontSize: 10, padding: '0 4px 2px', textTransform: 'uppercase', letterSpacing: 1 }}>
            {CATEGORIES.find(c => c.id === openCat)?.label}
          </div>
          {submenuBtns()}
        </div>
      )}

      {/* Options panel */}
      {openCat === 'options' && (
        <div style={{
          background: 'rgba(0,0,0,0.88)',
          border: '1px solid #444',
          borderRadius: 8,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 170,
        }}>
          <div style={{ color: '#888', fontSize: 10, padding: '0 2px 2px', textTransform: 'uppercase', letterSpacing: 1 }}>Options</div>
          <input
            value={cityName}
            placeholder="City name"
            onInput={(e) => onCityNameChange((e.currentTarget as HTMLInputElement).value)}
            style={{
              height: 28, border: '1px solid #555',
              background: '#111', color: '#eee',
              borderRadius: 4, padding: '0 8px', fontSize: 13,
            }}
          />
          {savedCities.length > 0 && (
            <select
              value={savedCities.includes(cityName) ? cityName : ''}
              onChange={(e) => onCityNameChange((e.currentTarget as HTMLSelectElement).value)}
              style={{ height: 28, border: '1px solid #555', background: '#111', color: '#eee', borderRadius: 4, fontSize: 13 }}
            >
              <option value="">Load...</option>
              {savedCities.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {[
            { label: 'New City', action: onNewGame },
            { label: 'Save City', action: onSaveState },
            { label: 'Load City', action: onLoadState },
            { label: 'Export to File…', action: onExportFile },
            { label: 'Import from File…', action: () => fileInputRef.current?.click() },
          ].map(({ label, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => { void action() }}
              style={{
                height: 28, border: '1px solid #555',
                background: '#1f1f1f', color: '#eee',
                cursor: 'pointer', borderRadius: 4,
                textAlign: 'left', padding: '0 8px', fontSize: 13,
              }}
            >{label}</button>
          ))}
          {status && <div style={{ color: '#aaa', fontSize: 11, padding: '2px 4px' }}>{status}</div>}
        </div>
      )}

      {/* Hidden file picker for "Import from File…" — rendered unconditionally so
          it's always in the DOM (the Options button triggers it via ref). */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wcity,application/gzip,application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement
          const file = input.files?.[0]
          if (file) void onImportFile(file)
          input.value = ''  // allow re-importing the same file
        }}
      />
    </div>
  )
}
