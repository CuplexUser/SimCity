import { render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { Engine } from './core/engine'
import { generateWorld } from './data/worldGen'
import { Zone, Overlay, Building, type ActiveTool } from './core/tile'
import { events, type YearEvent } from './core/events'
import { Toolbar } from './ui/Toolbar'
import { BottomBar } from './ui/BottomBar'
import { CityLog } from './ui/CityLog'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const toolRef   = useRef<ActiveTool>(null)

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

    // ── Input ──────────────────────────────────────────────────────────────

    let panning  = false
    let painting = false
    let lastX = 0, lastY = 0

    function placeTile(clientX: number, clientY: number) {
      const tool = toolRef.current
      if (!tool) return
      const rect = canvas.getBoundingClientRect()
      const { col, row } = eng.camera.screenToWorld(clientX - rect.left, clientY - rect.top)
      if (!eng.world.inBounds(col, row)) return

      switch (tool.kind) {
        case 'zone':
          eng.world.set(col, row, { zone: tool.zone, density: 0, building: Building.None })
          eng.renderer.minimap.markDirty()
          break
        case 'building':
          eng.world.set(col, row, { building: tool.building, zone: Zone.None, density: 0 })
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
          eng.world.set(col, row, { zone: Zone.None, overlay: 0, density: 0, building: Building.None })
          eng.renderer.minimap.markDirty()
          break
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button === 0 && toolRef.current) {
        painting = true
        placeTile(e.clientX, e.clientY)
      }
      if (e.button === 1 || e.button === 2) {
        panning = true; lastX = e.clientX; lastY = e.clientY
      }
    }
    function onMouseMove(e: MouseEvent) {
      if (panning) {
        eng.camera.pan(e.clientX - lastX, e.clientY - lastY)
        lastX = e.clientX; lastY = e.clientY
      }
      if (painting) placeTile(e.clientX, e.clientY)
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) painting = false
      if (e.button === 1 || e.button === 2) panning = false
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      eng.camera.snapZoom(e.deltaY, e.clientX, e.clientY)
    }

    function onResize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }

    canvas.addEventListener('mousedown',   onMouseDown)
    canvas.addEventListener('mousemove',   onMouseMove)
    canvas.addEventListener('mouseup',     onMouseUp)
    canvas.addEventListener('wheel',       onWheel, { passive: false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    window.addEventListener('resize',      onResize)

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
      <CityLog />
    </div>
  )
}

render(<App />, document.getElementById('app')!)
