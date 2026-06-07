import { get, keys, set } from 'idb-keyval'
import { World } from './world'
import { defaultTile, type Tile } from './tile'

export interface SaveGame {
  version: 1 | 2
  cols: number
  rows: number
  runs: TileRun[]
}

export interface SimState {
  year: number
  tick: number
  population: number
  funds: number
}

export interface GameStateSave extends SaveGame {
  sim: SimState
}

export interface TileRun {
  count: number
  tile: Tile
}

const PREFIX = 'webcity-save'

export function serializeWorld(world: World): SaveGame {
  const runs: TileRun[] = []
  let prev: Tile | null = null
  let count = 0

  world.forEach((tile) => {
    const snapshot = cloneTile(tile)
    if (prev && sameTile(prev, snapshot)) {
      count++
    } else {
      if (prev) runs.push({ count, tile: prev })
      prev = snapshot
      count = 1
    }
  })

  if (prev) runs.push({ count, tile: prev })
  return { version: 2, cols: world.cols, rows: world.rows, runs }
}

export function deserializeWorld(save: SaveGame): World {
  const world = new World()
  // v1 saves predate footprint fields; the defaultTile() spread below backfills them.
  if ((save.version !== 1 && save.version !== 2) || save.cols !== world.cols || save.rows !== world.rows) {
    throw new Error('Unsupported save format')
  }

  let index = 0
  for (const run of save.runs) {
    for (let i = 0; i < run.count; i++) {
      const col = index % world.cols
      const row = Math.floor(index / world.cols)
      world.set(col, row, { ...defaultTile(), ...run.tile })
      index++
    }
  }

  if (index !== world.cols * world.rows) throw new Error('Corrupt save data')
  return world
}

export function serializeGameState(world: World, sim: SimState): GameStateSave {
  return { ...serializeWorld(world), sim }
}

export function deserializeGameState(save: GameStateSave): { world: World; sim: SimState } {
  return { world: deserializeWorld(save), sim: save.sim }
}

export async function saveWorld(world: World, slot = 'autosave'): Promise<void> {
  await set(saveKey(slot), serializeWorld(world))
}

export async function loadWorld(slot = 'autosave'): Promise<World | null> {
  const save = await get<SaveGame>(saveKey(slot))
  return save ? deserializeWorld(save) : null
}

export async function saveGameState(world: World, sim: SimState, slot = 'autosave'): Promise<void> {
  await set(saveKey(slot), serializeGameState(world, sim))
}

export async function loadGameState(slot = 'autosave'): Promise<{ world: World; sim: SimState } | null> {
  const save = await get<GameStateSave>(saveKey(slot))
  return save ? deserializeGameState(save) : null
}

// ── JSON file export / import ────────────────────────────────────────────────
// Same payload as the IndexedDB slots, but as a portable JSON string the UI can
// download to / read from a `.json` file. Pure (no DOM) so it stays testable.

const DEFAULT_SIM: SimState = { year: 2000, tick: 0, population: 0, funds: 20_000 }

export function gameStateToJSON(world: World, sim: SimState): string {
  return JSON.stringify(serializeGameState(world, sim), null, 2)
}

export function gameStateFromJSON(text: string): { world: World; sim: SimState } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as SaveGame).runs)) {
    throw new Error('Not a WebCity save file')
  }
  const save = parsed as GameStateSave
  // deserializeWorld validates version, grid dimensions and run totals.
  const world = deserializeWorld(save)
  const sim = save.sim ? { ...DEFAULT_SIM, ...save.sim } : { ...DEFAULT_SIM }
  return { world, sim }
}

export async function listSavedCities(): Promise<string[]> {
  const allKeys = await keys()
  return allKeys
    .filter((key): key is string => typeof key === 'string' && key.startsWith(`${PREFIX}:`))
    .map((key) => key.slice(PREFIX.length + 1))
    .sort((a, b) => a.localeCompare(b))
}

export function normalizeCityName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  return trimmed || 'Untitled City'
}

function saveKey(slot: string): string {
  return `${PREFIX}:${normalizeCityName(slot)}`
}

function cloneTile(tile: Tile): Tile {
  return { ...tile }
}

function sameTile(a: Tile, b: Tile): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
