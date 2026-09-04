import { useRef, useState, useEffect } from 'react'
import type { ObraResumo } from '../tipos'
import { Livrete } from './Capa'

// A prateleira: uma fila de capas que rola de lado.
//
// Por que rolar de lado e não uma grade: a grade obriga a escolher entre
// mostrar tudo (parede de capas, cansa) e mostrar pouco (some o acervo). A
// fila mostra oito e diz que há mais, sem ocupar a tela inteira — e é assim
// que se olha uma estante de verdade, de lado.

export function Prateleira({
  titulo, subtitulo, obras, verMais,
}: {
  titulo: string
  subtitulo?: string | null
  obras: ObraResumo[]
  verMais?: string
}) {
  const trilho = useRef<HTMLDivElement>(null)
  const [pode, setPode] = useState({ esquerda: false, direita: false })

  const medir = () => {
    const t = trilho.current
    if (!t) return
    setPode({
      esquerda: t.scrollLeft > 8,
      direita: t.scrollLeft + t.clientWidth < t.scrollWidth - 8,
    })
  }

  useEffect(() => {
    medir()
    const t = trilho.current
    if (!t) return
    const r = new ResizeObserver(medir)
    r.observe(t)
    return () => r.disconnect()
  }, [obras])

  if (!obras.length) return null

  const desliza = (dir: 1 | -1) => {
    const t = trilho.current
    if (!t) return
    t.scrollBy({ left: dir * Math.max(t.clientWidth * 0.8, 240), behavior: 'smooth' })
  }

  return (
    <section className="relative">
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <h2 style={{ fontFamily: 'Literata, serif' }} className="text-[1.05rem]">{titulo}</h2>
        {subtitulo && <span className="text-xs truncate" style={{ color: 'var(--tinta-2)' }}>{subtitulo}</span>}
        {verMais && (
          <a href={verMais} className="miudo ml-auto shrink-0 hover:opacity-70">ver tudo →</a>
        )}
      </div>

      <div className="relative">
        {/* setas: só aparecem quando há para onde ir, e só no ponteiro */}
        {(['esquerda', 'direita'] as const).map(lado => pode[lado] && (
          <button
            key={lado}
            onClick={() => desliza(lado === 'direita' ? 1 : -1)}
            aria-label={lado === 'direita' ? 'mais para a direita' : 'voltar'}
            className="hidden md:grid place-items-center absolute top-0 bottom-12 z-10 w-10 opacity-0 hover:opacity-100 transition-opacity"
            style={{
              [lado === 'direita' ? 'right' : 'left']: -8,
              background: `linear-gradient(to ${lado === 'direita' ? 'left' : 'right'}, var(--papel) 40%, transparent)`,
            }}
          >
            <span className="text-2xl leading-none" style={{ color: 'var(--tinta-2)' }}>
              {lado === 'direita' ? '›' : '‹'}
            </span>
          </button>
        ))}

        <div
          ref={trilho}
          onScroll={medir}
          className="flex gap-3 overflow-x-auto pb-1 snap-x"
          style={{ scrollbarWidth: 'none' }}
        >
          {obras.map(o => (
            <div key={o.id} className="shrink-0 snap-start w-[7.5rem] sm:w-[8.5rem]">
              <Livrete obra={o} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Grade({ obras }: { obras: ObraResumo[] }) {
  return (
    <div className="grid gap-x-4 gap-y-7 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {obras.map(o => <Livrete key={o.id} obra={o} />)}
    </div>
  )
}
