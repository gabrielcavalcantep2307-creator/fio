import { useEffect, useMemo, useState } from 'react'
import type { Catalogo, ObraResumo } from '../tipos'
import { useEstante } from '../lib/estante'
import * as conta from '../lib/conta'
import { duracao } from '../lib/formato'
import { Capa } from '../componentes/Capa'
import { Prateleira } from '../componentes/Prateleira'
import { Top10 } from '../componentes/Top10'
import { Descobrir } from '../componentes/Descobrir'

// A home tem uma pergunta só: **o que eu leio agora?**
//
// Por isso ela é uma sequência, não um painel: a obra em destaque com o motivo
// escrito, o que você deixou aberto, o que está sendo lido, e então
// prateleiras — cada uma com um critério que dá para explicar em quatro
// palavras. Se um bloco não responde àquela pergunta, ele não está aqui.
//
// A ordem também não é acaso. **Curadoria antes de filtro:** "Todo mundo está
// lendo" vem antes de "Romance", porque escolha de gente vale mais que
// agrupamento de metadado — e é o que separa uma biblioteca de uma planilha.

const PRATELEIRAS: { tema: string; frase: string }[] = [
  { tema: 'Romance', frase: 'histórias longas, gente que muda' },
  { tema: 'Filosofia', frase: 'as perguntas sem resposta pronta' },
  { tema: 'Distopia', frase: 'o mundo organizado de um jeito que assusta' },
  { tema: 'Direito', frase: 'a norma, e o argumento sobre ela' },
  { tema: 'Política e sociedade', frase: 'como o poder se organiza' },
  { tema: 'Contos', frase: 'uma história por noite' },
  { tema: 'História', frase: 'o que aconteceu, por quem estudou' },
  { tema: 'Psicologia', frase: 'por que as pessoas fazem o que fazem' },
  { tema: 'Mistério e policial', frase: 'alguém escondeu alguma coisa' },
  { tema: 'Ficção científica', frase: 'o futuro para falar do presente' },
  { tema: 'Poesia', frase: 'verso' },
  { tema: 'Biografia e memórias', frase: 'uma vida contada' },
  { tema: 'Crônica e ensaio', frase: 'texto curto, opinião assumida' },
  { tema: 'Teatro', frase: 'escrito para ser dito em voz alta' },
]

