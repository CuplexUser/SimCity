interface Props {
  year:       number
  population: number
  funds:      number
  /** Zone power coverage from the sim (powered / unpowered zoned tiles). */
  power:      { powered: number; unpowered: number }
  /** Zone water coverage from the sim (watered / unwatered zoned tiles). */
  water:      { watered: number; unwatered: number }
  /** Tiles currently on fire (0 hides the indicator). */
  burning?:   number
}

export function BottomBar({ year, population, funds, power, water, burning = 0 }: Props) {
  const fundsColor = funds >= 0 ? '#5aee5a' : '#ee5555'

  const zoneTiles  = power.powered + power.unpowered
  const powerColor = power.unpowered === 0 ? '#5aee5a' : '#ee5555'
  const powerText  = zoneTiles === 0 ? '—'
    : power.unpowered === 0 ? 'OK'
    : `${power.unpowered} zone${power.unpowered === 1 ? '' : 's'} unpowered`
  const powerTitle = power.unpowered > 0
    ? 'Zoned tiles without power cannot grow — build a power plant nearby or extend power lines'
    : 'All zoned tiles have power'

  const waterTiles = water.watered + water.unwatered
  const waterColor = water.unwatered === 0 ? '#5aee5a' : '#ee5555'
  const waterText  = waterTiles === 0 ? '—'
    : water.unwatered === 0 ? 'OK'
    : `${water.unwatered} zone${water.unwatered === 1 ? '' : 's'} dry`
  const waterTitle = water.unwatered > 0
    ? 'Zoned tiles without water cannot grow — build a water tower, pump, or pumping station nearby'
    : 'All zoned tiles have water'

  return (
    <div style={{
      position:   'absolute',
      bottom:     0, left: 0, right: 0,
      height:     32,
      background: 'rgba(0,0,0,0.82)',
      display:    'flex',
      alignItems: 'center',
      gap:        32,
      padding:    '0 16px',
      color:      '#aaa',
      fontSize:   13,
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      <span>
        Year: <strong style={{ color: '#fff' }}>{year}</strong>
      </span>
      <span>
        Pop: <strong style={{ color: '#5aee5a' }}>{population.toLocaleString()}</strong>
      </span>
      <span>
        Funds: <strong style={{ color: fundsColor }}>${funds.toLocaleString()}</strong>
      </span>
      <span title={powerTitle}>
        ⚡ <strong style={{ color: zoneTiles === 0 ? '#888' : powerColor }}>{powerText}</strong>
      </span>
      <span title={waterTitle}>
        💧 <strong style={{ color: waterTiles === 0 ? '#888' : waterColor }}>{waterText}</strong>
      </span>
      {burning > 0 && (
        <span title="Tiles on fire — fire stations contain and extinguish blazes">
          🔥 <strong style={{ color: '#ff7a3a' }}>{burning} burning</strong>
        </span>
      )}
    </div>
  )
}
