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

    function findHitTile(px: number, py: number): { col: number; row: number } | null {
      const { hw, hh } = eng.camera
      const naive = eng.camera.screenToWorld(px, py)
      const naiveD = naive.col + naive.row
      // Search front-to-back (highest d = closest to viewer) over a range that
      // covers the maximum elevation offset (~ELEV_PAD diagonals above naive estimate)
      for (let d = naiveD + 5; d >= naiveD - 1; d--) {
        const colMin = Math.max(0, d - eng.world.rows + 1)
        const colMax = Math.min(d, eng.world.cols - 1)
        for (let col = colMax; col >= colMin; col--) {
          const row = d - col
          if (row < 0 || row >= eng.world.rows) continue
          const tile = eng.world.get(col, row)
          const s = eng.camera.worldToScreen(col, row, tile.elevation)
          // Diamond hit test centered on tile center (s.x, s.y + hh)
          if (Math.abs(px - s.x) / hw + Math.abs(py - (s.y + hh)) / hh <= 1) {
            return { col, row }
          }
        }
      }
      return null
    }

    function placeTile(clientX: number, clientY: number) {
      const tool = toolRef.current
      if (!tool) return
      const rect = canvas.getBoundingClientRect()
      const hit = findHitTile(clientX - rect.left, clientY - rect.top)
      if (!hit) return
      const { col, row } = hit
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
