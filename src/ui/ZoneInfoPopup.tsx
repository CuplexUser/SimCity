import { type Tile, Zone, Terrain, Building, Overlay } from '../core/tile'
import { BUILDING_DEFS } from '../data/buildings'

interface Props {
  tile: Tile
  col: number
  row: number
  onClose: () => void
  /** Distance from the right edge (px) — shifted left when the dashboard is open. */
  offsetRight?: number
}

const ZONE_LABEL: Record<Zone, string> = {
  [Zone.None]:        'Unzoned',
  [Zone.Residential]: 'Residential',
  [Zone.Commercial]:  'Commercial',
  [Zone.Industrial]:  'Industrial',
}

const TERRAIN_LABEL: Record<Terrain, string> = {
  [Terrain.Grass]:  'Grass',
  [Terrain.Water]:  'Water',
  [Terrain.Dirt]:   'Dirt',
  [Terrain.Forest]: 'Forest',
}

export function ZoneInfoPopup({ tile, col, row, onClose, offsetRight = 8 }: Props) {
  const flag = (on: boolean) => on ? '#5aee5a' : '#ee5555'

  // What occupies this tile: a plopped building, a developed lot, or open land.
  const occupant = tile.building !== Building.None
    ? BUILDING_DEFS[tile.building].label
    : tile.density > 0
      ? `${ZONE_LABEL[tile.zone]} (density ${tile.density})`
      : tile.zone !== Zone.None
        ? `${ZONE_LABEL[tile.zone]} (vacant)`
        : TERRAIN_LABEL[tile.terrain]

  const line = (label: string, value: string, color = '#ddd') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '1.7' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )

  return (
    <aside style={{
      position: 'absolute',
      top: 52,
      right: offsetRight,
      width: 180,
      background: 'rgba(0,0,0,0.88)',
      border: '1px solid #444',
      borderRadius: 8,
      padding: 10,
      userSelect: 'none',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ color: '#fff', fontSize: 13 }}>Tile {col}, {row}</span>
        <button
          onClick={onClose}
          title="Close"
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
        >×</button>
      </div>
      {line('Use', occupant)}
      {line('Terrain', TERRAIN_LABEL[tile.terrain])}
      {line('Elevation', String(tile.elevation))}
      {tile.burning && line('Status', '🔥 On fire', '#ff7a3a')}
      <div style={{ borderTop: '1px solid #444', margin: '4px 0' }} />
      {line('Power',  tile.powered ? 'yes' : 'no', flag(tile.powered))}
      {line('Water',  tile.watered ? 'yes' : 'no', flag(tile.watered))}
      {line('Police', tile.policed ? 'yes' : 'no', flag(tile.policed))}
      {line('Fire',   tile.fireProtected ? 'yes' : 'no', flag(tile.fireProtected))}
      {line('Health', tile.healthCovered ? 'yes' : 'no', flag(tile.healthCovered))}
      {line('Schools', tile.educated ? 'yes' : 'no', flag(tile.educated))}
      {(tile.overlay & Overlay.Road) ? line('Road', 'yes', '#ddd') : null}
    </aside>
  )
}
