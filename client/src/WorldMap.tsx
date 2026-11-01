import { useMemo, useState } from 'react'
import './WorldMap.css'

type WorldMapProps = {
  villageName: string
  villageX: number
  villageY: number
}

type MapVillage = {
  id: string
  name: string
  dx: number
  dy: number
  type: 'barbarian'
  points: number
  description: string
}

const barbarianVillages: MapVillage[] = [
  { id: 'barb-1', name: 'Altes Lager', dx: -3, dy: -2, type: 'barbarian', points: 120, description: 'Ein kleines, verlassen wirkendes Dorf.' },
  { id: 'barb-2', name: 'Eichenwacht', dx: 2, dy: -3, type: 'barbarian', points: 180, description: 'Ein befestigtes Barbarendorf am Waldrand.' },
  { id: 'barb-3', name: 'Dornfeld', dx: 4, dy: 1, type: 'barbarian', points: 90, description: 'Ein schwach geschütztes Dorf.' },
  { id: 'barb-4', name: 'Graustein', dx: -2, dy: 3, type: 'barbarian', points: 260, description: 'Ein größeres Dorf mit steinernen Palisaden.' },
  { id: 'barb-5', name: 'Falkenruh', dx: 1, dy: 4, type: 'barbarian', points: 150, description: 'Ein Dorf auf einer kleinen Anhöhe.' },
  { id: 'barb-6', name: 'Moorbrück', dx: -4, dy: 1, type: 'barbarian', points: 210, description: 'Ein abgelegenes Dorf nahe dem Moor.' },
  { id: 'barb-7', name: 'Kiefernhain', dx: 3, dy: 3, type: 'barbarian', points: 310, description: 'Ein gut ausgebautes Barbarendorf.' },
  { id: 'barb-8', name: 'Westfurt', dx: -1, dy: -4, type: 'barbarian', points: 75, description: 'Ein kleines Dorf an einer alten Furt.' },
]

function Terrain({ kind }: { kind: number }) {
  if (kind === 0) return <span className="terrain-art forest-art" aria-hidden="true"><i /><i /><i /></span>
  if (kind === 1) return <span className="terrain-art hill-art" aria-hidden="true"><i /><i /></span>
  if (kind === 2) return <span className="terrain-art rock-art" aria-hidden="true"><i /><i /><i /></span>
  return <span className="terrain-art grass-art" aria-hidden="true" />
}

function VillageIcon({ barbarian = false }: { barbarian?: boolean }) {
  return (
    <svg className={barbarian ? 'village-art barbarian-art' : 'village-art home-art'} viewBox="0 0 64 58" aria-hidden="true">
      <ellipse cx="32" cy="51" rx="27" ry="5" fill="#182116" opacity=".38" />
      {barbarian ? (
        <>
          <path d="M10 29 L31 12 L54 29 L50 48 L14 48 Z" fill="#72513a" stroke="#392b20" strokeWidth="2" />
          <path d="M7 29 L31 7 L57 29 L49 31 L31 16 L14 31 Z" fill="#9b5d38" stroke="#392b20" strokeWidth="2" />
          <path d="M24 34 L40 34 L40 48 L24 48 Z" fill="#30251d" />
          <path d="M16 25 L16 14 M21 20 L21 11 M47 23 L47 12" stroke="#c4a06a" strokeWidth="2" />
        </>
      ) : (
        <>
          <path d="M13 22 L23 22 L23 11 L34 11 L34 22 L45 22 L45 47 L13 47 Z" fill="#b6a17a" stroke="#493d2b" strokeWidth="2" />
          <path d="M9 24 L29 8 L49 24 L43 27 L29 16 L15 27 Z" fill="#76513a" stroke="#493d2b" strokeWidth="2" />
          <path d="M25 33 L34 33 L34 47 L25 47 Z" fill="#403023" />
          <path d="M27 8 L27 2 L31 2 L31 8" fill="#9b8b6b" stroke="#493d2b" strokeWidth="1.5" />
          <path d="M19 29 L23 29 L23 34 L19 34 Z M37 29 L41 29 L41 34 L37 34 Z" fill="#d7c58e" />
        </>
      )}
    </svg>
  )
}

