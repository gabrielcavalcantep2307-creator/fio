import { useEffect, useState } from 'react'
import type { Catalogo, Livro } from './tipos'
import * as dados from './lib/dados'
import * as conta from './lib/conta'
import { preferir, useEstante } from './lib/estante'
import { Inicio } from './telas/Inicio'
import { Estante } from './telas/Estante'
import { Obra } from './telas/Obra'
import { Autor } from './telas/Autor'
import { Caderno } from './telas/Caderno'
import { Entrar } from './telas/Entrar'
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

export default function App() {
  const rota = useRota()
  const { prefs } = useEstante()
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [livro, setLivro] = useState<Livro | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { document.documentElement.dataset.tema = prefs.tema }, [prefs.tema])
  useEffect(() => { dados.catalogo().then(setCatalogo).catch(e => setErro(e.message)) }, [])
  useEffect(() => { conta.verificar() }, [])

  const casaLer = rota.match(/^\/ler\/(\d+)/)
  useEffect(() => {
    const id = Number(casaLer?.[1] ?? 0)
    if (!id) return
    if (livro?.id === id) return
    dados.livro(id).then(setLivro).catch(() => setLivro(null))
  }, [casaLer, livro?.id])

  if (erro) return <Aviso>Não consegui carregar o acervo: {erro}</Aviso>
  if (!catalogo) return <Aviso>abrindo a biblioteca…</Aviso>

  if (casaLer) {
    if (!livro) return <Aviso>abrindo o livro…</Aviso>
    return <Leitor livro={livro} sair={() => { location.hash = `/obra/${livro.id}` }} />
  }

  const casaObra = rota.match(/^\/obra\/(\d+)/)
  const casaAutor = rota.match(/^\/autor\/(\d+)/)
  const casaTema = rota.match(/^\/tema\/(.+)$/)

  return (
    <div className="min-h-dvh flex flex-col">
      <Cabecalho rota={rota} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
        {casaObra ? <Obra id={Number(casaObra[1])} catalogo={catalogo} />
          : casaAutor ? <Autor id={Number(casaAutor[1])} catalogo={catalogo} />
          : casaTema ? <TelaTema nome={decodeURIComponent(casaTema[1])} catalogo={catalogo} />
          : rota.startsWith('/estante') ? <Estante catalogo={catalogo} />
          : rota.startsWith('/caderno') ? <Caderno catalogo={catalogo} />
          : rota.startsWith('/entrar') ? <Entrar />
          : <Inicio catalogo={catalogo} />}
      </main>
      <Rodape catalogo={catalogo} />
    </div>
  )
}

function TelaTema({ nome, catalogo }: { nome: string; catalogo: Catalogo }) {
  const info = catalogo.temas.find(t => t.nome === nome)
  return (
    <div className="flex flex-col gap-7">
      <header>
        <a href="#/estante" className="miudo hover:opacity-70">← estante</a>
        <h1 className="text-3xl sm:text-4xl mt-4" style={{ fontFamily: 'Literata, serif' }}>{nome}</h1>
        {info && (
          <p className="mt-2 miudo">{info.obras} obras · {info.legiveis} para ler aqui</p>
        )}
      </header>
      <Estante catalogo={catalogo} temaFixo={nome} />
    </div>
  )
}

function Cabecalho({ rota }: { rota: string }) {
  const eu = conta.useConta()
  const { prefs } = useEstante()
  const itens = [['/estante', 'estante'], ['/caderno', 'caderno']] as const

  return (
    <header className="sticky top-0 z-20 backdrop-blur"
      style={{ borderBottom: '1px solid var(--linha)', background: 'color-mix(in srgb, var(--papel) 88%, transparent)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center gap-5">
        <a href="#/" className="font-medium tracking-tight text-lg shrink-0" style={{ fontFamily: 'Literata, serif' }}>
          Fio
        </a>
        <nav className="flex gap-5 ml-auto items-center">
          {itens.map(([r, nome]) => (
            <a key={r} href={`#${r}`} className="miudo hover:opacity-70"
              style={{ color: rota.startsWith(r) ? 'var(--acento)' : undefined }}>{nome}</a>
          ))}
          <button
            onClick={() => preferir({ tema: prefs.tema === 'noturno' ? 'claro' : 'noturno' })}
            className="miudo hover:opacity-70" title="claro / noturno"
          >{prefs.tema === 'noturno' ? 'claro' : 'noturno'}</button>
          <a href="#/entrar" className="miudo hover:opacity-70"
            style={{ color: rota.startsWith('/entrar') ? 'var(--acento)' : undefined }}>
            {eu ? eu.nome.split(' ')[0].toLowerCase() : 'entrar'}
          </a>
        </nav>
      </div>
    </header>
  )
}

function Rodape({ catalogo }: { catalogo: Catalogo }) {
  const legiveis = catalogo.obras.filter(o => o.trilho === 'A').length
  return (
    <footer className="py-10 mt-16" style={{ borderTop: '1px solid var(--linha)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 text-xs leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
        <p className="max-w-prose">
          {catalogo.obras.length} obras em português, {legiveis} para ler aqui dentro.
          O resto tem ficha e o caminho para encontrar. Livro sem estado de direito
          verificado não ganha botão de leitura.
        </p>
        <p className="mt-3">
          Sem conta, suas marcações e seu progresso ficam neste navegador e em
          nenhum outro lugar. Catálogo gerado em {catalogo.geradoEm}.
        </p>
      </div>
    </footer>
  )
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh grid place-items-center px-6"><p className="miudo">{children}</p></div>
}
