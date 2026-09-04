import { useState } from 'react'
import type { Catalogo } from '../tipos'
import { anotar, desmarcar, esquecerTudo, exportar, useEstante } from '../lib/estante'

const CORES = ['importante', 'conceito', 'duvida', 'conexao'] as const

export function Caderno({ catalogo }: { catalogo: Catalogo }) {
  const { marcacoes, progresso } = useEstante()
  const [cor, setCor] = useState<(typeof CORES)[number] | null>(null)
  const [editando, setEditando] = useState<string | null>(null)

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
          Tudo isto vive no seu navegador. Não há conta, não há servidor guardando
          o que você lê. Levar embora ou apagar é decisão sua, e é imediata.
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={baixar} className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)' }}>
            Baixar tudo (JSON)
          </button>
          <button
            onClick={() => { if (confirm('Apagar marcações, notas e progresso deste navegador?')) esquecerTudo() }}
            className="px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)', color: 'var(--acento)' }}>
            Apagar tudo
          </button>
        </div>
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
