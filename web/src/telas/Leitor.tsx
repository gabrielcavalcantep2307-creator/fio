import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Livro } from '../tipos'
import { guardarProgresso, marcar, desmarcar, preferir, useEstante } from '../lib/estante'
import type { Marcacao } from '../lib/estante'
import { comMarcas, selecao } from '../lib/realce'

const CORES: { cor: Marcacao['cor']; rotulo: string; tom: string }[] = [
  { cor: 'importante', rotulo: 'importante', tom: '#e8b93a' },
  { cor: 'conceito', rotulo: 'conceito', tom: '#4b8fd6' },
  { cor: 'duvida', rotulo: 'dúvida', tom: '#d9534f' },
  { cor: 'conexao', rotulo: 'conexão', tom: '#4a9b6e' },
]

const VAO = 64

export function Leitor({ livro, sair }: { livro: Livro; sair: () => void }) {
  const { prefs, progresso, marcacoes } = useEstante()
  const guardado = progresso[livro.id]

  const [cap, setCap] = useState(() => Math.min(guardado?.capitulo ?? 1, livro.capitulos.length))
  const [pagina, setPagina] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [gaveta, setGaveta] = useState<null | 'sumario' | 'ajustes'>(null)
  const [foco, setFoco] = useState(false)
  const [menu, setMenu] = useState<null | { x: number; y: number; inicio: number; fim: number; trecho: string }>(null)

  const janela = useRef<HTMLDivElement>(null)
  const colunas = useRef<HTMLDivElement>(null)
  const capitulo = livro.capitulos[cap - 1]

  const minhas = useMemo(
    () => marcacoes.filter(m => m.obraId === livro.id && m.capitulo === cap),
    [marcacoes, livro.id, cap],
  )

  // ── medir: quantas páginas cabem neste capítulo, com estes ajustes ──
  const medir = useCallback(() => {
    const j = janela.current, c = colunas.current
    if (!j || !c) return
    if (prefs.modo === 'rolagem') { setPaginas(1); return }
    const largura = j.clientWidth
    setPaginas(Math.max(1, Math.round(c.scrollWidth / (largura + VAO))))
  }, [prefs.modo])

  useLayoutEffect(() => {
    setPagina(0)
    medir()
    // as fontes chegam depois do primeiro desenho e mudam a conta
    document.fonts?.ready.then(medir)
  }, [cap, prefs.modo, prefs.corpo, prefs.entrelinha, prefs.medida, livro.id, medir])

  useEffect(() => {
    const r = new ResizeObserver(medir)
    if (janela.current) r.observe(janela.current)
    return () => r.disconnect()
  }, [medir])

  // O HTML já sai daqui com as marcações dentro. Ver o comentário em
  // lib/realce.ts: pintar por cima do que o React desenhou não sobrevive ao
  // próximo render.
  const corpoMarcado = useMemo(() => comMarcas(capitulo.corpo, minhas), [capitulo.corpo, minhas])

  // ── guardar onde parou, com atraso: rolagem não pode gravar a cada pixel ──
  useEffect(() => {
    const t = setTimeout(() => {
      guardarProgresso(livro.id, { capitulo: cap, fracao: paginas > 1 ? pagina / (paginas - 1) : 0 }, 5)
    }, 1200)
    return () => clearTimeout(t)
  }, [livro.id, cap, pagina, paginas])

  // ── navegação ──
  const irCapitulo = useCallback((n: number) => {
    const alvo = Math.min(Math.max(1, n), livro.capitulos.length)
    setCap(alvo)
    janela.current?.scrollTo({ top: 0 })
    setGaveta(null)
  }, [livro.capitulos.length])

  const avancar = useCallback(() => {
    if (prefs.modo === 'rolagem') { irCapitulo(cap + 1); return }
    if (pagina + 1 < paginas) setPagina(p => p + 1)
    else if (cap < livro.capitulos.length) irCapitulo(cap + 1)
  }, [prefs.modo, pagina, paginas, cap, livro.capitulos.length, irCapitulo])

  const voltar = useCallback(() => {
    if (prefs.modo === 'rolagem') { irCapitulo(cap - 1); return }
    if (pagina > 0) setPagina(p => p - 1)
    else if (cap > 1) { setCap(cap - 1); setPagina(0) }
  }, [prefs.modo, pagina, cap, irCapitulo])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const acoes: Record<string, () => void> = {
        ArrowRight: avancar, ArrowDown: avancar, PageDown: avancar, ' ': avancar,
        ArrowLeft: voltar, ArrowUp: voltar, PageUp: voltar,
        Escape: () => (gaveta ? setGaveta(null) : foco ? setFoco(false) : sair()),
        f: () => setFoco(v => !v),
        s: () => setGaveta(g => (g === 'sumario' ? null : 'sumario')),
        a: () => setGaveta(g => (g === 'ajustes' ? null : 'ajustes')),
      }
      const f = acoes[e.key]
      if (f) { e.preventDefault(); f() }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [avancar, voltar, gaveta, foco, sair])

  // ── seleção → menu de marcação ──
  const olharSelecao = useCallback(() => {
    const c = colunas.current
    if (!c) return
    const s = selecao(c)
    if (!s) { setMenu(null); return }
    const j = janela.current!.getBoundingClientRect()
    setMenu({
      x: Math.min(Math.max(s.caixa.left + s.caixa.width / 2 - j.left, 90), j.width - 90),
      y: Math.max(s.caixa.top - j.top - 12, 8),
      inicio: s.inicio, fim: s.fim, trecho: s.trecho,
    })
  }, [])

  const jaMarcado = (i: number, f: number) =>
    minhas.find(m => m.inicio === i && m.fim === f)

  // ── números da barra de baixo ──
  const lidasAntes = livro.capitulos.slice(0, cap - 1).reduce((s, c) => s + c.palavras, 0)
  const noCapitulo = capitulo.palavras * (paginas > 1 ? pagina / (paginas - 1) : 0)
  const totalPalavras = livro.capitulos.reduce((s, c) => s + c.palavras, 0)
  const percentual = Math.round(((lidasAntes + noCapitulo) / totalPalavras) * 100)
  const faltamMin = Math.max(0, Math.round((totalPalavras - lidasAntes - noCapitulo) / 220))

  const barra = !foco || gaveta

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--papel)' }}>
      {/* topo */}
      <header
        className="flex items-center gap-3 px-4 h-12 shrink-0 transition-opacity duration-300"
        style={{ borderBottom: '1px solid var(--linha)', opacity: barra ? 1 : 0, pointerEvents: barra ? 'auto' : 'none' }}
      >
        <button onClick={sair} className="miudo hover:opacity-70" title="Voltar (Esc)">← acervo</button>
        <div className="flex-1 truncate text-center text-sm" style={{ color: 'var(--tinta-2)' }}>
          {livro.titulo} · <span style={{ color: 'var(--tinta)' }}>{capitulo.titulo ?? `Parte ${cap}`}</span>
        </div>
        <button onClick={() => setGaveta(g => (g === 'sumario' ? null : 'sumario'))} className="miudo hover:opacity-70" title="Sumário (s)">sumário</button>
        <button onClick={() => setGaveta(g => (g === 'ajustes' ? null : 'ajustes'))} className="miudo hover:opacity-70" title="Ajustes (a)">ajustes</button>
        <button onClick={() => setFoco(v => !v)} className="miudo hover:opacity-70" title="Modo foco (f)">{foco ? 'sair do foco' : 'foco'}</button>
      </header>

      {/* o texto */}
      <div className="relative flex-1 min-h-0">
        {/* zonas de clique — invisíveis, e do tamanho certo para o polegar */}
        {prefs.modo === 'pagina' && (
          <>
            <button aria-label="página anterior" onClick={voltar}
              className="absolute left-0 top-0 bottom-0 w-[18%] z-10 cursor-w-resize" />
            <button aria-label="próxima página" onClick={avancar}
              className="absolute right-0 top-0 bottom-0 w-[18%] z-10 cursor-e-resize" />
          </>
        )}

        {/* A medida manda, não a tela. Numa tela larga o texto NÃO se estica:
            passar de ~70 caracteres por linha faz o olho perder a linha
            seguinte, e a leitura cansa sem que se saiba por quê. */}
        <div
          ref={janela}
          className={prefs.modo === 'pagina' ? 'h-full overflow-hidden mx-auto' : 'h-full overflow-y-auto'}
          style={{
            paddingBlock: prefs.modo === 'pagina' ? 28 : 48,
            paddingInline: prefs.modo === 'pagina' ? 0 : 'max(6vw, 28px)',
            width: prefs.modo === 'pagina' ? `min(${prefs.medida}rem, calc(100% - 12vw))` : undefined,
          }}
          onMouseUp={olharSelecao}
          onTouchEnd={olharSelecao}
        >
          <div
            ref={colunas}
            className={prefs.modo === 'pagina' ? 'colunas pagina' : 'pagina mx-auto'}
            style={{
              '--corpo': `${prefs.corpo}rem`,
              '--entrelinha': prefs.entrelinha,
              '--vao': `${VAO}px`,
              maxWidth: prefs.modo === 'rolagem' ? `${prefs.medida}rem` : undefined,
              columnWidth: prefs.modo === 'pagina' ? (janela.current?.clientWidth ?? 600) : undefined,
              transform: prefs.modo === 'pagina'
                ? `translateX(-${pagina * ((janela.current?.clientWidth ?? 600) + VAO)}px)`
                : undefined,
            } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: corpoMarcado }}
          />
        </div>

        {/* menu de marcação */}
        {menu && (
          <div
            className="absolute z-30 flex items-center gap-1 rounded-full px-2 py-1.5 shadow-lg"
            style={{ left: menu.x, top: menu.y, transform: 'translate(-50%,-100%)', background: 'var(--papel-2)', border: '1px solid var(--linha)' }}
          >
            {CORES.map(c => (
              <button
                key={c.cor}
                title={c.rotulo}
                onClick={() => {
                  marcar({ obraId: livro.id, capitulo: cap, inicio: menu.inicio, fim: menu.fim, trecho: menu.trecho, cor: c.cor })
                  window.getSelection()?.removeAllRanges()
                  setMenu(null)
                }}
                className="w-6 h-6 rounded-full hover:scale-110 transition-transform"
                style={{ background: c.tom }}
              />
            ))}
            {jaMarcado(menu.inicio, menu.fim) && (
              <button
                className="miudo px-2 hover:opacity-70"
                onClick={() => { desmarcar(jaMarcado(menu.inicio, menu.fim)!.id); setMenu(null) }}
              >tirar</button>
            )}
          </div>
        )}
      </div>

      {/* barra de baixo: onde estou, e quanto falta */}
      <footer
        className="shrink-0 transition-opacity duration-300"
        style={{ borderTop: '1px solid var(--linha)', opacity: barra ? 1 : 0 }}
      >
        <div className="h-[3px]" style={{ background: 'var(--linha)' }}>
          <div className="h-full" style={{ width: `${percentual}%`, background: 'var(--acento)' }} />
        </div>
        <div className="flex items-center justify-between px-4 h-9 miudo">
          <span>cap. {cap} de {livro.capitulos.length}</span>
          <span>{prefs.modo === 'pagina' ? `${pagina + 1}/${paginas}` : ''}</span>
          <span>{percentual}% · faltam ~{faltamMin} min</span>
        </div>
      </footer>

      {gaveta && <Gaveta qual={gaveta} fechar={() => setGaveta(null)} livro={livro} cap={cap} irCapitulo={irCapitulo} prefs={prefs} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

function Gaveta({
  qual, fechar, livro, cap, irCapitulo, prefs,
}: {
  qual: 'sumario' | 'ajustes'
  fechar: () => void
  livro: Livro
  cap: number
  irCapitulo: (n: number) => void
  prefs: ReturnType<typeof useEstante>['prefs']
}) {
  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/25" onClick={fechar} />
      <aside
        className="fixed right-0 top-0 bottom-0 z-30 w-[min(22rem,88vw)] overflow-y-auto"
        style={{ background: 'var(--papel-2)', borderLeft: '1px solid var(--linha)' }}
      >
        {qual === 'sumario' ? (
          <div className="p-5">
            <div className="miudo mb-4">sumário</div>
            <ol>
              {livro.capitulos.map(c => (
                <li key={c.ordem}>
                  <button
                    onClick={() => irCapitulo(c.ordem)}
                    className="w-full text-left py-1.5 text-sm flex gap-3 hover:opacity-70"
                    style={{ color: c.ordem === cap ? 'var(--acento)' : 'var(--tinta)' }}
                  >
                    <span className="tabular-nums opacity-50 w-7 shrink-0">{c.ordem}</span>
                    <span className="truncate">{c.titulo ?? `Parte ${c.ordem}`}</span>
                    <span className="ml-auto opacity-40 text-xs shrink-0">{Math.round(c.palavras / 220)}min</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-6">
            <div className="miudo">ajustes de leitura</div>

            <Escolha rotulo="tema" valor={prefs.tema} opcoes={['claro', 'sepia', 'noturno']}
              muda={v => preferir({ tema: v as never })} />
            <Escolha rotulo="modo" valor={prefs.modo} opcoes={['pagina', 'rolagem']}
              muda={v => preferir({ modo: v as never })} />

            <Regua rotulo="tamanho da letra" valor={prefs.corpo} min={0.9} max={1.7} passo={0.04}
              muda={v => preferir({ corpo: v })} />
            <Regua rotulo="entrelinha" valor={prefs.entrelinha} min={1.3} max={2.2} passo={0.05}
              muda={v => preferir({ entrelinha: v })} />
            <Regua rotulo="largura do texto" valor={prefs.medida} min={24} max={52} passo={1}
              muda={v => preferir({ medida: v })} />

            <a href={`/api/livro/${livro.id}/epub`} download
              className="block text-center py-2 rounded text-sm"
              style={{ border: '1px solid var(--linha)', color: 'var(--tinta)' }}>
              Baixar este livro (EPUB)
            </a>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
              Teclado: <b>← →</b> viram a página, <b>f</b> entra no foco,
              <b> s</b> abre o sumário, <b>Esc</b> volta.
            </p>
          </div>
        )}
      </aside>
    </>
  )
}

function Escolha({ rotulo, valor, opcoes, muda }: {
  rotulo: string; valor: string; opcoes: string[]; muda: (v: string) => void
}) {
  return (
    <div>
      <div className="miudo mb-2">{rotulo}</div>
      <div className="flex gap-1">
        {opcoes.map(o => (
          <button key={o} onClick={() => muda(o)}
            className="flex-1 py-1.5 text-xs rounded"
            style={{
              background: o === valor ? 'var(--acento)' : 'transparent',
              color: o === valor ? '#fff' : 'var(--tinta-2)',
              border: '1px solid var(--linha)',
            }}>{o}</button>
        ))}
      </div>
    </div>
  )
}

function Regua({ rotulo, valor, min, max, passo, muda }: {
  rotulo: string; valor: number; min: number; max: number; passo: number; muda: (v: number) => void
}) {
  return (
    <div>
      <div className="miudo mb-2">{rotulo}</div>
      <input type="range" min={min} max={max} step={passo} value={valor}
        onChange={e => muda(Number(e.target.value))}
        className="w-full accent-[var(--acento)]" />
    </div>
  )
}
