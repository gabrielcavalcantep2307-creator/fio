import type { ObraResumo } from '../tipos'
import { Capa } from './Capa'

// O Top 10.
//
// Por que ele existe separado da prateleira comum: uma fila de capas iguais
// diz "há mais coisas aqui". Uma lista NUMERADA diz outra coisa — "estas dez
// vêm antes das outras, e nesta ordem". É informação diferente, e por isso
// merece forma diferente.
//
// O numeral é grande e vazado, encostando na capa. É o truque velho da
// diagramação de revista: o número entra na composição em vez de ficar num
// cantinho, e a fileira ganha ritmo — que é o que faltava numa página que
// era só retângulo atrás de retângulo.

export function Top10({
  titulo, subtitulo, obras, nota,
}: {
  titulo: string
  subtitulo?: string
  obras: ObraResumo[]
  nota?: string
}) {
  if (obras.length < 3) return null

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4 px-1 flex-wrap">
        <h2 style={{ fontFamily: 'Literata, serif' }} className="text-[1.15rem]">{titulo}</h2>
        {subtitulo && <span className="text-xs" style={{ color: 'var(--tinta-2)' }}>{subtitulo}</span>}
        {nota && (
          <span className="text-[0.68rem] italic ml-auto" style={{ color: 'var(--tinta-2)' }}>{nota}</span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {obras.slice(0, 10).map((o, i) => (
          <a key={o.id} href={`#/obra/${o.id}`}
            className="group shrink-0 flex items-end"
            style={{ width: i === 9 ? '13.5rem' : '11.5rem' }}>
            {/* o numeral, vazado e encostado */}
            <span
              aria-hidden
              className="select-none leading-[0.72] shrink-0"
              style={{
                fontFamily: 'Literata, serif',
                fontSize: '5.5rem',
                marginRight: '-1.1rem',
                color: 'transparent',
                WebkitTextStroke: `1.5px var(--tinta-2)`,
                opacity: 0.55,
              }}
            >{i + 1}</span>

            <span className="block w-[7.5rem] shrink-0">
              <span className="block aspect-[2/3] overflow-hidden rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,.2), 0 10px 24px -14px rgba(0,0,0,.6)' }}>
                <Capa obra={o} />
              </span>
              <span className="block mt-2 text-[0.8rem] leading-snug line-clamp-2"
                style={{ fontFamily: 'Literata, serif' }}>{o.titulo}</span>
              <span className="block text-[0.68rem] truncate" style={{ color: 'var(--tinta-2)' }}>
                {o.autor}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
