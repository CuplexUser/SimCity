interface Props {
  speed: number   // current Hz (0 = paused)
  onSpeedChange: (hz: number) => void
}

const SPEEDS = [
  { hz: 0,  label: '⏸' },
  { hz: 1,  label: '1×' },
  { hz: 2,  label: '2×' },
  { hz: 4,  label: '3×' },
]

export function SpeedControl({ speed, onSpeedChange }: Props) {
  return (
    <div style={{
      position:      'absolute',
      bottom:        36,
      right:         8,
      display:       'flex',
      gap:           3,
      background:    'rgba(0,0,0,0.80)',
      padding:       '4px 6px',
      borderRadius:  6,
      userSelect:    'none',
    }}>
      {SPEEDS.map(({ hz, label }) => (
        <button
          key={hz}
          title={hz === 0 ? 'Pause' : `${label} speed`}
          onClick={() => onSpeedChange(hz)}
          style={{
            width:        38,
            height:       26,
            border:       `2px solid ${speed === hz ? '#fff' : 'transparent'}`,
            background:   speed === hz ? '#333' : 'transparent',
            color:        speed === hz ? '#fff' : '#aaa',
            cursor:       'pointer',
            borderRadius: 4,
            fontSize:     12,
            fontFamily:   'monospace',
            fontWeight:   'bold',
          }}
        >{label}</button>
      ))}
    </div>
  )
}
