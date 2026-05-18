interface Props {
  year:       number
  population: number
  funds:      number
}

export function BottomBar({ year, population, funds }: Props) {
  const fundsColor = funds >= 0 ? '#5aee5a' : '#ee5555'

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
    </div>
  )
}
