import { useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { ArrowLeftRight, LocateFixed, Minus, Mountain, Plus, TreePine, Waves } from 'lucide-react'
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


function TerrainArtwork({ kind }: { kind: 'forest' | 'hills' | 'marsh' }) {
  if (kind === 'forest') return <svg className="terrain-art terrain-art-forest" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 37 15 22l7 15H8Zm10 3 9-21 10 21H18Z" fill="#294a32" stroke="#b2b982" strokeWidth="1.2"/>
    <path d="m11 29 4-9 5 9m7 2 7-15 7 15" fill="none" stroke="#7d9560" strokeWidth="1.4"/>
    <path d="M14 37v5m15-2v5" stroke="#725638" strokeWidth="2.2"/>
    <path d="M3 43h42" stroke="#d1c58a" strokeWidth="1" opacity=".6"/>
  </svg>
  if (kind === 'hills') return <svg className="terrain-art terrain-art-hills" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M2 39 15 16l9 14 8-20 14 29Z" fill="#837650" stroke="#e0c895" strokeWidth="1.2"/>
    <path d="m8 39 8-14 6 9m4 5 6-23 8 16" fill="none" stroke="#d5c18f" strokeWidth="2"/>
    <path d="m28 17 4-7 4 8-4-2Z" fill="#eee0b9"/>
    <path d="M4 42h40" stroke="#6b6245" strokeWidth="2"/>
  </svg>
  return <svg className="terrain-art terrain-art-marsh" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M4 36q10-8 20 0t20 0v8H4Z" fill="#476d62" stroke="#b6c39a" strokeWidth="1"/>
    <path d="M12 36V15m0 9-5-5m5 9 5-6m9 14V10m0 12-5-5m5 10 6-7m5 16V18m0 9-4-5" fill="none" stroke="#d0c88e" strokeWidth="2" strokeLinecap="round"/>
    <path d="M4 40q8-4 16 0t24 0" fill="none" stroke="#a8c4a0" strokeWidth="1.5"/>
  </svg>
}

function SettlementArtwork({ kind }: { kind: 'own' | 'barbarian' | 'allied' | 'player' }) {
  const common = { viewBox: '0 0 48 48', 'aria-hidden': true as const, focusable: false as const }
  if (kind === 'own') return <svg {...common}>
    <path d="M5 39h38v5H5z" fill="#6d5130" stroke="#e0c486" strokeWidth="1.2" />
    <path d="M8 22 24 9l16 13v17H8z" fill="#8c7953" stroke="#ead29a" strokeWidth="1.5" />
    <path d="M5 23 24 6l19 17-3 3L24 12 8 26z" fill="#713d2d" stroke="#e9c27b" strokeWidth="1.4" />
    <path d="M17 18h14v21H17z" fill="#c2a36a" stroke="#55452d" />
    <path d="M20 21h8v7h-8z" fill="#344d3b" stroke="#e6cb8b" />
    <path d="M21 32h6v7h-6z" fill="#503526" stroke="#e5c98d" />
    <path d="M21 5V1h6v4M24 1v-2" stroke="#e8d39c" strokeWidth="1.6" />
    <path d="M24 0h8l-4 4h-4z" fill="#a84d36" stroke="#e5c98d" strokeWidth=".8" />
  </svg>
  if (kind === 'barbarian') return <svg {...common}>
    <path d="M5 40h38v4H5z" fill="#56372b" stroke="#d69b77" />
    <path d="m8 23 15-13 17 13v17H8z" fill="#76503a" stroke="#e2b08a" strokeWidth="1.4" />
    <path d="m5 24 18-17 20 17-3 3L23 12 8 27z" fill="#71352e" stroke="#e6b38d" />
    <path d="M17 27h13v13H17z" fill="#3a3028" stroke="#c88b69" />
    <path d="m13 16 5-8m17 8-5-8" stroke="#e0c49a" strokeWidth="2" />
    <path d="M19 31h9" stroke="#d6a07d" strokeWidth="2" />
  </svg>
  if (kind === 'allied') return <svg {...common}>
    <path d="M5 40h38v4H5z" fill="#52613b" stroke="#c6d69a" />
    <path d="M8 23 24 10l16 13v17H8z" fill="#71865a" stroke="#d6e2ad" strokeWidth="1.4" />
    <path d="m5 24 19-17 19 17-3 3L24 12 8 27z" fill="#486c48" stroke="#d8e4ae" />
    <path d="M18 26h12v14H18z" fill="#354d37" stroke="#d7dfa8" />
    <path d="M24 13 34 17v8c0 7-5 11-10 13-5-2-10-6-10-13v-8z" fill="#b5c982" stroke="#e7e9bd" strokeWidth="1.2" />
    <path d="m20 25 3 3 6-7" fill="none" stroke="#344d35" strokeWidth="2.4" />
  </svg>
  return <svg {...common}>
    <path d="M5 40h38v4H5z" fill="#68472d" stroke="#e0bd83" />
    <path d="M8 23 24 10l16 13v17H8z" fill="#a47b4c" stroke="#e8c995" strokeWidth="1.4" />
    <path d="m5 24 19-17 19 17-3 3L24 12 8 27z" fill="#8c4e37" stroke="#edc58d" />
    <path d="M17 27h14v13H17z" fill="#55402d" stroke="#e2c18a" />
    <path d="M20 20h8v7h-8z" fill="#354d43" stroke="#e7cb96" />
    <path d="M22 32h4v8h-4z" fill="#c19a61" />
  </svg>
}

export default function WorldMap({
  tiles, center, radius, loading, error, ownVillageIds, ownAllianceTag, selectedTile,
  onSelectTile, onMove, onRadiusChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const [coordinateQuery, setCoordinateQuery] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
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

  function searchCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const match = coordinateQuery.match(/^\s*(-?\d{1,3})\s*[,|]\s*(-?\d{1,3})\s*$/)
    if (!match) {
      setCoordinateError('Bitte Koordinaten im Format X, Y eingeben.')
      return
    }
    const x = Number(match[1])
    const y = Number(match[2])
    if (x < -100 || x > 100 || y < -100 || y > 100) {
      setCoordinateError('Koordinaten müssen zwischen −100 und 100 liegen.')
      return
    }
    setCoordinateError('')
    onMove(x, y)
  }

  return (
    <section className="map-view">
      <div className="view-kicker"><span>WELT I · DIE GRENZLANDE</span><span>{tiles.length.toLocaleString('de-DE')} FELDER</span></div>
      <div className="map-heading"><div><p className="eyebrow">DIE BEKANNTE WELT</p><h1>Weltkarte</h1></div><div className="map-heading-tools">
        <form className="map-coordinate-search" onSubmit={searchCoordinates} role="search" aria-label="Weltkoordinaten suchen">
          <label className="sr-only" htmlFor="map-coordinate-query">Koordinaten X, Y</label>
          <input id="map-coordinate-query" value={coordinateQuery} onChange={(event) => { setCoordinateQuery(event.target.value); setCoordinateError('') }} placeholder="Koordinaten X, Y" inputMode="text" />
          <button type="submit">Gehe zu</button>
        </form>
        <div className="map-center-readout"><LocateFixed size={16} /><span>{center.x} <i>/</i> {center.y}</span></div>
      </div></div>
      {coordinateError && <p className="map-search-error" role="alert">{coordinateError}</p>}
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
              return <button type="button" key={`${tile.x}:${tile.y}`} className={`map-tile terrain-${tile.terrain}${settlement}${tile.village_id ? ' has-settlement' : ''}${selected ? ' selected' : ''}`} style={{
                  gridColumnStart: position.column,
                  gridRowStart: position.row,
                  backgroundPosition: `${((tile.x + 100) / 200) * 100}% ${((100 - tile.y) / 200) * 100}%`,
                  backgroundSize: `${(201 / boardSize) * 100}% ${(201 / boardSize) * 100}%`,
                  backgroundRepeat: 'no-repeat',
                }} onClick={() => onSelectTile(tile)} title={`${tile.village_name ?? tile.terrain} (${tile.x} | ${tile.y})`} aria-label={`${tile.village_name ?? tile.terrain}, Koordinaten ${tile.x} ${tile.y}`} aria-pressed={selected}>
                {tile.village_id ? <><span className="settlement-marker">{<SettlementArtwork kind={isOwnVillage ? 'own' : tile.is_barbarian ? 'barbarian' : tile.alliance_tag && tile.alliance_tag === ownAllianceTag ? 'allied' : 'player'} />}{tile.has_movement && <ArrowLeftRight className="movement-mark" size={10} />}</span>{radius <= 12 && <span className="settlement-name">{tile.village_name}</span>}</> : TerrainIcon ? <TerrainArtwork kind={tile.terrain as 'forest' | 'hills' | 'marsh'} /> : null}
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
      <div className="map-legend" aria-label="Kartenlegende">
        <div className="map-legend-group">
          <span className="map-legend-heading">LANDSCHAFT</span>
          <span className="map-legend-item"><i className="map-legend-swatch terrain-plains" /> Ebenen</span>
          <span className="map-legend-item"><i className="map-legend-swatch terrain-forest" /> Wälder</span>
          <span className="map-legend-item"><i className="map-legend-swatch terrain-hills" /> Hügel</span>
          <span className="map-legend-item"><i className="map-legend-swatch terrain-marsh" /> Sümpfe</span>
        </div>
        <div className="map-legend-group">
          <span className="map-legend-heading">SIEDLUNGEN</span>
          <span className="map-legend-item"><i className="map-legend-swatch legend-own" /> Dein Reich</span>
          <span className="map-legend-item"><i className="map-legend-swatch legend-allied" /> Allianz</span>
          <span className="map-legend-item"><i className="map-legend-swatch legend-player" /> Spieler</span>
          <span className="map-legend-item"><i className="map-legend-swatch legend-barbarian" /> Barbaren</span>
        </div>
      </div>
    </section>
  )
}
