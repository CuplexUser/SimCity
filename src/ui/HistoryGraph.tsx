import { useRef, useLayoutEffect } from 'preact/hooks'

interface Props {
  title:   string
  values:  number[]
  color?:  string
  /** Canvas pixel height of the plot area (width tracks the container). */
  height?: number
}

/**
 * Canvas-rendered line/area chart for a per-year history series (population,
 * funds, …). Replaces the old flex-bar GraphPanel: a single smooth filled line
 * reads better than a forest of bars once the series gets long, and drawing it
 * on a <canvas> keeps the DOM light. Redraws whenever the data or size changes.
 */
export function HistoryGraph({ title, values, color = '#5aee5a', height = 52 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = values.length > 0 ? values[values.length - 1] : 0

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssW = canvas.clientWidth || 196
    const cssH = height
    canvas.width  = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    if (values.length === 0) {
      ctx.fillStyle = '#666'
      ctx.font = '11px monospace'
      ctx.fillText('No data yet', 2, cssH / 2 + 4)
      return
    }

    const max = Math.max(1, ...values)
    const min = Math.min(0, ...values)  // include 0 so a flat/positive series sits on the floor
    const span = max - min || 1
    const pad = 2
    const plotW = cssW - pad * 2
    const plotH = cssH - pad * 2
    const n = values.length
    const x = (i: number) => pad + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const y = (v: number) => pad + plotH - ((v - min) / span) * plotH

    // Filled area under the line
    ctx.beginPath()
    ctx.moveTo(x(0), cssH - pad)
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(values[i]))
    ctx.lineTo(x(n - 1), cssH - pad)
    ctx.closePath()
    ctx.fillStyle = hexToRgba(color, 0.18)
    ctx.fill()

    // Zero baseline (only if the series dips below 0)
    if (min < 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(pad, y(0)); ctx.lineTo(cssW - pad, y(0)); ctx.stroke()
      ctx.setLineDash([])
    }

    // The line itself
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const px = x(i), py = y(values[i])
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Latest-point marker
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x(n - 1), y(values[n - 1]), 2, 0, Math.PI * 2)
    ctx.fill()
  }, [values, color, height])

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
        <span style={{ color, fontSize: 12 }}>{Math.round(latest).toLocaleString()}</span>
      </div>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height }} />
    </section>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
