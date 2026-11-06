import { useEffect, useMemo, useRef, useState } from 'react'
import type { BuildingCode, Village } from '../types.ts'
import { paintVillage } from './villagePainter.ts'
import { BUILDING_LABEL, BUILDING_ORDER, BUILDING_SPOT, SCENE_H, SCENE_W } from './villageLayout.ts'
import './village.css'

export type VillageSceneProps = {
  village: Pick<Village, 'buildings' | 'building_quotes' | 'construction_queue' | 'resources'>
  upgrading: BuildingCode | null
  onUpgrade: (code: BuildingCode) => void
}

const MAX_LEVEL = 20

function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : m > 0 ? `${m} min ${s % 60} s` : `${s} s`
}

/** Grafische Dorfansicht: zeigt die echten Gebäudestufen und Bauaufträge des Dorfs, Ausbau über denselben Handler wie die Liste. */
export default function VillageScene({ village, upgrading, onUpgrade }: VillageSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<BuildingCode | null>(null)
  const [paintError, setPaintError] = useState('')
  const constructing = useMemo(() => new Set(village.construction_queue.map((job) => job.building_code)), [village.construction_queue])

  useEffect(() => {
    if (!canvasRef.current) return
    try {
      paintVillage(canvasRef.current, { levels: village.buildings, building: constructing, selected })
      setPaintError('')
    } catch (error) {
      setPaintError(error instanceof Error ? error.message : 'Zeichnen fehlgeschlagen')
    }
  }, [village.buildings, constructing, selected])

  const code = selected
  const level = code ? village.buildings[code] ?? 0 : 0
  const quote = code ? village.building_quotes[code] : undefined
  const queuedJob = code ? village.construction_queue.find((job) => job.building_code === code) : undefined
  const affordable = !!quote && quote.costs.wood <= village.resources.wood && quote.costs.clay <= village.resources.clay && quote.costs.iron <= village.resources.iron

  return (
    <section className="village-scene" aria-label="Dorfansicht">
      <div className="village-stage">
        <canvas ref={canvasRef} className="village-canvas" aria-hidden="true" />
        {BUILDING_ORDER.map((id) => {
          const spot = BUILDING_SPOT[id]
          const lv = village.buildings[id] ?? 0
          return (
            <button
              key={id} type="button"
              className={`village-hit${selected === id ? ' is-selected' : ''}${constructing.has(id) ? ' is-building' : ''}`}
              style={{ left: `${((spot.x - 60) / SCENE_W) * 100}%`, top: `${((spot.y - 80) / SCENE_H) * 100}%`, width: `${(120 / SCENE_W) * 100}%`, height: `${(110 / SCENE_H) * 100}%` }}
              onClick={() => setSelected(id)}
              aria-pressed={selected === id}
              aria-label={`${BUILDING_LABEL[id]}, Stufe ${lv}${constructing.has(id) ? ', im Bau' : ''}`}
            >
              <span className="village-tag">{BUILDING_LABEL[id]} <b>{lv}</b></span>
            </button>
          )
        })}
      </div>
      {paintError && <p className="village-error" role="alert">Die Dorfgrafik konnte nicht gezeichnet werden ({paintError}). Die Gebäudeliste unten funktioniert weiterhin.</p>}
      <div className="village-detail" aria-live="polite">
        {code ? (
          <>
            <strong>{BUILDING_LABEL[code]} · Stufe {level}</strong>
            {queuedJob && <span>Im Bau: Stufe {queuedJob.target_level}</span>}
            {quote && <span>Nächste Stufe {quote.target_level}: H {quote.costs.wood} · L {quote.costs.clay} · E {quote.costs.iron} · {duration(quote.build_seconds)}</span>}
            <button
              type="button" className="upgrade-button" onClick={() => onUpgrade(code)}
              disabled={!quote || !affordable || !!upgrading || quote.target_level > MAX_LEVEL}
            >{upgrading === code ? 'Wird gebaut' : quote && quote.target_level > MAX_LEVEL ? 'Maximal' : 'Ausbauen'}</button>
          </>
        ) : <span>Wähle ein Gebäude, um Stufe, Kosten und Bauzeit zu sehen.</span>}
      </div>
    </section>
  )
}
