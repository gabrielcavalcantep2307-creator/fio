import { useEffect, useState } from 'react'
import type { Catalogo, Livro } from './tipos'
import * as dados from './lib/dados'
import { useEstante } from './lib/estante'
import { Inicio } from './telas/Inicio'
import { Acervo } from './telas/Acervo'
import { Obra } from './telas/Obra'
import { Caderno } from './telas/Caderno'
import { Leitor } from './telas/Leitor'

// Rota por hash. Não é preguiça: o GitHub Pages não reescreve URL, e sem hash
// um F5 em /obra/12 dá 404. Quando houver servidor, troca-se por history.
function useRota() {
  const [rota, setRota] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const f = () => { setRota(location.hash.slice(1) || '/'); window.scrollTo(0, 0) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return rota
}

export const ir = (r: string) => { location.hash = r }

export default function App() {
  const rota = useRota()
  const { prefs } = useEstante()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [livro, setLivro] = useState<Livro | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.tema = prefs.tema
  }, [prefs.tema])

  useEffect(() => {
    dados.catalogo().then(setCatalogo).catch(e => setErro(e.message))
  }, [])

  // /obra/12 e /ler/12 precisam do livro inteiro; o resto, não
  const casaObra = rota.match(/^\/obra\/(\d+)/)
  const casaLer = rota.match(/^\/ler\/(\d+)/)
  const idAberto = Number(casaObra?.[1] ?? casaLer?.[1] ?? 0)

  useEffect(() => {
    if (!idAberto) { setLivro(null); return }
    if (livro?.id === idAberto) return
    dados.livro(idAberto).then(setLivro).catch(() => setLivro(null))
  }, [idAberto, livro?.id])

  if (erro) return <Aviso>Não consegui carregar o acervo: {erro}</Aviso>
  if (!catalogo) return <Aviso>abrindo a biblioteca…</Aviso>

  if (casaLer) {
    if (!livro) return <Aviso>abrindo o livro…</Aviso>
    return <Leitor livro={livro} sair={() => ir(`/obra/${livro.id}`)} />
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Cabecalho rota={rota} />
      <main className="flex-1 w-full max-w-5xl mx-auto px-5 sm:px-8 py-10">
        {casaObra ? (
          <Obra id={idAberto} catalogo={catalogo} livro={livro} />
        ) : rota.startsWith('/acervo') ? (
          <Acervo catalogo={catalogo} />
        ) : rota.startsWith('/caderno') ? (
          <Caderno catalogo={catalogo} />
        ) : (
          <Inicio catalogo={catalogo} />
        )}
      </main>
      <Rodape />
    </div>
  )
}

function Cabecalho({ rota }: { rota: string }) {
  const itens = [['/acervo', 'acervo'], ['/caderno', 'caderno']] as const
  return (
    <header className="sticky top-0 z-20 backdrop-blur" style={{ borderBottom: '1px solid var(--linha)', background: 'color-mix(in srgb, var(--papel) 88%, transparent)' }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center gap-6">
        <a href="#/" className="font-medium tracking-tight text-lg" style={{ fontFamily: 'Literata, serif' }}>
          Fio
        </a>
        <nav className="flex gap-5 ml-auto">
          {itens.map(([r, nome]) => (
            <a key={r} href={`#${r}`} className="miudo hover:opacity-70"
              style={{ color: rota.startsWith(r) ? 'var(--acento)' : undefined }}>{nome}</a>
          ))}
        </nav>
      </div>
    </header>
  )
}

function Rodape() {
  return (
    <footer className="py-10 mt-16" style={{ borderTop: '1px solid var(--linha)' }}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 text-xs leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
        <p className="max-w-prose">
          Acervo em português, formado só por obras cujo estado de direito autoral
          foi verificado. Livro sem estado conhecido não ganha botão de leitura —
          fica no catálogo, com o caminho para encontrá-lo.
        </p>
        <p className="mt-3">
          Suas marcações e seu progresso ficam no seu navegador, e em nenhum outro lugar.
        </p>
      </div>
    </footer>
  )
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <p className="miudo">{children}</p>
    </div>
  )
}
