import { useState } from 'react'
import type { Catalogo } from '../tipos'
import { anotar, desmarcar, esquecerTudo, exportar, useEstante } from '../lib/estante'
import * as conta from '../lib/conta'

const CORES = ['importante', 'conceito', 'duvida', 'conexao'] as const

export function Caderno({ catalogo }: { catalogo: Catalogo }) {
  const { marcacoes, progresso } = useEstante()
  const eu = conta.useConta()
  const [cor, setCor] = useState<(typeof CORES)[number] | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [apagandoConta, setApagandoConta] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [recado, setRecado] = useState<string | null>(null)

  // Apagar tem que acontecer NOS DOIS LADOS. Só no navegador seria mentira:
  // a sincronia roda em dois minutos e devolve tudo.
  async function apagarTudo() {
    if (!confirm('Apagar marcações, notas e progresso?' + (eu ? ' Isso apaga também no servidor.' : ''))) return
    try {
      if (eu) await conta.apagarDados()
      esquecerTudo()
      setRecado('Apagado.')
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'não deu')
    }
  }

  const porId = new Map(catalogo.obras.map(o => [o.id, o]))
  const lista = marcacoes
    .filter(m => !cor || m.cor === cor)
    .sort((a, b) => b.mudouEm - a.mudouEm)

  const horas = Object.values(progresso).reduce((s, p) => s + p.segundos, 0) / 3600

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl" style={{ fontFamily: 'Literata, serif' }}>Meu caderno</h1>
        <p className="miudo mt-2">
          {marcacoes.length} marcações · {Object.keys(progresso).length} livros abertos ·{' '}
          {horas < 1 ? 'menos de 1 h' : `~${horas.toFixed(1)} h`} de leitura
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Chip ativo={!cor} clique={() => setCor(null)}>tudo</Chip>
        {CORES.map(c => (
          <Chip key={c} ativo={cor === c} clique={() => setCor(c)}>
            {c === 'duvida' ? 'dúvida' : c === 'conexao' ? 'conexão' : c}
          </Chip>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="miudo py-12 text-center">
          Nada aqui ainda. Selecione um trecho enquanto lê e escolha uma cor.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {lista.map(m => (
            <article key={m.id} className="card rounded-lg p-4">
              <div className="flex items-baseline gap-3 mb-2">
                <a href={`#/obra/${m.obraId}`} className="text-sm hover:opacity-70"
                  style={{ fontFamily: 'Literata, serif' }}>
                  {porId.get(m.obraId)?.titulo ?? 'obra removida'}
                </a>
                <span className="miudo">cap. {m.capitulo}</span>
                <button onClick={() => desmarcar(m.id)} className="miudo ml-auto hover:opacity-70">apagar</button>
              </div>

              <blockquote className="pl-3 text-[0.95rem] leading-relaxed"
                style={{ borderLeft: `3px solid ${tom(m.cor)}`, fontFamily: 'Literata, serif' }}>
                {m.trecho}
              </blockquote>

              {editando === m.id ? (
                <textarea
                  autoFocus
                  defaultValue={m.nota ?? ''}
                  onBlur={e => { anotar(m.id, e.target.value); setEditando(null) }}
                  placeholder="o que você pensou aqui…"
                  className="w-full mt-3 p-3 text-sm rounded outline-none resize-y"
                  style={{ background: 'var(--papel)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
                />
              ) : (
                <button onClick={() => setEditando(m.id)}
                  className="mt-3 text-sm text-left w-full hover:opacity-70"
                  style={{ color: m.nota ? 'var(--tinta)' : 'var(--tinta-2)' }}>
                  {m.nota || '+ anotar'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      <section className="mt-8 pt-8" style={{ borderTop: '1px solid var(--linha)' }}>
        <div className="miudo mb-3">seus dados</div>
        <p className="text-sm max-w-prose leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
          {eu
            ? 'Com a conta aberta, isto também fica no servidor — é o que faz aparecer no outro aparelho. Levar embora ou apagar é decisão sua, e vale nos dois lados.'
            : 'Sem conta, tudo isto vive só no seu navegador: nenhum servidor guarda o que você lê. Levar embora ou apagar é decisão sua, e é imediato.'}
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={baixar} className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)' }}>
            Baixar tudo (JSON)
          </button>
          <button onClick={apagarTudo}
            className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)', color: 'var(--acento)' }}>
            Apagar tudo
          </button>
          {eu && !apagandoConta && (
            <button onClick={() => setApagandoConta(true)}
              className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)', color: 'var(--acento)' }}>
              Apagar minha conta
            </button>
          )}
        </div>

        {eu && apagandoConta && (
          <div className="mt-4 p-4 rounded" style={{ border: '1px solid var(--acento)' }}>
            <p className="text-sm">
              Apagar a conta apaga <b>tudo</b>: e-mail, senha, sessões e o que você
              guardou. Não tem volta. Digite <b>{eu.email}</b> para confirmar.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <input value={confirmacao} onChange={e => setConfirmacao(e.target.value)}
                placeholder={eu.email} className="px-3 py-2 text-sm rounded outline-none flex-1 min-w-48"
                style={{ background: 'var(--papel)', border: '1px solid var(--linha)', color: 'var(--tinta)' }} />
              <button
                disabled={confirmacao.trim().toLowerCase() !== eu.email}
                onClick={async () => {
                  try { await conta.apagarConta(confirmacao); esquecerTudo(); location.hash = '/' }
                  catch (e) { setRecado(e instanceof Error ? e.message : 'não deu') }
                }}
                className="px-4 py-2 text-sm rounded disabled:opacity-40"
                style={{ background: 'var(--acento)', color: '#fff' }}>Apagar de vez</button>
              <button onClick={() => { setApagandoConta(false); setConfirmacao('') }}
                className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)' }}>Deixa</button>
            </div>
          </div>
        )}

        {recado && <p className="miudo mt-3">{recado}</p>}
      </section>
    </div>
  )
}

function baixar() {
  const url = URL.createObjectURL(new Blob([exportar()], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'fio-caderno.json'
  a.click()
  URL.revokeObjectURL(url)
}

const tom = (c: string) =>
  ({ importante: '#e8b93a', conceito: '#4b8fd6', duvida: '#d9534f', conexao: '#4a9b6e' })[c] ?? 'var(--linha)'

function Chip({ ativo, clique, children }: { ativo: boolean; clique: () => void; children: React.ReactNode }) {
  return (
    <button onClick={clique} className="text-xs px-3 py-1.5 rounded-full"
      style={{
        background: ativo ? 'var(--acento)' : 'transparent',
        color: ativo ? '#fff' : 'var(--tinta-2)',
        border: '1px solid var(--linha)',
      }}>{children}</button>
  )
}
