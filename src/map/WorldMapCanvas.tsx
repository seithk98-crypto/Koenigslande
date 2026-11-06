import {
  useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { WorldTile } from '../types.ts'
import { BANNER_COLORS, paintLandscape } from './landscapePainter.ts'
import { GROUND_PALETTE, WORLD_MAX, WORLD_MIN, boardGeometry, tileCell, villageKind, type Rgb } from './landscapeScene.ts'
import { loadSpriteAtlas, type SpriteAtlas } from './spriteAtlas.ts'
import './landscape.css'

/** Dieselben Props wie die klassische `WorldMap`, damit beide Karten austauschbar sind. */
export type WorldMapCanvasProps = {
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

type Offset = { x: number; y: number; animate: boolean }

const ATLAS_URL = '/assets/map/active'
const DRAG_THRESHOLD = 6
const SETTLE_MS = 140

function swatch(color: Rgb) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
}

function clampWorld(value: number) {
  return Math.max(WORLD_MIN, Math.min(WORLD_MAX, value))
}

export default function WorldMapCanvas({
  tiles, center, radius, loading, error, ownVillageIds, ownAllianceTag, selectedTile,
  onSelectTile, onMove, onRadiusChange,
}: WorldMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; startX: number; startY: number; active: boolean } | null>(null)
  const suppressClick = useRef(false)
  const settleTimer = useRef<number | null>(null)
  const [atlas, setAtlas] = useState<SpriteAtlas | null>(null)
  const [paintError, setPaintError] = useState('')
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0, animate: false })
  const [coordinateQuery, setCoordinateQuery] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
  const geo = useMemo(() => boardGeometry(center, radius), [center.x, center.y, radius])
  const ownKey = ownVillageIds.join('|')

  useEffect(() => {
    let active = true
    void loadSpriteAtlas(ATLAS_URL).then((loaded) => { if (active) setAtlas(loaded) })
    return () => { active = false }
  }, [])

  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
  }, [])

  // Zeichnen und Versatz zurücksetzen im selben Schritt, damit es nicht flackert.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      paintLandscape(canvas, { tiles, center, radius, ownVillageIds, ownAllianceTag, atlas })
      setPaintError('')
    } catch (caught) {
      setPaintError(caught instanceof Error ? caught.message : 'Unbekannter Fehler')
    }
    setOffset((current) => (drag.current?.active ? current : { x: 0, y: 0, animate: false }))
  }, [tiles, center.x, center.y, radius, ownKey, ownAllianceTag, atlas])

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, active: false }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      current.active = true
      viewportRef.current?.setPointerCapture(event.pointerId)
    }
    setOffset({ x: dx, y: dy, animate: false })
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    drag.current = null
    const viewport = viewportRef.current
    if (!current || current.id !== event.pointerId || !current.active || !viewport) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)

    const tileCss = viewport.clientWidth / geo.size
    const stepX = Math.round(-(event.clientX - current.startX) / tileCss)
    const stepY = Math.round((event.clientY - current.startY) / tileCss)
    const next = { x: clampWorld(center.x + stepX), y: clampWorld(center.y + stepY) }
    if (next.x === center.x && next.y === center.y) {
      setOffset({ x: 0, y: 0, animate: true })
      return
    }
    // Erst sanft auf das nächste Feldraster einrasten, dann den neuen Ausschnitt laden.
    setOffset({ x: (center.x - next.x) * tileCss, y: (next.y - center.y) * tileCss, animate: true })
    settleTimer.current = window.setTimeout(() => onMove(next.x, next.y), SETTLE_MS)
  }

  function cancelDrag() {
    drag.current = null
    setOffset({ x: 0, y: 0, animate: true })
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
    if (x < WORLD_MIN || x > WORLD_MAX || y < WORLD_MIN || y > WORLD_MAX) {
      setCoordinateError('Koordinaten müssen zwischen −100 und 100 liegen.')
      return
    }
    setCoordinateError('')
    onMove(x, y)
  }

  const visibleTiles = tiles.filter((tile) => {
    const cell = tileCell(geo, tile.x, tile.y)
    return cell.column >= 1 && cell.column <= geo.size && cell.row >= 1 && cell.row <= geo.size
  })

  return (
    <section className="map-view landscape-map">
      <div className="view-kicker"><span>WELT I · DIE GRENZLANDE · LANDSCHAFTSANSICHT (PROTOTYP)</span><span>{tiles.length.toLocaleString('de-DE')} FELDER</span></div>
      <div className="map-heading"><div><p className="eyebrow">DIE BEKANNTE WELT</p><h1>Weltkarte</h1></div><div className="map-heading-tools">
        <form className="map-coordinate-search" onSubmit={searchCoordinates} role="search" aria-label="Weltkoordinaten suchen">
          <label className="sr-only" htmlFor="landscape-coordinate-query">Koordinaten X, Y</label>
          <input id="landscape-coordinate-query" value={coordinateQuery} onChange={(event) => { setCoordinateQuery(event.target.value); setCoordinateError('') }} placeholder="Koordinaten X, Y" inputMode="text" />
          <button type="submit">Gehe zu</button>
        </form>
        <div className="map-center-readout"><span>{center.x} <i>/</i> {center.y}</span></div>
      </div></div>
      {coordinateError && <p className="map-search-error" role="alert">{coordinateError}</p>}
      <div className="map-frame">
        <div className="map-frame-top"><span><i /> GEMEINSAME WELT · LIVE-DATEN</span><span>{atlas ? `SPRITES: ${atlas.manifest.name.toUpperCase()}` : 'HANDGEZEICHNETE LANDSCHAFT'}</span></div>
        <div
          className="map-viewport landscape-viewport"
          ref={viewportRef}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
          aria-label="Interaktive Landschaftskarte, zum Verschieben ziehen"
        >
          <div
            className={`landscape-stage${offset.animate ? ' is-settling' : ''}`}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
          >
            <canvas ref={canvasRef} className="landscape-canvas" aria-hidden="true" data-testid="landscape-canvas" />
            <div className="landscape-hit" style={{ gridTemplateColumns: `repeat(${geo.size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${geo.size}, minmax(0, 1fr))` }}>
              {visibleTiles.map((tile) => {
                const cell = tileCell(geo, tile.x, tile.y)
                const kind = villageKind(tile, ownVillageIds, ownAllianceTag)
                const selected = selectedTile?.x === tile.x && selectedTile?.y === tile.y
                return (
                  <button
                    type="button"
                    key={`${tile.x}:${tile.y}`}
                    className={`landscape-tile${kind ? ` has-village kind-${kind}` : ''}${selected ? ' is-selected' : ''}`}
                    style={{ gridColumnStart: cell.column, gridRowStart: cell.row }}
                    onClick={() => { if (!suppressClick.current) onSelectTile(tile) }}
                    title={`${tile.village_name ?? tile.terrain} (${tile.x} | ${tile.y})`}
                    aria-label={`${tile.village_name ?? tile.terrain}, Koordinaten ${tile.x} ${tile.y}`}
                    aria-pressed={selected}
                  >
                    {kind && tile.has_movement && <span className="landscape-movement" aria-hidden="true">⇄</span>}
                    {kind && (radius <= 12 || selected) && <span className={`landscape-label kind-${kind}`}>{tile.village_name}</span>}
                    <span className="landscape-coordinate" aria-hidden="true">{tile.x}|{tile.y}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {loading && <div className="map-loading"><span className="loading-ring" />Welt wird geladen</div>}
          {error && <div className="map-error" role="alert">Karte konnte nicht geladen werden: {error}</div>}
          {paintError && <div className="map-error" role="alert">Landschaft konnte nicht gezeichnet werden: {paintError}. Wechsle oben zur klassischen Karte.</div>}
          <div className="map-axis axis-north">N</div><div className="map-axis axis-west">W</div><div className="map-coordinates">{center.x} / {center.y}</div>
        </div>
        <div className="map-controls"><span>ANSICHT</span><div className="zoom-control"><button type="button" onClick={() => onRadiusChange(Math.min(20, radius + 2))} disabled={radius >= 20} aria-label="Herauszoomen" title="Herauszoomen">−</button><span>{Math.round(1000 / radius)}%</span><button type="button" onClick={() => onRadiusChange(Math.max(4, radius - 2))} disabled={radius <= 4} aria-label="Hineinzoomen" title="Hineinzoomen">+</button></div><button type="button" className="recenter-button" onClick={() => { const home = tiles.find((tile) => tile.village_id && ownVillageIds.includes(tile.village_id)); if (home) onMove(home.x, home.y) }}>Zu deinem Reich</button><span className="map-drag-hint">Ziehen zum Verschieben</span></div>
      </div>
      <div className="map-caption"><span>JEDES FELD IST FEST AN SEINE WELTKOORDINATE GEBUNDEN</span><span>{tiles.length} FELDER GELADEN</span></div>
      <div className="map-legend" aria-label="Kartenlegende">
        <div className="map-legend-group">
          <span className="map-legend-heading">LANDSCHAFT</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: swatch(GROUND_PALETTE.plains) }} /> Ebenen</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: swatch(GROUND_PALETTE.forest) }} /> Wälder</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: swatch(GROUND_PALETTE.hills) }} /> Hügel</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: swatch(GROUND_PALETTE.marsh) }} /> Sümpfe</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: swatch(GROUND_PALETTE.sea) }} /> Weltrand</span>
        </div>
        <div className="map-legend-group">
          <span className="map-legend-heading">SIEDLUNGEN (BANNER)</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: BANNER_COLORS.own }} /> Dein Reich</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: BANNER_COLORS.allied }} /> Allianz</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: BANNER_COLORS.player }} /> Spieler</span>
          <span className="map-legend-item"><i className="map-legend-swatch" style={{ background: BANNER_COLORS.barbarian }} /> Barbaren</span>
        </div>
      </div>
    </section>
  )
}
