import { useMemo, useState } from 'react'
import type { Catalogo } from '../tipos'
import { buscar, porLegibilidade } from '../lib/dados'
import { Grade } from '../componentes/Prateleira'

// A estante: o acervo inteiro, com capa, e três jeitos de estreitar —
// busca, categoria e autor. Nada de filtro que ninguém usa.

export function Estante({ catalogo, temaFixo }: { catalogo: Catalogo; temaFixo?: string }) {
  const [termo, setTermo] = useState('')
  const [tema, setTema] = useState<string | null>(temaFixo ?? null)
  const [so, setSo] = useState<'ler' | 'tudo'>('tudo')
  const [quantos, setQuantos] = useState(60)

  const lista = useMemo(() => {
    let r = buscar(catalogo.obras, termo)
    if (tema) r = r.filter(o => o.temas.includes(tema))
    if (so === 'ler') r = r.filter(o => o.trilho === 'A')
    return termo ? r : [...r].sort(porLegibilidade)
  }, [catalogo.obras, termo, tema, so])

  const info = catalogo.temas.find(t => t.nome === tema)

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        <input
          value={termo}
          onChange={e => { setTermo(e.target.value); setQuantos(60) }}
          placeholder="título, autor, assunto…  (acento não faz falta)"
          className="w-full px-4 py-3 rounded-lg outline-none"
          style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
        />

        {!temaFixo && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            <Chip ativo={!tema} clique={() => setTema(null)}>tudo</Chip>
            {catalogo.temas.map(t => (
              <Chip key={t.nome} ativo={tema === t.nome} clique={() => { setTema(t.nome); setQuantos(60) }}>
                {t.nome} <span className="opacity-50">{t.obras}</span>
              </Chip>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Chip ativo={so === 'tudo'} clique={() => setSo('tudo')}>catálogo inteiro</Chip>
          <Chip ativo={so === 'ler'} clique={() => setSo('ler')}>dá para ler aqui</Chip>
          <span className="miudo ml-auto">{lista.length} obras</span>
        </div>

        {info?.resumo && (
          <p className="text-sm max-w-prose" style={{ color: 'var(--tinta-2)' }}>{info.resumo}</p>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="miudo py-16 text-center">nada com esse nome.</p>
      ) : (
        <Grade obras={lista.slice(0, quantos)} />
      )}

      {quantos < lista.length && (
        <button onClick={() => setQuantos(q => q + 60)} className="miudo py-4 hover:opacity-70">
          mostrar mais ({lista.length - quantos})
        </button>
      )}
    </div>
  )
}

export function Chip({ ativo, clique, children }: { ativo: boolean; clique: () => void; children: React.ReactNode }) {
  return (
    <button onClick={clique} className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap shrink-0"
      style={{
        background: ativo ? 'var(--acento)' : 'transparent',
        color: ativo ? '#fff' : 'var(--tinta-2)',
        border: '1px solid var(--linha)',
      }}>{children}</button>
  )
}
