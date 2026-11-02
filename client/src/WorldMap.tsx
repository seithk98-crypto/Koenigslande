import './WorldMap.css'
import type { WorldVillage } from './game/engine'

type WorldMapProps = {
  villages: WorldVillage[]
  selectedVillageId: string
  onSelectVillage: (id: string) => void
}

const BOARD_SIZE = 9
const GRID_CENTER = Math.floor(BOARD_SIZE / 2)

function WorldMap({ villages, selectedVillageId, onSelectVillage }: WorldMapProps) {
  const selectedVillage = villages.find((entry) => entry.id === selectedVillageId) ?? villages[0]

  return (
    <section className="world-map-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DIE BEKANNTE WELT</p>
          <h2>Weltkarte</h2>
        </div>
        <span className="building-count">{villages.length} Siedlungen</span>
      </div>

      <div className="world-map-layout">
        <div className="world-map-viewport">
          <div className="world-map-board" role="group" aria-label="Weltkarte">
            {Array.from({ length: BOARD_SIZE }, (_, row) => (
              <div className="world-map-row" key={row}>
                {Array.from({ length: BOARD_SIZE }, (_, col) => {
                  const x = col - GRID_CENTER
                  const y = row - GRID_CENTER
                  const village = villages.find((entry) => entry.x === x && entry.y === y)

                  return (
                    <div className="world-map-cell" key={`${row}-${col}`}>
                      {village ? (
                        <button
                          type="button"
                          className={`map-village ${village.type === 'home' ? 'home-village' : 'barbarian-village'} ${selectedVillageId === village.id ? 'selected' : ''}`}
                          onClick={() => onSelectVillage(village.id)}
                          title={village.name}
                        >
                          {village.type === 'home' ? '🏰' : '⚔️'}
                          <small>{village.type === 'home' ? 'DEIN' : 'FEIND'}</small>
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="world-map-side">
          <div className="map-details">
            <h3>{selectedVillage?.name ?? 'Keine Siedlung'}</h3>
            {selectedVillage ? (
              <>
                <p className="map-village-type">
                  {selectedVillage.type === 'home' ? 'Eigenes Dorf' : selectedVillage.type === 'player' ? 'Spielerdorf' : 'Barbarendorf'}
                </p>
                <p>Koordinaten: ({selectedVillage.x} | {selectedVillage.y})</p>
                <p>Punkte: {selectedVillage.points}</p>
                <p>{selectedVillage.description}</p>
              </>
            ) : (
              <p>Keine Auswahl getroffen.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

export default WorldMap
