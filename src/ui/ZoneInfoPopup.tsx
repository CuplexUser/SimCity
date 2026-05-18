import { type Tile } from '../core/tile'

interface Props {
  tile: Tile
  col: number
  row: number
}

export function ZoneInfoPopup({ tile, col, row }: Props) {
  return (
    <aside>
      <h2>Tile {col}, {row}</h2>
      <p>Zone: {tile.zone}</p>
      <p>Density: {tile.density}</p>
      <p>Powered: {tile.powered ? 'yes' : 'no'}</p>
      <p>Watered: {tile.watered ? 'yes' : 'no'}</p>
    </aside>
  )
}
