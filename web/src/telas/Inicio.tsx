import type { Catalogo, ObraResumo } from '../tipos'
import { useEstante } from '../lib/estante'
import { duracao } from '../lib/formato'

// A home não é uma vitrine de capas. A pergunta que ela responde é
// "o que eu leio agora, e por quê" — nessa ordem.

export function Inicio({ catalogo }: { catalogo: Catalogo }) {
  const { progresso, estado } = useEstante()
  const porId = new Map(catalogo.obras.map(o => [o.id, o]))

  const lendo = Object.entries(progresso)
    .map(([id, p]) => ({ obra: porId.get(Number(id)), p }))
    .filter((x): x is { obra: ObraResumo; p: typeof x.p } => !!x.obra)
    .filter(x => estado[x.obra.id] !== 'concluido')
    .sort((a, b) => b.p.mudouEm - a.p.mudouEm)

  const legiveis = catalogo.obras.filter(o => o.trilho === 'A')
  const destaque = escolherDestaque(legiveis)
  // "curto" aqui não é "pequeno": é um livro inteiro que cabe numa tarde.
  // Um soneto de três páginas não é uma leitura — é um cartão-postal.
  const curtos = legiveis
    .filter(o => o.minutos && o.minutos >= 45 && o.minutos <= 240 && o.id !== destaque?.id)
    .sort((a, b) => (a.minutos ?? 0) - (b.minutos ?? 0))
    .slice(0, 6)

  return (
    <div className="flex flex-col gap-16">
      {lendo.length > 0 && (
        <section>
          <h2 className="miudo mb-4">continue lendo</h2>
          <div className="flex flex-col gap-2">
            {lendo.slice(0, 3).map(({ obra, p }) => (
              <a key={obra.id} href={`#/ler/${obra.id}`}
                className="card rounded-lg px-4 py-3 flex items-baseline gap-3 hover:opacity-80">
                <span style={{ fontFamily: 'Literata, serif' }}>{obra.titulo}</span>
                <span className="text-xs" style={{ color: 'var(--tinta-2)' }}>{obra.autor}</span>
                <span className="ml-auto miudo">capítulo {p.capitulo}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {destaque && <Destaque obra={destaque} />}

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="miudo">curtos, e que ficam</h2>
          <a href="#/acervo" className="miudo hover:opacity-70">ver o acervo →</a>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {curtos.map(o => <Cartao key={o.id} obra={o} />)}
        </div>
      </section>

      <section className="max-w-prose">
        <h2 className="miudo mb-4">o que é isto</h2>
        <p className="leading-relaxed" style={{ fontFamily: 'Literata, serif' }}>
          Uma biblioteca em português com {catalogo.obras.length} obras — {legiveis.length}{' '}
          para ler aqui dentro, inteiras, sem cadastro e sem cobrança. O resto está
          no catálogo com o caminho para encontrá-lo.
        </p>
        <p className="mt-4 leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
          A ideia não é juntar arquivos. É que um livro leve ao próximo: pelo tema,
          pelo autor, pela ideia que ele contesta.
        </p>
      </section>
    </div>
  )
}

/** O destaque é a obra mais curta entre as grandes — a que se termina. */
function escolherDestaque(legiveis: ObraResumo[]) {
  const preferidas = ['Dom Casmurro', 'O Cortiço', 'Iracema', 'Memorias Posthumas']
  for (const p of preferidas) {
    const achada = legiveis.find(o => o.titulo.includes(p))
    if (achada) return achada
  }
  return legiveis[0]
}

function Destaque({ obra }: { obra: ObraResumo }) {
  return (
    <section className="card rounded-xl p-7 sm:p-10">
      <div className="miudo mb-5">em destaque</div>
      <h1 className="text-3xl sm:text-4xl leading-tight" style={{ fontFamily: 'Literata, serif' }}>
        {obra.titulo}
      </h1>
      <p className="mt-2" style={{ color: 'var(--tinta-2)' }}>{obra.autor}</p>

      <div className="flex flex-wrap gap-x-8 gap-y-2 mt-7 miudo">
        {obra.paginas && <span>{obra.paginas} páginas</span>}
        {duracao(obra.minutos) && <span>{duracao(obra.minutos)} de leitura</span>}
        {obra.temas.slice(0, 3).map(t => <span key={t}>{t}</span>)}
      </div>

      <div className="flex gap-3 mt-8">
        <a href={`#/ler/${obra.id}`} className="px-5 py-2.5 rounded text-sm"
          style={{ background: 'var(--acento)', color: '#fff' }}>Começar a ler</a>
        <a href={`#/obra/${obra.id}`} className="px-5 py-2.5 rounded text-sm"
          style={{ border: '1px solid var(--linha)' }}>Sobre a obra</a>
      </div>
    </section>
  )
}

export function Cartao({ obra }: { obra: ObraResumo }) {
  return (
    <a href={`#/obra/${obra.id}`}
      className="card rounded-lg p-4 flex flex-col gap-1 hover:opacity-80 transition-opacity">
      <span className="leading-snug" style={{ fontFamily: 'Literata, serif' }}>{obra.titulo}</span>
      <span className="text-xs" style={{ color: 'var(--tinta-2)' }}>{obra.autor}</span>
      <span className="miudo mt-2">
        {obra.trilho === 'A'
          ? duracao(obra.minutos) ?? 'ler aqui'
          : 'só referência'}
      </span>
    </a>
  )
}
