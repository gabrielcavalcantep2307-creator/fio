import { useMemo, useState } from 'react'
import type { Catalogo, ObraResumo } from '../tipos'
import { duracao } from '../lib/formato'
import { Capa } from './Capa'

// "Não sei o que ler."
//
// É a pergunta mais comum de quem abre uma biblioteca, e a que catálogo
// nenhum responde: filtrar por gênero exige já saber o que se quer. Aqui se
// escolhe pelo ESTADO, não pela etiqueta — "tenho meia hora", "quero pensar",
// "quero uma história" — e o sistema traduz isso em critério de verdade
// (extensão, tema, densidade) e mostra o que achou.
//
// O botão de sorteio existe pelo mesmo motivo: às vezes a melhor recomendação
// é a que ninguém pediu.

type Humor = {
  chave: string
  rotulo: string
  explica: string
  filtro: (o: ObraResumo) => boolean
}

const HUMORES: Humor[] = [
  {
    chave: 'meia-hora',
    rotulo: 'tenho meia hora',
    explica: 'Obras inteiras que cabem numa sentada.',
    filtro: o => !!o.minutos && o.minutos <= 75,
  },
  {
    chave: 'historia',
    rotulo: 'quero uma história',
    explica: 'Romance e conto — gente, enredo, começo e fim.',
    filtro: o => o.temas.some(t => ['Romance', 'Contos', 'Aventura'].includes(t)),
  },
  {
    chave: 'pensar',
    rotulo: 'quero pensar',
    explica: 'Filosofia, ideias, e as perguntas que não fecham.',
    filtro: o => o.temas.some(t => ['Filosofia', 'Epistemologia', 'Pensamento crítico'].includes(t)),
  },
  {
    chave: 'poder',
    rotulo: 'quero entender o poder',
    explica: 'Como se manda, como se obedece, e o que sustenta os dois.',
    filtro: o => o.temas.some(t => ['Política e sociedade', 'Sociologia', 'Distopia', 'Geopolítica', 'Estratégia'].includes(t)),
  },
  {
    chave: 'gente',
    rotulo: 'quero entender gente',
    explica: 'Psicologia, comportamento, e por que fazemos o que fazemos.',
    filtro: o => o.temas.some(t => ['Psicologia', 'Biografia e memórias'].includes(t)),
  },
  {
    chave: 'brasil',
    rotulo: 'quero ler o Brasil',
    explica: 'O país contado por quem o escreveu.',
    filtro: o => o.temas.includes('História') || /Machado|Alencar|Azevedo|Nabuco|Gonçalves Dias/.test(o.autor),
  },
  {
    chave: 'pesada',
    rotulo: 'quero algo pesado',
    explica: 'Longo, denso, e que cobra atenção.',
    filtro: o => !!o.minutos && o.minutos >= 400,
  },
]

export function Descobrir({ catalogo }: { catalogo: Catalogo }) {
  const [humor, setHumor] = useState<Humor | null>(null)
  const [semente, setSemente] = useState(0)

  const legiveis = useMemo(() => catalogo.obras.filter(o => o.trilho === 'A'), [catalogo.obras])

  const achados = useMemo(() => {
    if (!humor) return []
    const lista = legiveis.filter(humor.filtro)
    // embaralha de um jeito estável dentro da mesma escolha, para "de novo"
    // devolver outra coisa sem virar loteria a cada render
    return [...lista].sort((a, b) => ((a.id * 9301 + semente) % 233280) - ((b.id * 9301 + semente) % 233280)).slice(0, 6)
  }, [humor, legiveis, semente])

  const sortear = () => {
    const o = legiveis[Math.floor(Math.random() * legiveis.length)]
    if (o) location.hash = `/obra/${o.id}`
  }

  return (
    <section className="rounded-xl p-5 sm:p-7" style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)' }}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 style={{ fontFamily: 'Literata, serif' }} className="text-[1.05rem]">Não sabe o que ler?</h2>
        <button onClick={sortear} className="miudo ml-auto hover:opacity-70">sorteie um →</button>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {HUMORES.map(h => (
          <button
            key={h.chave}
            onClick={() => { setHumor(humor?.chave === h.chave ? null : h); setSemente(s => s + 1) }}
            className="text-sm px-3.5 py-1.5 rounded-full transition-colors"
            style={{
              background: humor?.chave === h.chave ? 'var(--acento)' : 'transparent',
              color: humor?.chave === h.chave ? '#fff' : 'var(--tinta)',
              border: '1px solid var(--linha)',
            }}
          >{h.rotulo}</button>
        ))}
      </div>

      {humor && (
        <div className="mt-6">
          <p className="text-sm mb-4" style={{ color: 'var(--tinta-2)' }}>
            {humor.explica}
            {achados.length >= 6 && (
              <button onClick={() => setSemente(s => s + 1)} className="ml-3 underline hover:opacity-70">
                mostrar outros
              </button>
            )}
          </p>
          {achados.length === 0 ? (
            <p className="miudo py-4">o acervo ainda não tem nada assim para ler aqui.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {achados.map(o => (
                <a key={o.id} href={`#/obra/${o.id}`} className="group block">
                  <div className="aspect-[2/3] rounded-[3px] overflow-hidden transition-transform group-hover:-translate-y-1"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,.18), 0 8px 20px -12px rgba(0,0,0,.5)' }}>
                    <Capa obra={o} />
                  </div>
                  <div className="text-[0.78rem] mt-2 line-clamp-2 leading-snug" style={{ fontFamily: 'Literata, serif' }}>
                    {o.titulo}
                  </div>
                  <div className="miudo mt-0.5">{duracao(o.minutos)}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
