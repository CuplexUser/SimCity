export type DataLayer = 'none' | 'crime' | 'fire' | 'landValue' | 'pollution' | 'traffic' | 'power' | 'water'

interface Props {
  activeLayer: DataLayer
  onLayerChange: (layer: DataLayer) => void
}

const LAYERS: DataLayer[] = ['none', 'crime', 'fire', 'landValue', 'pollution', 'traffic', 'power', 'water']

export function DataLayerPanel({ activeLayer, onLayerChange }: Props) {
  return (
    <div>
      {LAYERS.map((layer) => (
        <button
          key={layer}
          type="button"
          aria-pressed={activeLayer === layer}
          onClick={() => onLayerChange(layer)}
        >
          {layer}
        </button>
      ))}
    </div>
  )
}
