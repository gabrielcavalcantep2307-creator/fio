import type { Catalogo } from '../tipos'
import { porLegibilidade } from '../lib/dados'
import { Grade } from '../componentes/Prateleira'

export function Autor({ id, catalogo }: { id: number; catalogo: Catalogo }) {
  const autor = catalogo.autores.find(a => a.id === id)
  const obras = catalogo.obras.filter(o => o.autorId === id).sort(porLegibilidade)
  if (!autor) return <p className="miudo py-16 text-center">não achei este autor.</p>

  const legiveis = obras.filter(o => o.trilho === 'A').length
  const temas = [...new Set(obras.flatMap(o => o.temas))].slice(0, 6)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <a href="#/estante" className="miudo hover:opacity-70">← estante</a>
        <h1 className="text-3xl sm:text-4xl mt-4" style={{ fontFamily: 'Literata, serif' }}>
          {autor.nome}
        </h1>
        <p className="mt-2 miudo">
          {autor.nascimento || autor.morte
            ? `${autor.nascimento ?? '?'} – ${autor.morte ?? '?'} · `
            : ''}
          {obras.length} obras no acervo
          {legiveis > 0 && ` · ${legiveis} para ler aqui`}
        </p>
        {temas.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {temas.map(t => (
              <a key={t} href={`#/tema/${encodeURIComponent(t)}`}
                className="text-xs px-3 py-1 rounded-full hover:opacity-70"
                style={{ border: '1px solid var(--linha)', color: 'var(--tinta-2)' }}>{t}</a>
            ))}
          </div>
        )}
      </header>
      <Grade obras={obras} />
    </div>
  )
}
