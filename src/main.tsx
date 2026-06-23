import { render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { Engine } from './core/engine'
import { World } from './core/world'
import { generateWorld } from './data/worldGen'
import { Zone, Overlay, Building, Terrain, type ActiveTool, type Tile } from './core/tile'
import { events, type TickEvent, type YearEvent } from './core/events'
import { applyBulldoze } from './core/bulldoze'
import { gameStateFromBlob, gameStateToBlob, listSavedCities, loadGameState, normalizeCityName, SAVE_FILE_EXT, saveGameState } from './core/saveLoad'
import { Toolbar, bulldozeKeyForMode, keyToTool, type ToolKey } from './ui/Toolbar'
import { BottomBar } from './ui/BottomBar'
import { CityLog } from './ui/CityLog'
import { SpeedControl } from './ui/SpeedControl'
import { Dashboard } from './ui/Dashboard'
import { ZoneInfoPopup } from './ui/ZoneInfoPopup'
import {
  type Bond, type CreditRating,
  totalDebt, annualDebtService, rateForRating,
} from './simulation/finance'
import {
  type OrdinanceId, type OrdinanceState, newOrdinanceState,
} from './simulation/ordinances'
import { BUILDING_DEFS, ZONE_COST, OVERLAY_COST, buildingFootprint, allowsRoadUnder } from './data/buildings'
import { canPlaceFootprint, placeFootprint } from './core/footprint'
import { Minimap } from './rendering/minimap'
import { type OverlayMode } from './rendering/renderer'
import { type GridMode } from './simulation/simManager'

// Gradient (heatmap) overlays read a recomputed grid from the sim; the rest are
// binary coverage overlays driven by tile flags.
const GRADIENT_MODES = new Set<OverlayMode>(['crime', 'pollution', 'traffic', 'landvalue'])
// Order the [C] hotkey cycles through (then wraps back to 'none').
const OVERLAY_CYCLE: OverlayMode[] = [
  'none', 'water', 'police', 'fire', 'health', 'education',
  'crime', 'pollution', 'traffic', 'landvalue',
]

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void
    __eng?: import('./core/engine').Engine
  }
}

