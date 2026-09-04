import { useMemo } from 'react'
import type { Catalogo, ObraResumo } from '../tipos'
import { useEstante } from '../lib/estante'
import { duracao } from '../lib/formato'
import { Capa } from '../componentes/Capa'
import { Prateleira } from '../componentes/Prateleira'
import { Descobrir } from '../componentes/Descobrir'

// A home tem uma pergunta só: **o que eu leio agora?**
//
// Por isso ela é uma sequência, não um painel: uma obra em destaque com o
// motivo escrito, o que você deixou aberto, e então prateleiras — cada uma
// com um critério que dá para explicar em quatro palavras. Nada de "informação
// solta jogada": se um bloco não responde àquela pergunta, ele não está aqui.

const PRATELEIRAS: { tema: string; frase: string }[] = [
  { tema: 'Romance', frase: 'histórias longas, gente que muda' },
  { tema: 'Distopia', frase: 'o mundo organizado de um jeito que assusta' },
  { tema: 'Filosofia', frase: 'as perguntas sem resposta pronta' },
  { tema: 'Política e sociedade', frase: 'como o poder se organiza' },
  { tema: 'Contos', frase: 'uma história por noite' },
  { tema: 'História', frase: 'o que aconteceu, por quem estudou' },
  { tema: 'Psicologia', frase: 'por que as pessoas fazem o que fazem' },
  { tema: 'Direito', frase: 'a norma, e o argumento sobre ela' },
  { tema: 'Mistério e policial', frase: 'alguém escondeu alguma coisa' },
  { tema: 'Ficção científica', frase: 'o futuro para falar do presente' },
  { tema: 'Poesia', frase: 'verso' },
  { tema: 'Biografia e memórias', frase: 'uma vida contada' },
]

export function Inicio({ catalogo }: { catalogo: Catalogo }) {
  const { progresso, estado } = useEstante()
  const porId = useMemo(() => new Map(catalogo.obras.map(o => [o.id, o])), [catalogo.obras])
  const porTema = useMemo(() => {
    const m = new Map<string, ObraResumo[]>()
    for (const o of catalogo.obras) {
      for (const t of o.temas) {
        if (!m.has(t)) m.set(t, [])
        m.get(t)!.push(o)
      }
    }
    // dentro da prateleira, quem dá para ler vem primeiro
    for (const lista of m.values()) lista.sort((a, b) => (a.trilho === b.trilho ? 0 : a.trilho === 'A' ? -1 : 1))
    return m
  }, [catalogo.obras])

  const lendo = Object.entries(progresso)
    .map(([id, p]) => ({ obra: porId.get(Number(id)), p }))
    .filter((x): x is { obra: ObraResumo; p: (typeof x)['p'] } => !!x.obra)
    .filter(x => estado[x.obra.id] !== 'concluido')
    .sort((a, b) => b.p.mudouEm - a.p.mudouEm)

  const legiveis = catalogo.obras.filter(o => o.trilho === 'A')

  // O destaque gira entre as obras que TÊM ficha escrita — as únicas que
  // conseguem sustentar um destaque, porque têm o que dizer. Gira por dia, e
  // não a cada carga: quem abre o site duas vezes na mesma tarde encontra a
  // mesma coisa, e quem volta amanhã encontra outra.
  const curadas = legiveis.filter(o => o.chamada)
  const dia = Math.floor(Date.now() / 86400000)
  const destaque = curadas.length ? curadas[dia % curadas.length] : legiveis[0]

  const numaTarde = legiveis
    .filter(o => o.minutos && o.minutos >= 45 && o.minutos <= 200 && o.id !== destaque?.id)
    .sort((a, b) => (a.minutos ?? 0) - (b.minutos ?? 0))
    .slice(0, 18)

  const machado = catalogo.autores.find(a => a.nome.includes('Machado de Assis'))
  const doMachado = machado ? catalogo.obras.filter(o => o.autorId === machado.id) : []

  return (
    <div className="flex flex-col gap-12">
      {destaque && <Destaque obra={destaque} quantas={curadas.length} />}

      {lendo.length > 0 && (
        <Prateleira
          titulo="Você parou aqui"
          subtitulo={lendo.length === 1 ? undefined : `${lendo.length} livros abertos`}
          obras={lendo.slice(0, 12).map(x => x.obra)}
        />
      )}

      <Descobrir catalogo={catalogo} />

      <Prateleira
        titulo="Cabe numa tarde"
        subtitulo="livros inteiros, de uma a três horas"
        obras={numaTarde}
        verMais="#/estante"
      />

      {doMachado.length > 0 && (
        <Prateleira
          titulo="Machado de Assis, inteiro"
          subtitulo="os romances todos, do primeiro ao último"
          obras={doMachado}
          verMais={`#/autor/${machado!.id}`}
        />
      )}

      {PRATELEIRAS.map(({ tema, frase }) => {
        const obras = porTema.get(tema) ?? []
        if (obras.length < 4) return null
        return (
          <Prateleira
            key={tema}
            titulo={tema}
            subtitulo={frase}
            obras={obras.slice(0, 18)}
            verMais={`#/tema/${encodeURIComponent(tema)}`}
          />
        )
      })}
    </div>
  )
}

function Destaque({ obra, quantas }: { obra: ObraResumo; quantas: number }) {
  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)' }}
    >
      <div className="grid sm:grid-cols-[minmax(0,11rem)_1fr] gap-6 sm:gap-8 p-6 sm:p-9">
        <a href={`#/obra/${obra.id}`} className="block w-32 sm:w-full mx-auto">
          <div className="aspect-[2/3] rounded-[3px] overflow-hidden"
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,.2), 0 18px 36px -20px rgba(0,0,0,.6)' }}>
            <Capa obra={obra} tamanho="grande" />
          </div>
        </a>

        <div className="flex flex-col justify-center">
          <div className="miudo">
            para começar{quantas > 1 && <span className="opacity-60"> · muda todo dia</span>}
          </div>
          <h1 className="text-3xl sm:text-[2.6rem] leading-[1.08] mt-3" style={{ fontFamily: 'Literata, serif' }}>
            {obra.titulo}
          </h1>
          <p className="mt-1.5" style={{ color: 'var(--tinta-2)' }}>{obra.autor}</p>

          {obra.chamada && (
            <p className="mt-5 max-w-prose text-lg leading-relaxed" style={{ fontFamily: 'Literata, serif' }}>
              {obra.chamada}
            </p>
          )}

          <div className="flex flex-wrap gap-x-7 gap-y-2 mt-6 miudo">
            {obra.temas.slice(0, 3).map(t => (
              <a key={t} href={`#/tema/${encodeURIComponent(t)}`} className="hover:opacity-70">{t}</a>
            ))}
            {duracao(obra.minutos) && <span>{duracao(obra.minutos)}</span>}
          </div>

          <div className="flex flex-wrap gap-3 mt-7">
            <a href={`#/ler/${obra.id}`} className="px-5 py-2.5 rounded text-sm"
              style={{ background: 'var(--acento)', color: '#fff' }}>Começar a ler</a>
            <a href={`#/obra/${obra.id}`} className="px-5 py-2.5 rounded text-sm"
              style={{ border: '1px solid var(--linha)' }}>Sobre a obra</a>
          </div>
        </div>
      </div>
    </section>
  )
}
