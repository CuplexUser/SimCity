import { describe, it, expect } from 'vitest'
import { buildRoadNetwork } from './laneGraph'
import { World } from '../core/world'
import { Overlay } from '../core/tile'

function road(world: World, col: number, row: number) {
  world.set(col, row, { overlay: Overlay.Road })
}
function diag(world: World, col: number, row: number) {
  world.set(col, row, { overlay: Overlay.RoadDiag })
}

describe('buildRoadNetwork', () => {
  it('ignores tiles with no road', () => {
    const world = new World()
    const net = buildRoadNetwork(world)
    expect(net.tiles).toHaveLength(0)
    expect(net.adj.size).toBe(0)
  })

  it('drops a lone road with no neighbors', () => {
    const world = new World()
    road(world, 4, 4)
    const net = buildRoadNetwork(world)
    expect(net.tiles).toHaveLength(0)
  })

  it('links orthogonal road neighbors', () => {
    const world = new World()
    road(world, 1, 1); road(world, 2, 1)
    const net = buildRoadNetwork(world)
    const a = 1 * world.cols + 1
    const b = 1 * world.cols + 2
    expect(net.adj.get(a)).toContain(b)
    expect(net.adj.get(b)).toContain(a)
  })

  it('links diagonal neighbors when at least one is a diagonal road', () => {
    const world = new World()
    diag(world, 1, 1); diag(world, 2, 2)
    const net = buildRoadNetwork(world)
    const a = 1 * world.cols + 1
    const b = 2 * world.cols + 2
    expect(net.adj.get(a)).toContain(b)
    expect(net.adj.get(b)).toContain(a)
  })

  it('does not link diagonal corner of two orthogonal roads', () => {
    const world = new World()
    // (1,1) and (2,2) are both orthogonal roads at a diagonal of each other,
    // with no diagonal road — they must NOT be connected.
    road(world, 1, 1); road(world, 2, 2)
    const net = buildRoadNetwork(world)
    const a = 1 * world.cols + 1
    // Each is a lone orthogonal road with no orthogonal neighbor → dropped.
    expect(net.adj.get(a)).toBeUndefined()
  })

  it('merges a diagonal road into an adjacent orthogonal road', () => {
    const world = new World()
    road(world, 1, 1)            // orthogonal
    diag(world, 2, 2)            // diagonal at its SE corner
    road(world, 3, 2)            // gives the diagonal an orthogonal partner too
    const net = buildRoadNetwork(world)
    const ortho = 1 * world.cols + 1
    const dg = 2 * world.cols + 2
    // Diagonal tile links to the orthogonal corner because it is itself diagonal.
    expect(net.adj.get(dg)).toContain(ortho)
    expect(net.adj.get(ortho)).toContain(dg)
  })
})
