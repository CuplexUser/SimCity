import { render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { Engine } from './core/engine'
import { generateWorld } from './data/worldGen'
import { Zone, Overlay, Building, Terrain, type ActiveTool } from './core/tile'
import { events, type YearEvent } from './core/events'
import { applyBulldoze } from './core/bulldoze'
import { Toolbar, bulldozeKeyForMode, keyToTool, type ToolKey } from './ui/Toolbar'
import { BottomBar } from './ui/BottomBar'
import { CityLog } from './ui/CityLog'
import { SpeedControl } from './ui/SpeedControl'
import { BUILDING_DEFS, ZONE_COST, OVERLAY_COST } from './data/buildings'
import { Minimap } from './rendering/minimap'

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const toolRef   = useRef<ActiveTool>(null)
  // Keeps current funds in the effect closure without stale-closure issues
  const fundsRef  = useRef(20_000)
  const speedRef  = useRef(1)

  const [activeKey, setActiveKey] = useState<ToolKey | null>(null)
  const [year,   setYear]   = useState(2000)
  const [pop,    setPop]    = useState(0)
  const [funds,  setFunds]  = useState(20_000)
  const [speed,  setSpeed]  = useState(1)

  // Sync toolRef whenever the toolbar selection changes (keyboard OR click)
  useEffect(() => {
    toolRef.current = activeKey ? keyToTool(activeKey) : null
  }, [activeKey])

  function handleSpeedChange(hz: number) {
    speedRef.current = hz
    setSpeed(hz)
    engineRef.current?.setSimSpeed(hz)
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const eng = new Engine(canvas)
    engineRef.current = eng
    generateWorld(eng.world)
    eng.start()

    window.render_game_to_text = () => {
      const buildings: Record<string, number> = {}
      let policed = 0
      eng.world.forEach((tile) => {
        if (tile.policed) policed++
        if (tile.building !== Building.None) {
          const label = BUILDING_DEFS[tile.building].label
          buildings[label] = (buildings[label] ?? 0) + 1
        }
      })
      return JSON.stringify({
        coordinates: 'tile origin at northwest corner; col increases east, row increases south',
        year: eng.sim.getYear(),
        tick: eng.sim.getTick(),
        population: eng.sim.population,
        funds: fundsRef.current,
        activeTool: toolRef.current,
        camera: { zoom: eng.camera.zoom, panX: eng.camera.panX, panY: eng.camera.panY },
        services: { policedTiles: policed },
        buildings,
      })
    }

    window.advanceTime = (ms: number) => {
      const steps = Math.max(0, Math.floor((ms / 1000) * speedRef.current))
      for (let i = 0; i < steps; i++) eng.sim.step()
      eng.renderer.draw()
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function spendFunds(amount: number): boolean {
      if (fundsRef.current < amount) return false
      fundsRef.current -= amount
      eng.sim.funds = fundsRef.current
      setFunds(fundsRef.current)
      return true
    }

    function findHitTile(px: number, py: number): { col: number; row: number } | null {
      const { hw, hh } = eng.camera
      const naive  = eng.camera.screenToWorld(px, py)
      const naiveD = naive.col + naive.row
      for (let d = naiveD + 5; d >= naiveD - 1; d--) {
        const colMin = Math.max(0, d - eng.world.rows + 1)
        const colMax = Math.min(d, eng.world.cols - 1)
        for (let col = colMax; col >= colMin; col--) {
          const row = d - col
          if (row < 0 || row >= eng.world.rows) continue
          const tile = eng.world.get(col, row)
          const s = eng.camera.worldToScreen(col, row, tile.elevation)
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
      const hit  = findHitTile(clientX - rect.left, clientY - rect.top)
      if (!hit) return
      const { col, row } = hit
      if (!eng.world.inBounds(col, row)) return

      const t = eng.world.get(col, row)

      switch (tool.kind) {
        case 'zone': {
          if (t.building !== Building.None) return  // must bulldoze first
          if (t.density > 0)               return  // developed — must bulldoze first
          if (t.zone === tool.zone)        return  // already this zone, no-op
          if (t.terrain === Terrain.Water) return  // can't zone water
          if (!spendFunds(ZONE_COST[tool.zone])) return
          eng.world.set(col, row, { zone: tool.zone, density: 0 })
          eng.renderer.minimap.markDirty()
          break
        }
        case 'building': {
          if (t.building !== Building.None) return  // already a building
          if (t.density > 0)               return  // developed zone — bulldoze first
          if (t.terrain === Terrain.Water) return  // can't build on water
          if (t.building === tool.building) return  // same building already here
          const def = BUILDING_DEFS[tool.building]
          if (!spendFunds(def.cost)) return
          eng.world.set(col, row, { building: tool.building, zone: Zone.None, density: 0 })
          break
        }
        case 'road': {
          if (t.overlay & Overlay.Road)     return  // already a road
          if (t.building !== Building.None) return  // can't lay road through a building
          if (t.density > 0)               return  // developed zone — bulldoze first
          if (t.terrain === Terrain.Water) return  // no bridges yet
          if (!spendFunds(OVERLAY_COST[Overlay.Road] ?? 0)) return
          eng.world.set(col, row, { overlay: t.overlay | Overlay.Road })
          break
        }
        case 'power': {
          if (t.overlay & Overlay.PowerLine) return  // already a power line
          if (t.building !== Building.None)  return  // can't wire through a building
          if (!spendFunds(OVERLAY_COST[Overlay.PowerLine] ?? 0)) return
          eng.world.set(col, row, { overlay: t.overlay | Overlay.PowerLine })
          break
        }
        case 'bulldoze':
          if (!applyBulldoze(eng.world, col, row, tool.mode)) return
          eng.renderer.minimap.markDirty()
          break
      }
    }

    // ── Mouse ────────────────────────────────────────────────────────────────

    let panning         = false
    let painting        = false
    let minimapDragging = false
    let lastX = 0, lastY = 0

    function canvasPos(clientX: number, clientY: number) {
      const r = canvas.getBoundingClientRect()
      return { px: clientX - r.left, py: clientY - r.top }
    }

    function isOnMinimap(clientX: number, clientY: number): boolean {
      const { px, py } = canvasPos(clientX, clientY)
      const mm = Minimap.bounds(canvas.width, canvas.height)
      return px >= mm.x && px <= mm.x + mm.w && py >= mm.y && py <= mm.y + mm.h
    }

    function panToMinimap(clientX: number, clientY: number) {
      const { px, py } = canvasPos(clientX, clientY)
      const mm = Minimap.bounds(canvas.width, canvas.height)
      const col = ((px - mm.x) / mm.w) * eng.world.cols
      const row = ((py - mm.y) / mm.h) * eng.world.rows
      const { hw, hh } = eng.camera
      eng.camera.panX = canvas.width  / 2 - (col - row) * hw
      eng.camera.panY = canvas.height / 2 - (col + row) * hh
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button === 0) {
        if (isOnMinimap(e.clientX, e.clientY)) {
          minimapDragging = true
          panToMinimap(e.clientX, e.clientY)
          return
        }
        if (toolRef.current) { painting = true; placeTile(e.clientX, e.clientY) }
      }
      if (e.button === 1 || e.button === 2) { panning = true; lastX = e.clientX; lastY = e.clientY }
    }
    function onMouseMove(e: MouseEvent) {
      if (minimapDragging) { panToMinimap(e.clientX, e.clientY); return }
      if (panning) { eng.camera.pan(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY }
      if (painting) placeTile(e.clientX, e.clientY)
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) { minimapDragging = false; painting = false }
      if (e.button === 1 || e.button === 2) panning = false
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      eng.camera.snapZoom(e.deltaY, e.clientX, e.clientY)
    }
    function onResize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }

    canvas.addEventListener('mousedown',   onMouseDown)
    canvas.addEventListener('mousemove',   onMouseMove)
    canvas.addEventListener('mouseup',     onMouseUp)
    canvas.addEventListener('wheel',       onWheel, { passive: false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    window.addEventListener('resize',      onResize)

    // ── Keyboard ─────────────────────────────────────────────────────────────
    // setActiveKey is a stable React setter — safe to call from a [] closure.

    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.key) {
        case '1':                      setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('normal')  : k === 'R' ? null : 'R'); break
        case '2':                      setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('terrain') : k === 'C' ? null : 'C'); break
        case '3':                      setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('zoning')  : k === 'I' ? null : 'I'); break
        case 'r': case 'R':            setActiveKey(k => k === 'road'     ? null : 'road');     break
        case 'p': case 'P':            setActiveKey(k => k === 'PP'       ? null : 'PP');       break
        case 'o': case 'O':            setActiveKey(k => k === 'PS'       ? null : 'PS');       break
        case 'w': case 'W':            setActiveKey(k => k === 'WT'       ? null : 'WT');       break
        case 'l': case 'L':            setActiveKey(k => k === 'power'    ? null : 'power');    break
        case 'b': case 'B':            setActiveKey(k => k === 'dozeNormal' ? null : 'dozeNormal'); break
        case 'Escape':                 setActiveKey(null);                                       break
        case '+': case '=': eng.camera.snapZoom(-1, canvas.width / 2, canvas.height / 2);      break
        case '-': case '_': eng.camera.snapZoom( 1, canvas.width / 2, canvas.height / 2);      break
      }
    }

    window.addEventListener('keydown', onKeyDown)

    // ── Sim events ───────────────────────────────────────────────────────────

    const offYear = events.on<YearEvent>('year', ({ year, revenue, expenses }) => {
      setYear(year)
      setPop(eng.sim.population)
      const net = revenue - expenses
      fundsRef.current += net
      eng.sim.funds = fundsRef.current
      setFunds(fundsRef.current)
    })

    return () => {
      eng.stop()
      canvas.removeEventListener('mousedown',   onMouseDown)
      canvas.removeEventListener('mousemove',   onMouseMove)
      canvas.removeEventListener('mouseup',     onMouseUp)
      canvas.removeEventListener('wheel',       onWheel)
      window.removeEventListener('resize',      onResize)
      window.removeEventListener('keydown',     onKeyDown)
      delete window.render_game_to_text
      delete window.advanceTime
      offYear()
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <Toolbar activeKey={activeKey} onKeyChange={setActiveKey} />
      <BottomBar year={year} population={pop} funds={funds} />
      <SpeedControl speed={speed} onSpeedChange={handleSpeedChange} />
      <CityLog />
    </div>
  )
}

render(<App />, document.getElementById('app')!)
