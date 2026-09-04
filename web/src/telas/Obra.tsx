import { useEffect, useState } from 'react'
import type { Catalogo, Ficha } from '../tipos'
import * as dados from '../lib/dados'
import { definirEstado, useEstante } from '../lib/estante'
import { duracao } from '../lib/formato'
import { Capa } from '../componentes/Capa'
import { Prateleira } from '../componentes/Prateleira'

// A página da obra funciona SEM o arquivo. É a decisão que sustenta o catálogo
// inteiro: quando não podemos servir o texto, a página continua completa —
// muda o botão, e aparece "onde encontrar".

export function Obra({ id, catalogo }: { id: number; catalogo: Catalogo }) {
  const { progresso, estado, marcacoes } = useEstante()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    setFicha(null); setErro(false)
    dados.ficha(id).then(setFicha).catch(() => setErro(true))
  }, [id])

  if (erro) return <p className="miudo py-16 text-center">não achei esta obra.</p>
  if (!ficha) return <p className="miudo py-16 text-center">abrindo…</p>

  const p = progresso[id]
  const minhas = marcacoes.filter(m => m.obraId === id)
  const doAutor = catalogo.obras.filter(o => o.autorId === ficha.autorId && o.id !== id)
  const mesmoTema = catalogo.obras
    .filter(o => o.id !== id && o.temas.some(t => ficha.temas.includes(t)) && o.autorId !== ficha.autorId)
    .slice(0, 18)

  return (
    <article className="flex flex-col gap-14">
      <header className="grid sm:grid-cols-[minmax(0,13rem)_1fr] gap-7 sm:gap-10">
        <div className="w-36 sm:w-full mx-auto sm:mx-0">
          <div className="aspect-[2/3] rounded-[3px] overflow-hidden"
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,.2), 0 18px 36px -20px rgba(0,0,0,.55)' }}>
            <Capa obra={ficha} tamanho="grande" />
          </div>
        </div>

        <div>
          <h1 className="text-[1.9rem] sm:text-4xl leading-[1.1]" style={{ fontFamily: 'Literata, serif' }}>
            {ficha.titulo}
          </h1>
          {ficha.subtitulo && (
            <p className="mt-1 text-lg" style={{ color: 'var(--tinta-2)', fontFamily: 'Literata, serif' }}>
              {ficha.subtitulo}
            </p>
          )}
          <p className="mt-2">
            <a href={`#/autor/${ficha.autorId}`} className="hover:opacity-70" style={{ color: 'var(--tinta-2)' }}>
              {ficha.autor}
              {ficha.autorMorte && <span className="opacity-60"> ({ficha.autorNasc ?? '?'}–{ficha.autorMorte})</span>}
            </a>
          </p>

          {ficha.chamada && (
            <p className="mt-5 text-lg leading-relaxed max-w-prose" style={{ fontFamily: 'Literata, serif' }}>
              {ficha.chamada}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-6">
            {ficha.temas.map(t => (
              <a key={t} href={`#/tema/${encodeURIComponent(t)}`}
                className="text-xs px-3 py-1 rounded-full hover:opacity-70"
                style={{ border: '1px solid var(--linha)', color: 'var(--tinta-2)' }}>{t}</a>
            ))}
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-5 miudo">
            {ficha.ano && <Dado rotulo="ano">{ficha.ano}</Dado>}
            {ficha.paginas && <Dado rotulo="extensão">{ficha.paginas} páginas</Dado>}
            {duracao(ficha.minutos) && <Dado rotulo="leitura">{duracao(ficha.minutos)}</Dado>}
            {ficha.capitulos && <Dado rotulo="capítulos">{ficha.capitulos.length}</Dado>}
          </dl>

          <div className="flex flex-wrap gap-3 mt-7">
            {ficha.trilho === 'A' ? (
              <a href={`#/ler/${id}`} className="px-5 py-2.5 rounded text-sm"
                style={{ background: 'var(--acento)', color: '#fff' }}>
                {p ? `Continuar do capítulo ${p.capitulo}` : 'Começar a ler'}
              </a>
            ) : ficha.onde.length > 0 ? (
              <a href="#onde" className="px-5 py-2.5 rounded text-sm"
                style={{ background: 'var(--acento)', color: '#fff' }}>Onde encontrar</a>
            ) : null}
            <button
              onClick={() => definirEstado(id, estado[id] === 'quero_ler' ? 'lendo' : 'quero_ler')}
              className="px-5 py-2.5 rounded text-sm" style={{ border: '1px solid var(--linha)' }}>
              {estado[id] === 'quero_ler' ? 'Está na sua lista' : 'Quero ler'}
            </button>
            {/* Uma biblioteca que só deixa ler dentro dela não é biblioteca, é
                aluguel. Estas obras são de domínio público: levar embora é o
                direito que define isso. */}
            {ficha.trilho === 'A' && (
              <a href={`/api/livro/${id}/epub`} download
                className="px-5 py-2.5 rounded text-sm" style={{ border: '1px solid var(--linha)' }}>
                Baixar (EPUB)
              </a>
            )}
          </div>
        </div>
      </header>

      {ficha.porque && (
        <Secao titulo="Por que este livro existe">
          <p className="leading-relaxed max-w-prose" style={{ fontFamily: 'Literata, serif' }}>{ficha.porque}</p>
        </Secao>
      )}

      {ficha.observar && (
        <Secao titulo="O que observar" nota="leitura, não fato — a sua pode ser outra">
          <p className="leading-relaxed max-w-prose" style={{ fontFamily: 'Literata, serif' }}>{ficha.observar}</p>
        </Secao>
      )}

      {ficha.trilho !== 'A' && (
        <section id="onde" className="rounded-lg p-5"
          style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)' }}>
          <div className="miudo mb-3">por que não dá para ler aqui</div>
          <p className="text-sm leading-relaxed max-w-prose" style={{ color: 'var(--tinta-2)' }}>
            {ficha.impedimento}
          </p>
          {ficha.onde.length > 0 && (
            <>
              <div className="miudo mt-6 mb-3">onde encontrar</div>
              <div className="flex flex-wrap gap-2">
                {ficha.onde.map(o => (
                  <a key={o.url} href={o.url} target="_blank" rel="noreferrer noopener"
                    className="px-4 py-2 rounded text-sm hover:opacity-80"
                    style={{ border: '1px solid var(--linha)' }}>
                    {o.provedor}
                    {o.rotulo && <span className="opacity-60"> · {o.rotulo}</span>}
                  </a>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {ficha.trilho === 'A' && ficha.direito && (
        <Secao titulo="Direito autoral, sem enrolação">
          <p className="text-sm leading-relaxed max-w-prose" style={{ color: 'var(--tinta-2)' }}>
            {ficha.direito}
          </p>
          {ficha.fonteUrl && (
            <a href={ficha.fonteUrl} target="_blank" rel="noreferrer noopener"
              className="text-xs underline mt-2 inline-block" style={{ color: 'var(--tinta-2)' }}>
              origem do texto: {ficha.fonte}
            </a>
          )}
        </Secao>
      )}

      {minhas.length > 0 && (
        <Secao titulo={`O que você marcou (${minhas.length})`}>
          <div className="flex flex-col gap-3">
            {minhas.slice(0, 5).map(m => (
              <blockquote key={m.id} className="text-sm pl-4" style={{ borderLeft: '3px solid var(--linha)' }}>
                <span style={{ fontFamily: 'Literata, serif' }}>{m.trecho.slice(0, 220)}</span>
                <span className="miudo block mt-1">cap. {m.capitulo}</span>
              </blockquote>
            ))}
          </div>
        </Secao>
      )}

      {ficha.capitulos && ficha.capitulos.length > 1 && (
        <Secao titulo="Sumário">
          <ol className="grid sm:grid-cols-2 gap-x-10">
            {ficha.capitulos.slice(0, 40).map(c => (
              <li key={c.ordem}>
                <a href={`#/ler/${id}`} className="flex gap-3 py-1 text-sm hover:opacity-70">
                  <span className="tabular-nums opacity-40 w-7 shrink-0">{c.ordem}</span>
                  <span className="truncate">{c.titulo ?? `Parte ${c.ordem}`}</span>
                </a>
              </li>
            ))}
          </ol>
          {ficha.capitulos.length > 40 && (
            <p className="miudo mt-3">e mais {ficha.capitulos.length - 40} capítulos</p>
          )}
        </Secao>
      )}

      {doAutor.length > 0 && (
        <Prateleira titulo={`Mais de ${ficha.autor}`} obras={doAutor.slice(0, 18)}
          verMais={`#/autor/${ficha.autorId}`} />
      )}
      {mesmoTema.length > 0 && (
        <Prateleira titulo="Quem lê este, lê" subtitulo={ficha.temas[0]} obras={mesmoTema} />
      )}
    </article>
  )
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="miudo">{titulo}</h2>
        {nota && <span className="text-[0.68rem] italic" style={{ color: 'var(--tinta-2)' }}>{nota}</span>}
      </div>
      {children}
    </section>
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
