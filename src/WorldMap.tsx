import { useRef, type PointerEvent } from 'react'
import { ArrowLeftRight, Castle, LocateFixed, Minus, Mountain, Plus, TreePine, Waves } from 'lucide-react'
import type { WorldTile } from './types'
import { getTileGridPosition } from './worldMapModel'

type Props = {
  tiles: WorldTile[]
  center: { x: number; y: number }
  radius: number
  loading: boolean
  error: string
  ownVillageIds: string[]
  ownAllianceTag: string | null
  selectedTile: WorldTile | null
  onSelectTile: (tile: WorldTile) => void
  onMove: (x: number, y: number) => void
  onRadiusChange: (radius: number) => void
}

const TERRAIN_ICONS = { plains: null, forest: TreePine, hills: Mountain, marsh: Waves } as const

export default function WorldMap({
  tiles, center, radius, loading, error, ownVillageIds, ownAllianceTag, selectedTile,
  onSelectTile, onMove, onRadiusChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const boardSize = radius * 2 + 1

  function startPan(event: PointerEvent<HTMLDivElement>) {
    const target = event.target
    if (target instanceof Element && target.closest('.map-tile.has-settlement')) {
      pointerStart.current = null
      return
    }
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }

  function finishPan(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current
    pointerStart.current = null
    const viewport = viewportRef.current
    if (!start || !viewport) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    const stepX = Math.round(-dx / (viewport.clientWidth / boardSize))
    const stepY = Math.round(dy / (viewport.clientHeight / boardSize))
    if (stepX || stepY) onMove(center.x + stepX, center.y + stepY)
  }

  return (
    <section className="map-view">
      <div className="view-kicker"><span>WELT I · DIE GRENZLANDE</span><span>{tiles.length.toLocaleString('de-DE')} FELDER</span></div>
      <div className="map-heading"><div><p className="eyebrow">DIE BEKANNTE WELT</p><h1>Weltkarte</h1></div><div className="map-center-readout"><LocateFixed size={16} /><span>{center.x} <i>/</i> {center.y}</span></div></div>
      <div className="map-frame">
        <div className="map-frame-top"><span><i /> GEMEINSAME WELT · LIVE-DATEN</span><span>KOORDINATENRASTER</span></div>
        <div className={`map-viewport${loading ? ' is-loading' : ''}`} ref={viewportRef} onPointerDown={startPan} onPointerUp={finishPan} onPointerCancel={() => { pointerStart.current = null }} aria-label="Interaktive Weltkarte, zum Verschieben ziehen">
          <div className={`map-board${radius <= 12 ? ' map-board-detail' : ''}`} style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}>
            {tiles.map((tile) => {
              const TerrainIcon = TERRAIN_ICONS[tile.terrain]
              const selected = selectedTile?.x === tile.x && selectedTile?.y === tile.y
              const isOwnVillage = tile.village_id !== null && ownVillageIds.includes(tile.village_id)
              const settlement = tile.village_id
                ? isOwnVillage ? ' own-settlement'
                  : tile.is_barbarian ? ' barbarian-settlement'
                    : tile.alliance_tag && tile.alliance_tag === ownAllianceTag ? ' allied-settlement'
                      : ' player-settlement'
                : ''
              const position = getTileGridPosition(tile.x, tile.y, center, radius)
              return <button type="button" key={`${tile.x}:${tile.y}`} className={`map-tile terrain-${tile.terrain}${settlement}${tile.village_id ? ' has-settlement' : ''}${selected ? ' selected' : ''}`} style={{ gridColumnStart: position.column, gridRowStart: position.row }} onClick={() => onSelectTile(tile)} title={`${tile.village_name ?? tile.terrain} (${tile.x} | ${tile.y})`} aria-label={`${tile.village_name ?? tile.terrain}, Koordinaten ${tile.x} ${tile.y}`}>
                {tile.village_id ? <><span className="settlement-marker">{isOwnVillage ? <Castle size={20} /> : tile.is_barbarian ? <span className="barbarian-mark">✦</span> : tile.alliance_tag && tile.alliance_tag === ownAllianceTag ? <Castle size={17} /> : <span className="player-mark">◆</span>}{tile.has_movement && <ArrowLeftRight className="movement-mark" size={10} />}</span>{radius <= 12 && <span className="settlement-name">{tile.village_name}</span>}</> : TerrainIcon ? <TerrainIcon className="terrain-mark" size={13} /> : null}
                <span className="tile-coordinate">{tile.x}|{tile.y}</span>
              </button>
            })}
          </div>
          {loading && <div className="map-loading"><span className="loading-ring" />Welt wird geladen</div>}
          {error && <div className="map-error" role="alert">Karte konnte nicht geladen werden: {error}</div>}
          <div className="map-axis axis-north">N</div><div className="map-axis axis-west">W</div><div className="map-coordinates">{center.x} / {center.y}</div>
        </div>
        <div className="map-controls"><span>ANSICHT</span><div className="zoom-control"><button type="button" onClick={() => onRadiusChange(Math.min(20, radius + 2))} disabled={radius >= 20} aria-label="Herauszoomen" title="Herauszoomen"><Minus size={16} /></button><span>{Math.round(1000 / radius)}%</span><button type="button" onClick={() => onRadiusChange(Math.max(4, radius - 2))} disabled={radius <= 4} aria-label="Hineinzoomen" title="Hineinzoomen"><Plus size={16} /></button></div><button type="button" className="recenter-button" onClick={() => { const home = tiles.find((tile) => tile.village_id && ownVillageIds.includes(tile.village_id)); if (home) onMove(home.x, home.y) }}><LocateFixed size={15} /> Zu deinem Reich</button><span className="map-drag-hint">Ziehen zum Verschieben</span></div>
      </div>
      <div className="map-caption"><span>JEDES FELD IST FEST AN SEINE WELTKOORDINATE GEBUNDEN</span><span>{tiles.length} FELDER GELADEN</span></div>
    </section>
  )
}
