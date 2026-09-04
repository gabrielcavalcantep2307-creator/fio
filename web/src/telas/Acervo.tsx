import { useMemo, useState } from 'react'
import type { Catalogo } from '../tipos'
import { buscar } from '../lib/dados'
import { Cartao } from './Inicio'

export function Acervo({ catalogo }: { catalogo: Catalogo }) {
  const [termo, setTermo] = useState('')
  const [so, setSo] = useState<'todos' | 'legiveis'>('legiveis')
  const [autor, setAutor] = useState<number | null>(null)
  const [quantos, setQuantos] = useState(48)

  const lista = useMemo(() => {
    let r = buscar(catalogo.obras, termo)
    if (so === 'legiveis') r = r.filter(o => o.trilho === 'A')
    if (autor) r = r.filter(o => o.autorId === autor)
    return r
  }, [catalogo.obras, termo, so, autor])

  // A contagem do autor tem que bater com o que o filtro está mostrando.
  // Dizer "Camilo 53" e abrir com 9 é mentir para quem clicou.
  const autores = useMemo(() => {
    const base = so === 'legiveis' ? catalogo.obras.filter(o => o.trilho === 'A') : catalogo.obras
    const conta = new Map<number, number>()
    for (const o of base) if (o.autorId) conta.set(o.autorId, (conta.get(o.autorId) ?? 0) + 1)
    return catalogo.autores
      .map(a => ({ ...a, obras: conta.get(a.id) ?? 0 }))
      .filter(a => a.obras >= (so === 'legiveis' ? 2 : 3))
      .sort((a, b) => b.obras - a.obras)
      .slice(0, 24)
  }, [catalogo, so])

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        <input
          value={termo}
          onChange={e => { setTermo(e.target.value); setQuantos(48) }}
          placeholder="título, autor, assunto…  (acento não faz falta)"
          className="w-full px-4 py-3 rounded-lg outline-none"
          style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Chip ativo={so === 'legiveis'} clique={() => setSo('legiveis')}>dá para ler aqui</Chip>
          <Chip ativo={so === 'todos'} clique={() => setSo('todos')}>o catálogo inteiro</Chip>
          {autor && (
            <Chip ativo clique={() => setAutor(null)}>
              {catalogo.autores.find(a => a.id === autor)?.nome} ✕
            </Chip>
          )}
          <span className="miudo ml-auto">{lista.length} obras</span>
        </div>
      </div>

      {!termo && !autor && (
        <div className="flex flex-wrap gap-2">
          {autores.map(a => (
            <button key={a.id} onClick={() => setAutor(a.id)}
              className="text-xs px-3 py-1.5 rounded-full hover:opacity-70"
              style={{ border: '1px solid var(--linha)', color: 'var(--tinta-2)' }}>
              {a.nome} <span className="opacity-50">{a.obras}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lista.slice(0, quantos).map(o => <Cartao key={o.id} obra={o} />)}
      </div>

      {lista.length === 0 && (
        <p className="miudo py-10 text-center">
          nada com esse nome. o acervo é em português e só de obras verificadas —
          é pequeno de propósito.
        </p>
      )}

      {quantos < lista.length && (
        <button onClick={() => setQuantos(q => q + 48)}
          className="miudo py-3 hover:opacity-70">mostrar mais ({lista.length - quantos})</button>
      )}
    </div>
  )
}

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
