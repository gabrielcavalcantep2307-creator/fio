import type { Catalogo, Livro } from '../tipos'
import { definirEstado, useEstante } from '../lib/estante'
import { Cartao } from './Inicio'
import { duracao } from '../lib/formato'

// A página da obra funciona SEM o arquivo. É a decisão que sustenta o
// catálogo inteiro: quando não podemos servir o texto, a página continua
// inteira — só o botão muda.

export function Obra({ id, catalogo, livro }: { id: number; catalogo: Catalogo; livro: Livro | null }) {
  const { progresso, estado, marcacoes } = useEstante()
  const obra = catalogo.obras.find(o => o.id === id)
  if (!obra) return <p className="miudo">não achei esta obra.</p>

  const p = progresso[id]
  const minhas = marcacoes.filter(m => m.obraId === id)
  const doAutor = catalogo.obras.filter(o => o.autorId === obra.autorId && o.id !== id).slice(0, 6)

  return (
    <article className="flex flex-col gap-12">
      <header>
        <a href="#/acervo" className="miudo hover:opacity-70">← acervo</a>
        <h1 className="text-3xl sm:text-4xl leading-tight mt-5" style={{ fontFamily: 'Literata, serif' }}>
          {obra.titulo}
        </h1>
        <p className="mt-2 text-lg" style={{ color: 'var(--tinta-2)' }}>{obra.autor}</p>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-6 miudo">
          {obra.ano && <Dado rotulo="ano">{obra.ano}</Dado>}
          {obra.paginas && <Dado rotulo="extensão">{obra.paginas} páginas</Dado>}
          {duracao(obra.minutos) && <Dado rotulo="leitura">{duracao(obra.minutos)}</Dado>}
          {livro && <Dado rotulo="capítulos">{livro.capitulos.length}</Dado>}
        </dl>

        <div className="flex flex-wrap gap-3 mt-8">
          {obra.trilho === 'A' ? (
            <a href={`#/ler/${id}`} className="px-5 py-2.5 rounded text-sm"
              style={{ background: 'var(--acento)', color: '#fff' }}>
              {p ? `Continuar do capítulo ${p.capitulo}` : 'Começar a ler'}
            </a>
          ) : (
            <span className="px-5 py-2.5 rounded text-sm" style={{ border: '1px solid var(--linha)', color: 'var(--tinta-2)' }}>
              Não dá para ler aqui
            </span>
          )}
          <button
            onClick={() => definirEstado(id, estado[id] === 'quero_ler' ? 'lendo' : 'quero_ler')}
            className="px-5 py-2.5 rounded text-sm" style={{ border: '1px solid var(--linha)' }}>
            {estado[id] === 'quero_ler' ? 'Está na sua lista' : 'Quero ler'}
          </button>
        </div>
      </header>

      {/* Por que dá (ou não dá) para ler aqui. Sem enrolação e sem "indisponível". */}
      <section className="card rounded-lg p-5">
        <div className="miudo mb-3">direito autoral, sem enrolação</div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
          {obra.trilho === 'A'
            ? livro?.direito ?? 'Domínio público no Brasil, verificado a partir da morte de quem assina a obra.'
            : obra.impedimento ??
              'O estado de direito desta obra não está confirmado. Enquanto não estiver, ela fica no catálogo mas não é servida — errar para este lado é barato; para o outro, não.'}
        </p>
        {livro?.fonteUrl && (
          <p className="text-xs mt-3">
            <a href={livro.fonteUrl} target="_blank" rel="noreferrer noopener"
              className="underline" style={{ color: 'var(--tinta-2)' }}>
              origem do texto: {livro.fonte}
            </a>
          </p>
        )}
      </section>

      {minhas.length > 0 && (
        <section>
          <h2 className="miudo mb-4">o que você marcou ({minhas.length})</h2>
          <div className="flex flex-col gap-3">
            {minhas.slice(0, 5).map(m => (
              <blockquote key={m.id} className="text-sm pl-4" style={{ borderLeft: `3px solid var(--linha)` }}>
                <span style={{ fontFamily: 'Literata, serif' }}>{m.trecho.slice(0, 220)}</span>
                <span className="miudo block mt-1">cap. {m.capitulo} · {m.cor}</span>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {livro && (
        <section>
          <h2 className="miudo mb-4">sumário</h2>
          <ol className="grid sm:grid-cols-2 gap-x-8">
            {livro.capitulos.slice(0, 40).map(c => (
              <li key={c.ordem}>
                <a href={`#/ler/${id}`} className="flex gap-3 py-1 text-sm hover:opacity-70">
                  <span className="tabular-nums opacity-40 w-7 shrink-0">{c.ordem}</span>
                  <span className="truncate">{c.titulo ?? `Parte ${c.ordem}`}</span>
                </a>
              </li>
            ))}
          </ol>
          {livro.capitulos.length > 40 && (
            <p className="miudo mt-3">e mais {livro.capitulos.length - 40} capítulos</p>
          )}
        </section>
      )}

      {doAutor.length > 0 && (
        <section>
          <h2 className="miudo mb-4">do mesmo autor</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {doAutor.map(o => <Cartao key={o.id} obra={o} />)}
          </div>
        </section>
      )}
    </article>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="opacity-50">{rotulo}</dt>
      <dd style={{ color: 'var(--tinta)' }}>{children}</dd>
    </div>
  )
}
