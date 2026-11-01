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
        Dein Dorf liegt im Zentrum. Wähle ein Barbarendorf aus, um seine Informationen zu sehen.
      </p>

      <div className="world-map-layout">
        <div className="world-map-board" role="group" aria-label="Weltkarte mit deinem Dorf und Barbarendörfern">
          {Array.from({ length: 9 }, (_, row) => (
            <div className={`world-map-row ${row % 2 === 1 ? 'offset-row' : ''}`} key={row}>
              {cells.filter(cell => cell.row === row).map(cell => {
                const dx = cell.col - 4
                const dy = cell.row - 4
                const barbarian = barbarianVillages.find(village => village.dx === dx && village.dy === dy)
                const isHome = dx === 0 && dy === 0

                return (
                  <div className={`world-map-cell ${isHome ? 'home-cell' : barbarian ? 'occupied-cell' : ''}`} key={`${cell.col}-${cell.row}`}>
                    {isHome ? (
                      <div className="map-village home-village" title={villageName}>
                        <span>🏰</span>
                        <small>Du</small>
                      </div>
                    ) : barbarian ? (
                      <button
                        type="button"
                        className={`map-village barbarian-village ${selectedId === barbarian.id ? 'selected' : ''}`}
                        onClick={() => setSelectedId(barbarian.id)}
                        title={barbarian.name}
                        aria-label={`${barbarian.name} auswählen`}
                      >
                        <span>🏚️</span>
                        <small>Barbar</small>
                      </button>
                    ) : (
                      <span className="map-empty-mark" aria-hidden="true">·</span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <aside className="world-map-side">
          <div className="map-legend">
            <h3>Legende</h3>
            <p><span>🏰</span> Dein Dorf</p>
            <p><span>🏚️</span> Barbarendorf</p>
            <p><span>·</span> Freies Gebiet</p>
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
                <p>Wähle ein Barbarendorf auf der Karte aus.</p>
              </>
            )}
          </div>
        </aside>
      </div>
      <p className="map-stage-note">
        Entwicklungsstand: Diese Dörfer sind vorerst Testdaten. Im nächsten Schritt speichern wir die Welt zentral in Supabase.
      </p>
    </section>
  )
}

export default WorldMap