function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const engineRef  = useRef<Engine | null>(null)
  const toolRef    = useRef<ActiveTool>(null)
  const fundsRef   = useRef(20_000)
  const speedRef   = useRef(1)

  const [activeKey, setActiveKey] = useState<ToolKey | null>(null)
  const [year,   setYear]   = useState(2000)
  const [pop,    setPop]    = useState(0)
  const [funds,  setFunds]  = useState(20_000)
  const [power,  setPower]  = useState({ powered: 0, unpowered: 0 })
  const [water,  setWater]  = useState({ watered: 0, unwatered: 0 })
  const [speed,  setSpeed]  = useState(1)
  const [optionsStatus, setOptionsStatus] = useState('')
  const [cityName, setCityName] = useState('New City')
  const [savedCities, setSavedCities] = useState<string[]>([])
  const [nightMode, setNightMode] = useState(false)
  const [showZoneOverlay, setShowZoneOverlay] = useState(false)
  const [overlay, setOverlay] = useState<OverlayMode>('none')

  // ── Dashboard + tile-query panels ──────────────────────────────────────────
  const [showDashboard, setShowDashboard] = useState(false)
  const [budget, setBudget] = useState({ revenue: 0, expenses: 0 })
  const [popHistory, setPopHistory] = useState<number[]>([])
  const [fundsHistory, setFundsHistory] = useState<number[]>([])
  const [burning, setBurning] = useState(0)
  const [cityRating, setCityRating] = useState(55)
  const [ordinances, setOrdinances] = useState<OrdinanceState>(newOrdinanceState())
  const [queried, setQueried] = useState<{ tile: Tile; col: number; row: number } | null>(null)
  const [finance, setFinance] = useState<{
    rating: CreditRating; debt: number; debtService: number; nextRate: number; bonds: Bond[]
  }>({ rating: 'AAA', debt: 0, debtService: 0, nextRate: rateForRating('AAA'), bonds: [] })

  const showDashboardRef = useRef(false)
  const queriedRef = useRef<{ col: number; row: number } | null>(null)

  const nightModeRef      = useRef(false)
  const zoneOverlayRef    = useRef(false)
  const overlayRef        = useRef<OverlayMode>('none')

  useEffect(() => {
    toolRef.current = activeKey ? keyToTool(activeKey) : null
  }, [activeKey])

  function handleSpeedChange(hz: number) {
    speedRef.current = hz
    setSpeed(hz)
    engineRef.current?.setSimSpeed(hz)
  }

  function handleNightMode(on: boolean) {
    nightModeRef.current = on
    setNightMode(on)
    engineRef.current?.renderer?.setNightMode(on)
  }

  function handleZoneOverlay(on: boolean) {
    zoneOverlayRef.current = on
    setShowZoneOverlay(on)
    engineRef.current?.renderer?.setZoneOverlay(on)
  }

  function handleOverlay(mode: OverlayMode) {
    overlayRef.current = mode
    setOverlay(mode)
    const eng = engineRef.current
    if (!eng?.renderer) return
    eng.renderer.setOverlay(mode)
    // Gradient overlays need their grid pushed; coverage overlays read tile flags.
    eng.renderer.setOverlayGrid(
      mode !== 'none' && GRADIENT_MODES.has(mode) ? eng.sim.grid(mode as GridMode) : null,
    )
  }

  function refreshDashboardData() {
    const eng = engineRef.current
    if (!eng) return
    setBudget(eng.sim.currentBudget())
    setPopHistory([...eng.sim.popHistory])
    setFundsHistory([...eng.sim.fundsHistory])
    setCityRating(eng.sim.cityRating)
    setOrdinances({ ...eng.sim.ordinances })
    refreshFinance()
  }

  // Toggling an ordinance changes the annual budget; the effect lands at year-end,
  // but the live budget figures reflect it immediately (currentBudget includes it).
  function handleOrdinance(id: OrdinanceId, on: boolean) {
    const eng = engineRef.current
    if (!eng) return
    eng.sim.setOrdinance(id, on)
    setOrdinances({ ...eng.sim.ordinances })
    setBudget(eng.sim.currentBudget())
  }

  function refreshFinance() {
    const eng = engineRef.current
    if (!eng) return
    const f = eng.sim.finance
    setFinance({
      rating:      f.rating,
      debt:        totalDebt(f),
      debtService: annualDebtService(f),
      nextRate:    rateForRating(f.rating),
      bonds:       f.bonds.map((b) => ({ ...b })),
    })
  }

  // Bond actions go through the sim (which mutates funds), then we re-sync the
  // UI's funds source of truth (fundsRef) from the sim.
  function handleIssueBond(amount: number) {
    const eng = engineRef.current
    if (!eng) return
    const bond = eng.sim.issueBond(amount)
    if (!bond) return
    fundsRef.current = eng.sim.funds
    setFunds(fundsRef.current)
    refreshFinance()
  }

  function handlePayoffBond(id: number) {
    const eng = engineRef.current
    if (!eng) return
    if (!eng.sim.payoffBond(id)) return
    fundsRef.current = eng.sim.funds
    setFunds(fundsRef.current)
    refreshFinance()
  }

  function toggleDashboard() {
    const next = !showDashboardRef.current
    showDashboardRef.current = next
    setShowDashboard(next)
    if (next) refreshDashboardData()
  }

  function closeQuery() {
    queriedRef.current = null
    setQueried(null)
  }

  function resetUiState(yearValue = 2000, populationValue = 0, fundsValue = 20_000) {
    fundsRef.current = fundsValue
    setYear(yearValue)
    setPop(populationValue)
    setFunds(fundsValue)
    setPower({ powered: 0, unpowered: 0 })
    setWater({ watered: 0, unwatered: 0 })
    setBurning(0)
    setBudget({ revenue: 0, expenses: 0 })
    setPopHistory([])
    setFundsHistory([])
    // The sim has already been reset/loaded by the caller, so read rating +
    // ordinances back from it (defaults for a new game, saved values on load).
    setCityRating(engineRef.current?.sim.cityRating ?? 55)
    setOrdinances({ ...(engineRef.current?.sim.ordinances ?? newOrdinanceState()) })
    refreshFinance()
    closeQuery()
    setActiveKey(null)
  }

  function handleNewGame() {
    const eng = engineRef.current
    if (!eng?.renderer) return
    const fresh = new World()
    generateWorld(fresh, Math.floor(Date.now() + Math.random() * 1_000_000))
    eng.world.replaceFrom(fresh)
    eng.sim.reset()
    resetUiState()
    setCityName('New City')
    eng.renderer.minimap.markDirty()
    eng.renderer.draw()
    setOptionsStatus('New city ready')
  }

  async function handleSaveState() {
    const eng = engineRef.current
    if (!eng?.renderer) return
    const name = normalizeCityName(cityName)
    try {
      await saveGameState(eng.world, {
        year: eng.sim.getYear(),
        tick: eng.sim.getTick(),
        population: eng.sim.population,
        funds: fundsRef.current,
        finance: eng.sim.finance,
      }, name)
      setCityName(name)
      await refreshSavedCities()
      setOptionsStatus(`${name} saved`)
    } catch {
      setOptionsStatus('Save failed')
    }
  }

  async function handleLoadState() {
    const eng = engineRef.current
    if (!eng?.renderer) return
    const name = normalizeCityName(cityName || savedCities[0] || '')
    try {
      const saved = await loadGameState(name)
      if (!saved) { setOptionsStatus('No saved city'); return }
      eng.world.replaceFrom(saved.world)
      eng.sim.reset(saved.sim)
      resetUiState(saved.sim.year, saved.sim.population, saved.sim.funds)
      setCityName(name)
      eng.renderer.minimap.markDirty()
      eng.renderer.draw()
      setOptionsStatus(`${name} loaded`)
    } catch {
      setOptionsStatus('Load failed')
    }
  }

  async function handleExportFile() {
    const eng = engineRef.current
    if (!eng?.renderer) return
    const name = normalizeCityName(cityName)
    try {
      const blob = await gameStateToBlob(eng.world, {
        year: eng.sim.getYear(),
        tick: eng.sim.getTick(),
        population: eng.sim.population,
        funds: fundsRef.current,
        finance: eng.sim.finance,
        ordinances: eng.sim.ordinances,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.${SAVE_FILE_EXT}`
      a.click()
      URL.revokeObjectURL(url)
      setCityName(name)
      setOptionsStatus(`${name} exported`)
    } catch {
      setOptionsStatus('Export failed')
    }
  }

  async function handleImportFile(file: File) {
    const eng = engineRef.current
    if (!eng?.renderer) return
    try {
      const { world, sim } = await gameStateFromBlob(file)
      eng.world.replaceFrom(world)
      eng.sim.reset(sim)
      resetUiState(sim.year, sim.population, sim.funds)
      const name = normalizeCityName(file.name.replace(/\.(wcity|json)$/i, ''))
      setCityName(name)
      eng.renderer.minimap.markDirty()
      eng.renderer.draw()
      setOptionsStatus(`${name} imported`)
    } catch (err) {
      setOptionsStatus(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed')
    }
  }

  async function refreshSavedCities() {
    try {
      const names = await listSavedCities()
      setSavedCities(names)
      if (!cityName.trim() && names[0]) setCityName(names[0])
    } catch {
      setOptionsStatus('Save list failed')
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const eng = new Engine(canvas)
    engineRef.current = eng

    // ── Global helpers ──────────────────────────────────────────────────────

    window.render_game_to_text = () => {
      const buildings: Record<string, number> = {}
      let policed = 0, fireProtected = 0, healthCovered = 0, educated = 0
      eng.world.forEach((tile) => {
        if (tile.policed)       policed++
        if (tile.fireProtected) fireProtected++
        if (tile.healthCovered) healthCovered++
        if (tile.educated)      educated++
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
        cityRating: eng.sim.cityRating,
        ordinances: Object.entries(eng.sim.ordinances).filter(([, on]) => on).map(([id]) => id),
        finance: {
          rating: eng.sim.finance.rating,
          debt: totalDebt(eng.sim.finance),
          annualDebtService: annualDebtService(eng.sim.finance),
          bondCount: eng.sim.finance.bonds.length,
        },
        activeTool: toolRef.current,
        camera: { zoom: eng.camera.zoom, panX: eng.camera.panX, panY: eng.camera.panY },
        services: { policedTiles: policed, fireProtectedTiles: fireProtected, healthCoveredTiles: healthCovered, educatedTiles: educated },
        overlay: overlayRef.current,
        buildings,
      })
    }

    window.advanceTime = (ms: number) => {
      const steps = Math.max(0, Math.floor((ms / 1000) * speedRef.current))
      for (let i = 0; i < steps; i++) eng.sim.step()
      eng.renderer?.draw()
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function spendFunds(amount: number): boolean {
      if (fundsRef.current < amount) return false
      fundsRef.current -= amount
      eng.sim.funds = fundsRef.current
      setFunds(fundsRef.current)
      return true
    }

    // Zone a single tile if the rules allow and funds permit. Used for both single
    // clicks and drag-rectangle fills.
    function placeZoneTile(col: number, row: number, zone: Zone): boolean {
      if (!eng.world.inBounds(col, row)) return false
      const t = eng.world.get(col, row)
      if (t.building !== Building.None) return false
      if (t.density > 0)               return false
      if (t.overlay & Overlay.Road)    return false
      if (t.zone === zone)             return false
      if (t.terrain === Terrain.Water) return false
      if (!spendFunds(ZONE_COST[zone])) return false
      eng.world.set(col, row, { zone, density: 0 })
      eng.renderer?.minimap.markDirty()
      return true
    }

    // Fill the rectangle spanned by two corner tiles with a zone (stops silently
    // once funds run out — placeZoneTile returns false on every tile after that).
    function applyZoneRect(a: { col: number; row: number }, b: { col: number; row: number }, zone: Zone) {
      const minC = Math.min(a.col, b.col), maxC = Math.max(a.col, b.col)
      const minR = Math.min(a.row, b.row), maxR = Math.max(a.row, b.row)
      for (let r = minR; r <= maxR; r++)
        for (let c = minC; c <= maxC; c++)
          placeZoneTile(c, r, zone)
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

      switch (tool.kind) {
        case 'zone': {
          placeZoneTile(col, row, tool.zone)
          break
        }
        case 'building': {
          const [fw, fh] = buildingFootprint(tool.building)
          // The clicked tile is the plot's NW/origin corner; the whole plot must be clear.
          // Utility structures (power/water) may sit over existing roads — they run under.
          if (!canPlaceFootprint(eng.world, col, row, fw, fh, allowsRoadUnder(tool.building))) return
          const def = BUILDING_DEFS[tool.building]
          if (!spendFunds(def.cost)) return
          placeFootprint(eng.world, col, row, fw, fh, {
            building: tool.building, zone: Zone.None, density: 0,
          })
          break
        }
        // Roads and power lines are placed via drag-to-build line segments
        // (see lineDrag in the mouse handlers), not freehand painting.
        case 'bulldoze':
          if (!applyBulldoze(eng.world, col, row, tool.mode, tool.mode === 'terrain' ? terrainLevelTarget : undefined)) return
          eng.renderer?.minimap.markDirty()
          break
      }
    }

    // With no tool selected, a left-click queries the tile under the cursor and
    // shows the ZoneInfoPopup. The snapshot is refreshed each tick (see offTick)
    // so coverage flags stay live while the popup is open.
    function queryTile(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect()
      const hit  = findHitTile(clientX - rect.left, clientY - rect.top)
      if (!hit) { closeQuery(); return }
      queriedRef.current = hit
      setQueried({ tile: { ...eng.world.get(hit.col, hit.row) }, col: hit.col, row: hit.row })
    }

    // ── Mouse ────────────────────────────────────────────────────────────────

    let panning            = false
    let painting           = false
    let minimapDragging    = false
    let lastX = 0, lastY   = 0
    let terrainLevelTarget: number | undefined = undefined
    // Drag-to-zone: zone tools fill the rectangle dragged out, applied on mouseup.
    let zoneDrag: { start: { col: number; row: number }; end: { col: number; row: number } } | null = null
    // Drag-to-build: road/power tools drag out a straight segment locked to the
    // dominant axis (SimCity-style), previewed live and applied on mouseup.
    let lineDrag: { start: { col: number; row: number }; end: { col: number; row: number }; kind: 'road' | 'power' } | null = null

    // Lock a drag endpoint to the start tile's row or column, whichever axis the
    // cursor has moved furthest along, so segments are always straight.
    function constrainLineEnd(start: { col: number; row: number }, end: { col: number; row: number }) {
      return Math.abs(end.col - start.col) >= Math.abs(end.row - start.row)
        ? { col: end.col, row: start.row }
        : { col: start.col, row: end.row }
    }

    function showLinePreview() {
      if (!lineDrag) return
      const { start, end } = lineDrag
      eng.renderer?.setHoverTile(
        Math.min(start.col, end.col), Math.min(start.row, end.row),
        Math.abs(end.col - start.col) + 1, Math.abs(end.row - start.row) + 1,
      )
    }

    // Place one road/power tile: 'skip' passes over tiles that already have the
    // overlay (no charge), 'blocked' stops the whole segment at an obstacle.
    function placeOverlayTile(col: number, row: number, kind: 'road' | 'power'): 'placed' | 'skip' | 'blocked' {
      const overlay = kind === 'road' ? Overlay.Road : Overlay.PowerLine
      const t = eng.world.get(col, row)
      if (t.overlay & overlay)          return 'skip'
      if (t.building !== Building.None) return 'blocked'
      // A building's allocated plot (covered footprint tiles) is reserved — no roads.
      if (t.rootCol !== -1 || t.rootRow !== -1) return 'blocked'
      if (kind === 'road' && (t.density > 0 || t.terrain === Terrain.Water)) return 'blocked'
      if (!spendFunds(OVERLAY_COST[overlay] ?? 0)) return 'blocked'
      eng.world.set(col, row, { overlay: t.overlay | overlay })
      return 'placed'
    }

    function applyOverlayLine(a: { col: number; row: number }, b: { col: number; row: number }, kind: 'road' | 'power') {
      const dc = Math.sign(b.col - a.col), dr = Math.sign(b.row - a.row)
      const len = Math.abs(b.col - a.col) + Math.abs(b.row - a.row) // one axis is always 0
      for (let i = 0, c = a.col, r = a.row; i <= len; i++, c += dc, r += dr) {
        if (!eng.world.inBounds(c, r)) break
        if (placeOverlayTile(c, r, kind) === 'blocked') break
      }
    }

    function showZoneRectPreview() {
      if (!zoneDrag) return
      const { start, end } = zoneDrag
      const minC = Math.min(start.col, end.col), maxC = Math.max(start.col, end.col)
      const minR = Math.min(start.row, end.row), maxR = Math.max(start.row, end.row)
      eng.renderer?.setHoverTile(minC, minR, maxC - minC + 1, maxR - minR + 1)
    }

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
        if (toolRef.current) {
          // Zone tools drag out a rectangle (applied on mouseup) rather than painting.
          if (toolRef.current.kind === 'zone') {
            const rect = canvas.getBoundingClientRect()
            const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
            if (hit) { zoneDrag = { start: hit, end: hit }; showZoneRectPreview() }
            return
          }
          // Road/power tools drag out a straight segment (applied on mouseup).
          if (toolRef.current.kind === 'road' || toolRef.current.kind === 'power') {
            const rect = canvas.getBoundingClientRect()
            const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
            if (hit) { lineDrag = { start: hit, end: hit, kind: toolRef.current.kind }; showLinePreview() }
            return
          }
          // Capture the starting elevation for terrain levelling so drag stays consistent
          if (toolRef.current.kind === 'bulldoze' && toolRef.current.mode === 'terrain') {
            const rect = canvas.getBoundingClientRect()
            const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
            terrainLevelTarget = hit ? eng.world.get(hit.col, hit.row).elevation : undefined
          }
          painting = true
          placeTile(e.clientX, e.clientY)
        } else {
          // No tool active → query the tile under the cursor.
          queryTile(e.clientX, e.clientY)
        }
      }
      if (e.button === 1 || e.button === 2) { panning = true; lastX = e.clientX; lastY = e.clientY }
    }
    function onMouseMove(e: MouseEvent) {
      if (minimapDragging) { panToMinimap(e.clientX, e.clientY); return }
      if (panning)  { eng.camera.pan(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY }

      // Extending a zone-drag rectangle: update its end corner and preview it.
      if (zoneDrag) {
        const rect = canvas.getBoundingClientRect()
        const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
        if (hit) { zoneDrag.end = hit; showZoneRectPreview() }
        return
      }

      // Extending a road/power line drag: lock to the dominant axis and preview.
      if (lineDrag) {
        const rect = canvas.getBoundingClientRect()
        const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
        if (hit) { lineDrag.end = constrainLineEnd(lineDrag.start, hit); showLinePreview() }
        return
      }

      if (painting) placeTile(e.clientX, e.clientY)

      // Hover highlight — show the full footprint when a building tool is active
      const rect = canvas.getBoundingClientRect()
      const hit  = findHitTile(e.clientX - rect.left, e.clientY - rect.top)
      if (hit) {
        const tool = toolRef.current
        const [hw, hh] = tool?.kind === 'building' ? buildingFootprint(tool.building) : [1, 1]
        eng.renderer?.setHoverTile(hit.col, hit.row, hw, hh)
      } else {
        eng.renderer?.clearHoverTile()
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) {
        // Commit a zone-drag rectangle (still a single tile for a plain click).
        if (zoneDrag) {
          const tool = toolRef.current
          if (tool?.kind === 'zone') applyZoneRect(zoneDrag.start, zoneDrag.end, tool.zone)
          zoneDrag = null
        }
        // Commit a road/power segment (still a single tile for a plain click).
        if (lineDrag) {
          applyOverlayLine(lineDrag.start, lineDrag.end, lineDrag.kind)
          lineDrag = null
        }
        minimapDragging = false; painting = false; terrainLevelTarget = undefined
      }
      if (e.button === 1 || e.button === 2) panning = false
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      eng.camera.snapZoom(e.deltaY, e.clientX, e.clientY)
    }
    function onResize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      eng.renderer?.resize(canvas.width, canvas.height)
    }

    canvas.addEventListener('mousedown',   onMouseDown)
    canvas.addEventListener('mousemove',   onMouseMove)
    canvas.addEventListener('mouseup',     onMouseUp)
    canvas.addEventListener('wheel',       onWheel, { passive: false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    window.addEventListener('resize',      onResize)

    // ── Keyboard ─────────────────────────────────────────────────────────────

    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.key) {
        case '1': setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('normal')  : k === 'R' ? null : 'R'); break
        case '2': setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('terrain') : k === 'C' ? null : 'C'); break
        case '3': setActiveKey(k => k?.startsWith('doze') ? bulldozeKeyForMode('zoning')  : k === 'I' ? null : 'I'); break
        case 'r': case 'R': setActiveKey(k => k === 'road'      ? null : 'road');      break
        case 'p': case 'P': setActiveKey(k => k === 'PP'        ? null : 'PP');        break
        case 'o': case 'O': setActiveKey(k => k === 'PS'        ? null : 'PS');        break
        case 'w': case 'W': setActiveKey(k => k === 'WT'        ? null : 'WT');        break
        case 'l': case 'L': setActiveKey(k => k === 'power'     ? null : 'power');     break
        case 'b': case 'B': setActiveKey(k => k === 'dozeNormal'? null : 'dozeNormal'); break
        case 'Escape':       setActiveKey(null); closeQuery();                            break
        case 'd': case 'D':  toggleDashboard();                                           break
        case '+': case '=':  eng.camera.snapZoom(-1, canvas.width / 2, canvas.height / 2); break
        case '-': case '_':  eng.camera.snapZoom( 1, canvas.width / 2, canvas.height / 2); break
        case 'n': case 'N':  handleNightMode(!nightModeRef.current);                    break
        case 'v': case 'V':  handleZoneOverlay(!zoneOverlayRef.current);                break
        case 'c': case 'C': {
          const next = OVERLAY_CYCLE[(OVERLAY_CYCLE.indexOf(overlayRef.current) + 1) % OVERLAY_CYCLE.length]
          handleOverlay(next)
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)

    // ── Sim events ───────────────────────────────────────────────────────────

    // Live indicators (population + zone power coverage) refresh every sim tick,
    // not just at year-end, so power problems surface as soon as they happen.
    const offTick = events.on<TickEvent>('tick', () => {
      setPop(eng.sim.population)
      setPower({ ...eng.sim.power })
      setWater({ ...eng.sim.water })
      setBurning(eng.sim.burning)
      // Keep the tile-query popup and (if open) the budget figures live.
      if (queriedRef.current) {
        const { col, row } = queriedRef.current
        setQueried({ tile: { ...eng.world.get(col, row) }, col, row })
      }
      if (showDashboardRef.current) { setBudget(eng.sim.currentBudget()); refreshFinance() }
      // Coverage flags / heatmap values change inside the sim step (not via
      // world.set), so refresh the live overlay each tick while one is showing.
      const mode = overlayRef.current
      if (mode !== 'none') {
        if (GRADIENT_MODES.has(mode)) eng.renderer?.setOverlayGrid(eng.sim.grid(mode as GridMode))
        else eng.renderer?.markOverlayDirty()
      }
    })

    const offYear = events.on<YearEvent>('year', ({ year, revenue, expenses, debtService }) => {
      setYear(year)
      setPop(eng.sim.population)
      // Bond payments are part of the year's net change to the treasury.
      const net = revenue - expenses - debtService
      fundsRef.current += net
      eng.sim.funds = fundsRef.current
      setFunds(fundsRef.current)
      // Feed the budget figures + history graphs + finance summary + rating.
      setBudget({ revenue, expenses })
      setPopHistory([...eng.sim.popHistory])
      setFundsHistory([...eng.sim.fundsHistory])
      setCityRating(eng.sim.cityRating)
      refreshFinance()
    })

    // ── Async: init PixiJS renderer, then start ──────────────────────────────

    eng.init().then(() => {
      generateWorld(eng.world)
      eng.renderer!.minimap.markDirty()
      eng.start()
      window.__eng = eng
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
      delete window.__eng
      offTick()
      offYear()
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <Toolbar
        activeKey={activeKey}
        onKeyChange={setActiveKey}
        onNewGame={handleNewGame}
        onSaveState={handleSaveState}
        onLoadState={handleLoadState}
        onExportFile={handleExportFile}
        onImportFile={handleImportFile}
        onOptionsOpen={refreshSavedCities}
        cityName={cityName}
        onCityNameChange={setCityName}
        savedCities={savedCities}
        status={optionsStatus}
        nightMode={nightMode}
        onNightMode={handleNightMode}
        showZoneOverlay={showZoneOverlay}
        onZoneOverlay={handleZoneOverlay}
        overlay={overlay}
        onOverlay={handleOverlay}
      />
      <BottomBar year={year} population={pop} funds={funds} power={power} water={water} burning={burning} />
      <SpeedControl speed={speed} onSpeedChange={handleSpeedChange} />
      <CityLog />

      {/* Top-right: City Data dashboard toggle [D] */}
      <button
        title="City Data [D]"
        onClick={toggleDashboard}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 36, height: 36,
          border: `2px solid ${showDashboard ? '#aaa' : 'transparent'}`,
          background: showDashboard ? '#333' : 'rgba(0,0,0,0.82)',
          color: '#eee', cursor: 'pointer', borderRadius: 8,
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >📊</button>

      {showDashboard && (
        <Dashboard
          revenue={budget.revenue}
          expenses={budget.expenses}
          popHistory={popHistory}
          fundsHistory={fundsHistory}
          population={pop}
          funds={funds}
          power={power}
          water={water}
          burning={burning}
          cityRating={cityRating}
          rating={finance.rating}
          debt={finance.debt}
          debtService={finance.debtService}
          nextRate={finance.nextRate}
          bonds={finance.bonds}
          onIssueBond={handleIssueBond}
          onPayoffBond={handlePayoffBond}
          ordinances={ordinances}
          onOrdinance={handleOrdinance}
          onClose={toggleDashboard}
        />
      )}

      {queried && (
        <ZoneInfoPopup
          tile={queried.tile} col={queried.col} row={queried.row}
          onClose={closeQuery}
          offsetRight={showDashboard ? 236 : 8}
        />
      )}
    </div>
  )
}

render(<App />, document.getElementById('app')!)