export function Inicio({ catalogo }: { catalogo: Catalogo }) {
  const { progresso, estado } = useEstante()
  const [populares, setPopulares] = useState<conta.Popular[] | null>(null)

  useEffect(() => {
    conta.populares()
      .then(p => setPopulares(p.mes.length >= 3 ? p.mes : []))
      .catch(() => setPopulares([]))
  }, [])

  const porId = useMemo(() => new Map(catalogo.obras.map(o => [o.id, o])), [catalogo.obras])
  const porTema = useMemo(() => {
    const m = new Map<string, ObraResumo[]>()
    for (const o of catalogo.obras) {
      for (const t of o.temas) {
        if (!m.has(t)) m.set(t, [])
        m.get(t)!.push(o)
      }
    }
    // dentro da prateleira: o que dá para ler primeiro, e o que tem ficha
    // escrita antes do que não tem
    for (const lista of m.values()) {
      lista.sort((a, b) =>
        (a.trilho === b.trilho ? 0 : a.trilho === 'A' ? -1 : 1)
        || ((b.chamada ? 1 : 0) - (a.chamada ? 1 : 0)))
    }
    return m
  }, [catalogo.obras])

  const lendo = Object.entries(progresso)
    .map(([id, p]) => ({ obra: porId.get(Number(id)), p }))
    .filter((x): x is { obra: ObraResumo; p: (typeof x)['p'] } => !!x.obra)
    .filter(x => estado[x.obra.id] !== 'concluido')
    .sort((a, b) => b.p.mudouEm - a.p.mudouEm)

  const legiveis = catalogo.obras.filter(o => o.trilho === 'A')

  // O destaque gira entre as obras que TÊM ficha escrita — as únicas que
  // sustentam um destaque, porque têm o que dizer. Gira por dia, e não a cada
  // carga: quem abre duas vezes na mesma tarde encontra a mesma coisa.
  const curadas = legiveis.filter(o => o.chamada)
  const dia = Math.floor(Date.now() / 86400000)
  const destaque = curadas.length ? curadas[dia % curadas.length] : legiveis[0]

  const colecao = (nome: string) => {
    const c = catalogo.colecoes.find(x => x.nome === nome)
    return c ? c.obras.map(id => porId.get(id)).filter((o): o is ObraResumo => !!o) : []
  }

  // "O que está sendo lido" é MEDIDO, não escrito: cada abertura de livro
  // conta uma linha anônima no servidor. Enquanto não houver leitura
  // suficiente, cai na curadoria — e a tela diz qual dos dois está mostrando.
  const maisLidos = populares?.length
    ? populares.map(p => porId.get(p.obra_id)).filter((o): o is ObraResumo => !!o)
    : colecao('Todo mundo está lendo')
  const medido = !!populares?.length

  const numaTarde = legiveis
    .filter(o => o.minutos && o.minutos >= 45 && o.minutos <= 200 && o.id !== destaque?.id)
    .sort((a, b) => (a.minutos ?? 0) - (b.minutos ?? 0))
    .slice(0, 18)

  const outrasColecoes = catalogo.colecoes.filter(
    c => c.nome !== 'Todo mundo está lendo' && !c.nome.startsWith('Top 10'))

  return (
    <div className="flex flex-col gap-14">
      {destaque && <Destaque obra={destaque} quantas={curadas.length} />}

      {lendo.length > 0 && (
        <Prateleira
          titulo="Você parou aqui"
          subtitulo={lendo.length === 1 ? undefined : `${lendo.length} livros abertos`}
          obras={lendo.slice(0, 12).map(x => x.obra)}
        />
      )}

      <Top10
        titulo="Top 10 — o que está sendo lido"
        subtitulo={medido ? 'nos últimos 30 dias' : undefined}
        nota={medido
          ? 'contagem anônima: a obra e o instante, nada mais'
          : 'ainda sem leitura suficiente para medir — por enquanto, curadoria'}
        obras={maisLidos}
      />

      <Descobrir catalogo={catalogo} />

      <Top10
        titulo="Top 10 — Política no Brasil"
        subtitulo="para entender por que o país funciona como funciona"
        obras={colecao('Top 10 — Política no Brasil')}
      />

      <Prateleira
        titulo="Cabe numa tarde"
        subtitulo="livros inteiros, de uma a três horas"
        obras={numaTarde}
        verMais="#/estante?d=1a3h&so=ler"
      />

      {outrasColecoes.map(c => {
        const obras = c.obras.map(id => porId.get(id)).filter((o): o is ObraResumo => !!o)
        if (obras.length < 3) return null
        return <Prateleira key={c.nome} titulo={c.nome} subtitulo={c.resumo ?? undefined} obras={obras} />
      })}

      {PRATELEIRAS.map(({ tema, frase }) => {
        const obras = porTema.get(tema) ?? []
        if (obras.length < 4) return null
        return (
          <Prateleira key={tema} titulo={tema} subtitulo={frase} obras={obras.slice(0, 18)}
            verMais={`#/tema/${encodeURIComponent(tema)}`} />
        )
      })}

      <Numeros catalogo={catalogo} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

function Destaque({ obra, quantas }: { obra: ObraResumo; quantas: number }) {
  return (
    <section
      className="rounded-xl overflow-hidden relative"
      style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)' }}
    >
      {/* Um brilho fraco atrás da capa. Não é enfeite: sem ele o bloco é um
          retângulo chapado, e a página inteira vira uma tabela de retângulos. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(58% 88% at 13% 42%, color-mix(in srgb, var(--acento) 14%, transparent), transparent 70%)',
      }} />

      <div className="relative grid sm:grid-cols-[minmax(0,12rem)_1fr] gap-6 sm:gap-10 p-6 sm:p-10">
        <a href={`#/obra/${obra.id}`} className="block w-36 sm:w-full mx-auto">
          <div className="aspect-[2/3] rounded-[3px] overflow-hidden"
            style={{ boxShadow: '0 2px 6px rgba(0,0,0,.25), 0 26px 50px -24px rgba(0,0,0,.7)' }}>
            <Capa obra={obra} tamanho="grande" />
          </div>
        </a>

        <div className="flex flex-col justify-center">
          <div className="miudo">
            para começar{quantas > 1 && <span className="opacity-60"> · muda todo dia</span>}
          </div>
          <h1 className="text-3xl sm:text-[2.7rem] leading-[1.06] mt-3" style={{ fontFamily: 'Literata, serif' }}>
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

/** O pé da home: o que o acervo é, em número, sem discurso. */
function Numeros({ catalogo }: { catalogo: Catalogo }) {
  const legiveis = catalogo.obras.filter(o => o.trilho === 'A').length
  const numeros: [string, string][] = [
    [String(catalogo.obras.length), 'obras no catálogo'],
    [String(legiveis), 'para ler inteiras, aqui'],
    [String(catalogo.temas.length), 'assuntos'],
    [String(catalogo.autores.length), 'autores'],
  ]
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-8"
      style={{ borderTop: '1px solid var(--linha)' }}>
      {numeros.map(([n, o]) => (
        <div key={o}>
          <div className="text-3xl tabular-nums" style={{ fontFamily: 'Literata, serif' }}>{n}</div>
          <div className="miudo mt-1">{o}</div>
        </div>
      ))}
    </section>
  )
}
