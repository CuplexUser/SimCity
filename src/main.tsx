import { render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { Engine } from './core/engine'
import { generateWorld } from './data/worldGen'
import { Zone, Overlay, type ActiveTool } from './core/tile'
import { type YearEvent } from './core/events'
import { events } from './core/events'
import { Toolbar } from './ui/Toolbar'
import { BottomBar } from './ui/BottomBar'

function App() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const engineRef   = useRef<Engine | null>(null)
  const toolRef     = useRef<ActiveTool>(null)

  const [year,  setYear]  = useState(2000)
  const [pop,   setPop]   = useState(0)
  const [funds, setFunds] = useState(20_000)

  function handleToolChange(tool: ActiveTool) {
    toolRef.current = tool
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const eng = new Engine(canvas)
    engineRef.current = eng
    generateWorld(eng.world)
    eng.start()

    // ── Input handlers ─────────────────────────────────────────────────────

    let dragging = false
    let lastX = 0
    let lastY = 0

    function onMouseDown(e: MouseEvent) {
      // Middle or right mouse button pans
      if (e.button === 1 || e.button === 2) {
        dragging = true
        lastX    = e.clientX
        lastY    = e.clientY
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      eng.camera.pan(e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
    }

    function onMouseUp() { dragging = false }

    function onClick(e: MouseEvent) {
      // Only left-click places tiles
      if (e.button !== 0) return
      const tool = toolRef.current
      if (!tool) return

      const { col, row } = eng.camera.screenToWorld(e.clientX, e.clientY)
      if (!eng.world.inBounds(col, row)) return

      switch (tool.kind) {
        case 'zone':
          eng.world.set(col, row, { zone: tool.zone, density: 0 })
          eng.renderer.minimap.markDirty()
          break
        case 'road': {
          const t = eng.world.get(col, row)
          eng.world.set(col, row, { overlay: t.overlay | Overlay.Road })
          break
        }
        case 'power': {
          const t = eng.world.get(col, row)
          eng.world.set(col, row, { overlay: t.overlay | Overlay.PowerLine })
          break
        }
        case 'bulldoze':
          eng.world.set(col, row, { zone: Zone.None, overlay: 0, density: 0 })
          eng.renderer.minimap.markDirty()
          break
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      eng.camera.snapZoom(e.deltaY, e.clientX, e.clientY)
    }

    function onResize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }

    canvas.addEventListener('mousedown',    onMouseDown)
    canvas.addEventListener('mousemove',    onMouseMove)
    canvas.addEventListener('mouseup',      onMouseUp)
    canvas.addEventListener('click',        onClick)
    canvas.addEventListener('wheel',        onWheel, { passive: false })
    canvas.addEventListener('contextmenu',  e => e.preventDefault())
    window.addEventListener('resize',       onResize)

    // ── Event subscriptions ────────────────────────────────────────────────

    const offYear = events.on<YearEvent>('year', ({ year, revenue, expenses }) => {
      setYear(year)
      setFunds(f => f + revenue - expenses)
      setPop(eng.sim.population)
    })

    return () => {
      eng.stop()
      canvas.removeEventListener('mousedown',   onMouseDown)
      canvas.removeEventListener('mousemove',   onMouseMove)
      canvas.removeEventListener('mouseup',     onMouseUp)
      canvas.removeEventListener('click',       onClick)
      canvas.removeEventListener('wheel',       onWheel)
      window.removeEventListener('resize',      onResize)
      offYear()
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <Toolbar onToolChange={handleToolChange} />
      <BottomBar year={year} population={pop} funds={funds} />
    </div>
  )
}

render(<App />, document.getElementById('app')!)
