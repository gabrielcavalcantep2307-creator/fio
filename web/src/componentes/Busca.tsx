import { useEffect, useMemo, useRef, useState } from 'react'
import type { Catalogo, ObraResumo } from '../tipos'
import { buscar } from '../lib/dados'
import { Capa } from './Capa'

// A busca que abre com `/`, de qualquer lugar.
//
// Numa biblioteca de mil e quinhentos títulos, ir até a estante e digitar é
// caminho longo demais para a pergunta mais frequente ("vocês têm X?").
// Uma tecla resolve, e quem não souber do atalho continua tendo a estante.

export function Busca({ catalogo, fechar }: { catalogo: Catalogo; fechar: () => void }) {
  const [termo, setTermo] = useState('')
  const [escolhido, setEscolhido] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => { campo.current?.focus() }, [])

  const achados = useMemo(
    () => (termo.trim().length < 2 ? [] : buscar(catalogo.obras, termo).slice(0, 8)),
    [catalogo.obras, termo],
  )

  useEffect(() => setEscolhido(0), [termo])

  const abrir = (o: ObraResumo) => { location.hash = `/obra/${o.id}`; fechar() }

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return fechar()
    if (e.key === 'ArrowDown') { e.preventDefault(); setEscolhido(i => Math.min(i + 1, achados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setEscolhido(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && achados[escolhido]) { e.preventDefault(); abrir(achados[escolhido]) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: 'color-mix(in srgb, var(--papel) 55%, transparent)', backdropFilter: 'blur(6px)' }}
      onClick={fechar}>
      <div className="w-full max-w-xl rounded-xl overflow-hidden"
        style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', boxShadow: '0 24px 60px -20px rgba(0,0,0,.5)' }}
        onClick={e => e.stopPropagation()}>
        <input
          ref={campo}
          value={termo}
          onChange={e => setTermo(e.target.value)}
          onKeyDown={tecla}
          placeholder="título, autor, assunto…"
          className="w-full px-5 py-4 text-lg outline-none bg-transparent"
          style={{ color: 'var(--tinta)', fontFamily: 'Literata, serif' }}
        />

        {achados.length > 0 && (
          <ul style={{ borderTop: '1px solid var(--linha)' }}>
            {achados.map((o, i) => (
              <li key={o.id}>
                <button
                  onClick={() => abrir(o)}
                  onMouseEnter={() => setEscolhido(i)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                  style={{ background: i === escolhido ? 'color-mix(in srgb, var(--acento) 12%, transparent)' : 'transparent' }}
                >
                  <span className="w-8 shrink-0 aspect-[2/3] overflow-hidden rounded-[2px]"><Capa obra={o} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm" style={{ fontFamily: 'Literata, serif' }}>{o.titulo}</span>
                    <span className="block truncate text-xs" style={{ color: 'var(--tinta-2)' }}>{o.autor}</span>
                  </span>
                  <span className="miudo ml-auto shrink-0">{o.trilho === 'A' ? 'ler' : 'ficha'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-4 py-2 miudo flex gap-4" style={{ borderTop: '1px solid var(--linha)' }}>
          <span>↑↓ escolher</span><span>↵ abrir</span><span>esc fechar</span>
        </div>
      </div>
    </div>
  )
}

/** Liga o atalho `/` (e ctrl+k, que é o que muita gente tenta primeiro). */
export function useAtalhoDeBusca(abrir: () => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      // não sequestrar a tecla de quem está escrevendo
      if (alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA' || alvo?.isContentEditable) return
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault()
        abrir()
      }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [abrir])
}
