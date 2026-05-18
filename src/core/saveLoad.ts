import { get, set } from 'idb-keyval'
import { World } from './world'
import { defaultTile, type Tile } from './tile'

export interface SaveGame {
  version: 1
  cols: number
  rows: number
  runs: TileRun[]
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
  return { version: 1, cols: world.cols, rows: world.rows, runs }
}

export function deserializeWorld(save: SaveGame): World {
  const world = new World()
  if (save.version !== 1 || save.cols !== world.cols || save.rows !== world.rows) {
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

export async function saveWorld(world: World, slot = 'autosave'): Promise<void> {
  await set(`${PREFIX}:${slot}`, serializeWorld(world))
}

export async function loadWorld(slot = 'autosave'): Promise<World | null> {
  const save = await get<SaveGame>(`${PREFIX}:${slot}`)
  return save ? deserializeWorld(save) : null
}

function cloneTile(tile: Tile): Tile {
  return { ...tile }
}

function sameTile(a: Tile, b: Tile): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