function WorldMap({ villageName, villageX, villageY }: WorldMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cells = useMemo(() => Array.from({ length: 81 }, (_, index) => ({
    col: index % 9,
    row: Math.floor(index / 9),
  })), [])

  const selectedVillage = barbarianVillages.find(village => village.id === selectedId)
  const selectedCoordinates = selectedVillage
    ? { x: villageX + selectedVillage.dx, y: villageY + selectedVillage.dy }
    : null

  return (
    <section className="world-map-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DIE BEKANNTE WELT</p>
          <h2>Weltkarte</h2>
        </div>
        <span className="building-count">Testwelt · 9 × 9 Felder</span>
      </div>

      <p className="world-map-intro">
        Wähle ein Dorf auf der Karte aus, um seine Informationen anzuzeigen.
      </p>

      <div className="world-map-layout">
        <div className="world-map-viewport">
          <div className="world-map-board" role="group" aria-label="Weltkarte mit deinem Dorf und Barbarendörfern">
            {Array.from({ length: 9 }, (_, row) => (
              <div className={`world-map-row ${row % 2 === 1 ? 'offset-row' : ''}`} key={row}>
                {cells.filter(cell => cell.row === row).map(cell => {
                  const dx = cell.col - 4
                  const dy = cell.row - 4
                  const barbarian = barbarianVillages.find(village => village.dx === dx && village.dy === dy)
                  const isHome = dx === 0 && dy === 0
                  const terrainKind = (cell.col * 7 + cell.row * 11 + cell.col * cell.row) % 4

                  return (
                    <div className={`world-map-cell terrain-${terrainKind} ${isHome ? 'home-cell' : barbarian ? 'occupied-cell' : ''}`} key={`${cell.col}-${cell.row}`}>
                      {!isHome && !barbarian && <Terrain kind={terrainKind} />}
                      {isHome ? (
                        <div className="map-village home-village" title={villageName}>
                          <VillageIcon />
                          <small>DEIN DORF</small>
                        </div>
                      ) : barbarian ? (
                        <button
                          type="button"
                          className={`map-village barbarian-village ${selectedId === barbarian.id ? 'selected' : ''}`}
                          onClick={() => setSelectedId(barbarian.id)}
                          title={barbarian.name}
                          aria-label={`${barbarian.name} auswählen`}
                        >
                          <VillageIcon barbarian />
                          <small>BARBAREN</small>
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="map-coordinates"><span>NORDEN</span><span>{villageX} | {villageY}</span></div>
        </div>

        <aside className="world-map-side">
          <div className="map-legend">
            <h3>Kartenzeichen</h3>
            <p><span className="legend-castle"><VillageIcon /></span> Dein Dorf</p>
            <p><span className="legend-hut"><VillageIcon barbarian /></span> Barbarendorf</p>
            <p><span className="legend-forest">♣</span> Waldgebiet</p>
            <p><span className="legend-hill">▲</span> Hügelland</p>
          </div>

          <div className="map-details">
            <h3>{selectedVillage ? selectedVillage.name : villageName}</h3>
            {selectedVillage && selectedCoordinates ? (
              <>
                <p className="map-village-type">Barbarendorf · Neutral</p>
                <p>Koordinaten: ({selectedCoordinates.x} | {selectedCoordinates.y})</p>
                <p>Punkte: {selectedVillage.points}</p>
                <p>{selectedVillage.description}</p>
                <p>Entfernung: {Math.round(Math.hypot(selectedVillage.dx, selectedVillage.dy) * 10) / 10} Felder</p>
              </>
            ) : (
              <>
                <p className="map-village-type">Dein Hauptdorf</p>
                <p>Koordinaten: ({villageX} | {villageY})</p>
                <p>{villageName}</p>
                <p>Wähle ein Barbarendorf auf der Karte aus.</p>
              </>
            )}
          </div>
        </aside>
      </div>
      <p className="map-stage-note">
        Entwicklungsstand: Die dargestellten Dörfer sind noch Testdaten. Die Welt wird später zentral in Supabase gespeichert.
      </p>
    </section>
  )
}

export default WorldMap
