import { useEffect, useMemo, useState } from 'react'
import type { Catalogo, ObraResumo } from '../tipos'
import { buscar, normal } from '../lib/dados'
import { Grade } from '../componentes/Prateleira'

// A estante é o **hall de filtros**. É aqui que quem sabe o que procura chega
// perto, e quem não sabe descobre que existe.
//
// Três coisas que a versão anterior fazia errado, e que aqui são regra:
//
//   1. **Todo filtro mostra quanto sobra.** "Poesia 135" antes de clicar.
//      Filtro que leva a zero sem avisar faz a pessoa achar que o acervo é
//      pobre, quando o problema foi a combinação.
//   2. **Os filtros se combinam, e o que está ativo aparece.** Uma fileira de
//      fichas no topo diz exatamente o que está ligado, e cada uma se tira
//      sozinha. Sem isso, ninguém sabe por que só há três livros na tela.
//   3. **Some o que não serve.** Um tema que sobrou com zero obras depois dos
//      outros filtros não fica ali de enfeite.
//
// E fica no endereço: `#/estante?t=Direito&ler=1` volta ao mesmo lugar, e dá
// para mandar no grupo.

type Ordem = 'relevancia' | 'titulo' | 'autor' | 'curto' | 'longo' | 'antigo' | 'recente'

const ORDENS: { chave: Ordem; rotulo: string }[] = [
  { chave: 'relevancia', rotulo: 'em destaque' },
  { chave: 'titulo', rotulo: 'título' },
  { chave: 'autor', rotulo: 'autor' },
  { chave: 'curto', rotulo: 'mais curto' },
  { chave: 'longo', rotulo: 'mais longo' },
  { chave: 'antigo', rotulo: 'mais antigo' },
  { chave: 'recente', rotulo: 'mais recente' },
]

const DURACOES: { chave: string; rotulo: string; de: number; ate: number }[] = [
  { chave: 'ate1h', rotulo: 'até 1 h', de: 1, ate: 60 },
  { chave: '1a3h', rotulo: '1 a 3 h', de: 60, ate: 180 },
  { chave: '3a8h', rotulo: '3 a 8 h', de: 180, ate: 480 },
  { chave: '8h+', rotulo: 'mais de 8 h', de: 480, ate: 1e9 },
]

const EPOCAS: { chave: string; rotulo: string; de: number; ate: number }[] = [
  { chave: 'ate1800', rotulo: 'até 1800', de: 0, ate: 1800 },
  { chave: 'xix', rotulo: 'século XIX', de: 1801, ate: 1900 },
  { chave: 'xx', rotulo: 'século XX', de: 1901, ate: 2000 },
  { chave: 'xxi', rotulo: 'século XXI', de: 2001, ate: 3000 },
]

type Filtros = {
  termo: string
  temas: string[]
  autor: number | null
  duracao: string | null
  epoca: string | null
  so: 'tudo' | 'ler' | 'ficha'
  ordem: Ordem
}

const VAZIO: Filtros = { termo: '', temas: [], autor: null, duracao: null, epoca: null, so: 'tudo', ordem: 'relevancia' }

// ── o endereço guarda o estado, para poder mandar o link ──

function lerDoEndereco(): Filtros {
  const p = new URLSearchParams(location.hash.split('?')[1] ?? '')
  return {
    ...VAZIO,
    termo: p.get('q') ?? '',
    temas: p.getAll('t'),
    autor: p.get('a') ? Number(p.get('a')) : null,
    duracao: p.get('d'),
    epoca: p.get('e'),
    so: (p.get('so') as Filtros['so']) ?? 'tudo',
    ordem: (p.get('o') as Ordem) ?? 'relevancia',
  }
}

function escreverNoEndereco(f: Filtros) {
  const p = new URLSearchParams()
  if (f.termo) p.set('q', f.termo)
  for (const t of f.temas) p.append('t', t)
  if (f.autor) p.set('a', String(f.autor))
  if (f.duracao) p.set('d', f.duracao)
  if (f.epoca) p.set('e', f.epoca)
  if (f.so !== 'tudo') p.set('so', f.so)
  if (f.ordem !== 'relevancia') p.set('o', f.ordem)
  const busca = p.toString()
  const base = location.hash.split('?')[0] || '#/estante'
  history.replaceState(null, '', busca ? `${base}?${busca}` : base)
}

// ── o filtro em si, separado para poder contar ──

function passa(o: ObraResumo, f: Partial<Filtros>) {
  if (f.temas?.length && !f.temas.every(t => o.temas.includes(t))) return false
  if (f.autor && o.autorId !== f.autor) return false
  if (f.so === 'ler' && o.trilho !== 'A') return false
  if (f.so === 'ficha' && o.trilho === 'A') return false
  if (f.duracao) {
    const d = DURACOES.find(x => x.chave === f.duracao)!
    if (!o.minutos || o.minutos < d.de || o.minutos > d.ate) return false
  }
  if (f.epoca) {
    const e = EPOCAS.find(x => x.chave === f.epoca)!
    if (!o.ano || o.ano < e.de || o.ano > e.ate) return false
  }
  return true
}

export function Estante({ catalogo, temaFixo }: { catalogo: Catalogo; temaFixo?: string }) {
  const [f, setF] = useState<Filtros>(() => {
    const inicial = lerDoEndereco()
    return temaFixo ? { ...inicial, temas: [temaFixo] } : inicial
  })
  const [quantos, setQuantos] = useState(60)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ tema: true })

  useEffect(() => { if (!temaFixo) escreverNoEndereco(f) }, [f, temaFixo])
  useEffect(() => setQuantos(60), [f])

  const muda = (parte: Partial<Filtros>) => setF(atual => ({ ...atual, ...parte }))
  const alternaTema = (t: string) =>
    muda({ temas: f.temas.includes(t) ? f.temas.filter(x => x !== t) : [...f.temas, t] })

  // Busca primeiro; o resto dos filtros depois. A ordem importa para contar:
  // as contagens de cada opção são feitas sobre o que os OUTROS filtros já
  // deixaram passar — senão "Poesia 135" mentiria dentro de "até 1 h".
  const porTermo = useMemo(() => buscar(catalogo.obras, f.termo), [catalogo.obras, f.termo])

  const contar = (parte: Partial<Filtros>) => {
    const combinado = { ...f, ...parte }
    let n = 0
    for (const o of porTermo) if (passa(o, combinado)) n++
    return n
  }

  const lista = useMemo(() => {
    const achados = porTermo.filter(o => passa(o, f))
    const cmp: Record<Ordem, (a: ObraResumo, b: ObraResumo) => number> = {
      // "em destaque": quem dá para ler primeiro, depois quem tem chamada
      // escrita, depois alfabético. É o que põe o melhor do acervo na frente.
      relevancia: (a, b) =>
        (a.trilho === b.trilho ? 0 : a.trilho === 'A' ? -1 : 1)
        || ((b.chamada ? 1 : 0) - (a.chamada ? 1 : 0))
        || a.titulo.localeCompare(b.titulo, 'pt'),
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt'),
      autor: (a, b) => a.autor.localeCompare(b.autor, 'pt') || a.titulo.localeCompare(b.titulo, 'pt'),
      curto: (a, b) => (a.minutos ?? 1e9) - (b.minutos ?? 1e9),
      longo: (a, b) => (b.minutos ?? -1) - (a.minutos ?? -1),
      antigo: (a, b) => (a.ano ?? 9999) - (b.ano ?? 9999),
      recente: (a, b) => (b.ano ?? -1) - (a.ano ?? -1),
    }
    // `f.termo` já ordena por relevância de texto; não desmanchar isso
    return f.termo && f.ordem === 'relevancia' ? achados : [...achados].sort(cmp[f.ordem])
  }, [porTermo, f])

  const temasVisiveis = useMemo(() => {
    return catalogo.temas
      .map(t => ({ ...t, quantos: contar({ temas: [...new Set([...f.temas, t.nome])] }) }))
      .filter(t => t.quantos > 0 || f.temas.includes(t.nome))
      .sort((a, b) => b.quantos - a.quantos)
  }, [catalogo.temas, f, porTermo])

  const autoresVisiveis = useMemo(() => {
    const conta = new Map<number, number>()
    for (const o of porTermo) if (o.autorId && passa(o, { ...f, autor: null })) {
      conta.set(o.autorId, (conta.get(o.autorId) ?? 0) + 1)
    }
    return catalogo.autores
      .map(a => ({ ...a, quantos: conta.get(a.id) ?? 0 }))
      .filter(a => a.quantos > 0)
      .sort((a, b) => b.quantos - a.quantos || a.nome.localeCompare(b.nome, 'pt'))
  }, [catalogo.autores, porTermo, f])

  const nomeAutor = catalogo.autores.find(a => a.id === f.autor)?.nome
  const ativos = [
    ...f.temas.map(t => ({ rotulo: t, tira: () => alternaTema(t) })),
    ...(f.autor ? [{ rotulo: nomeAutor ?? 'autor', tira: () => muda({ autor: null }) }] : []),
    ...(f.duracao ? [{ rotulo: DURACOES.find(d => d.chave === f.duracao)!.rotulo, tira: () => muda({ duracao: null }) }] : []),
    ...(f.epoca ? [{ rotulo: EPOCAS.find(e => e.chave === f.epoca)!.rotulo, tira: () => muda({ epoca: null }) }] : []),
    ...(f.so !== 'tudo' ? [{ rotulo: f.so === 'ler' ? 'dá para ler aqui' : 'só ficha', tira: () => muda({ so: 'tudo' }) }] : []),
  ].filter(x => !(temaFixo && x.rotulo === temaFixo))

  return (
    <div className="grid lg:grid-cols-[15rem_1fr] gap-8 items-start">
      {/* ── o hall de filtros ── */}
      <aside className="lg:sticky lg:top-20 flex flex-col gap-5">
        <input
          value={f.termo}
          onChange={e => muda({ termo: e.target.value })}
          placeholder="título, autor, assunto…"
          className="w-full px-3.5 py-2.5 rounded-lg outline-none text-sm"
          style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
        />

        <Bloco titulo="disponibilidade" aberto>
          {([
            ['tudo', 'tudo', catalogo.obras.length],
            ['ler', 'dá para ler aqui', contar({ so: 'ler' })],
            ['ficha', 'só a ficha', contar({ so: 'ficha' })],
          ] as const).map(([chave, rotulo, n]) => (
            <Opcao key={chave} ativo={f.so === chave} quantos={chave === 'tudo' ? undefined : n}
              clique={() => muda({ so: chave })}>{rotulo}</Opcao>
          ))}
        </Bloco>

        {!temaFixo && (
          <Bloco titulo={`assunto${f.temas.length ? ` (${f.temas.length})` : ''}`}
            aberto={abertos.tema} alterna={() => setAbertos(a => ({ ...a, tema: !a.tema }))}>
            {temasVisiveis.map(t => (
              <Opcao key={t.nome} ativo={f.temas.includes(t.nome)} quantos={t.quantos}
                clique={() => alternaTema(t.nome)}>{t.nome}</Opcao>
            ))}
          </Bloco>
        )}

        <Bloco titulo="quanto tempo leva" aberto={abertos.dur}
          alterna={() => setAbertos(a => ({ ...a, dur: !a.dur }))}>
          {DURACOES.map(d => {
            const n = contar({ duracao: d.chave })
            return n === 0 && f.duracao !== d.chave ? null : (
              <Opcao key={d.chave} ativo={f.duracao === d.chave} quantos={n}
                clique={() => muda({ duracao: f.duracao === d.chave ? null : d.chave })}>{d.rotulo}</Opcao>
            )
          })}
          <p className="text-[0.68rem] mt-1.5 leading-snug" style={{ color: 'var(--tinta-2)' }}>
            só vale para o que dá para ler aqui — do resto não temos o texto para medir
          </p>
        </Bloco>

        <Bloco titulo="quando foi escrito" aberto={abertos.ep}
          alterna={() => setAbertos(a => ({ ...a, ep: !a.ep }))}>
          {EPOCAS.map(e => {
            const n = contar({ epoca: e.chave })
            return n === 0 && f.epoca !== e.chave ? null : (
              <Opcao key={e.chave} ativo={f.epoca === e.chave} quantos={n}
                clique={() => muda({ epoca: f.epoca === e.chave ? null : e.chave })}>{e.rotulo}</Opcao>
            )
          })}
        </Bloco>

        <Bloco titulo="autor" aberto={abertos.aut}
          alterna={() => setAbertos(a => ({ ...a, aut: !a.aut }))}>
          <ListaDeAutores autores={autoresVisiveis} escolhido={f.autor}
            escolhe={id => muda({ autor: f.autor === id ? null : id })} />
        </Bloco>
      </aside>

      {/* ── o resultado ── */}
      <div className="flex flex-col gap-5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="miudo">{lista.length} {lista.length === 1 ? 'obra' : 'obras'}</span>
          {ativos.length > 0 && (
            <>
              {ativos.map(a => (
                <button key={a.rotulo} onClick={a.tira}
                  className="text-xs px-3 py-1 rounded-full flex items-center gap-1.5 hover:opacity-80"
                  style={{ background: 'var(--acento)', color: '#fff' }}>
                  {a.rotulo} <span aria-hidden>×</span>
                </button>
              ))}
              <button onClick={() => setF(temaFixo ? { ...VAZIO, temas: [temaFixo] } : VAZIO)}
                className="miudo hover:opacity-70">limpar</button>
            </>
          )}
          <label className="miudo ml-auto flex items-center gap-2">
            ordenar
            <select value={f.ordem} onChange={e => muda({ ordem: e.target.value as Ordem })}
              className="px-2 py-1 rounded outline-none text-xs normal-case tracking-normal"
              style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}>
              {ORDENS.map(o => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
            </select>
          </label>
        </div>

        {lista.length === 0 ? (
          <div className="py-20 text-center">
            <p style={{ fontFamily: 'Literata, serif' }}>Nada com essa combinação.</p>
            <p className="miudo mt-2">tire um filtro acima, ou</p>
            <button onClick={() => setF(temaFixo ? { ...VAZIO, temas: [temaFixo] } : VAZIO)}
              className="mt-3 px-4 py-2 text-sm rounded" style={{ border: '1px solid var(--linha)' }}>
              comece de novo
            </button>
          </div>
        ) : (
          <Grade obras={lista.slice(0, quantos)} />
        )}

        {quantos < lista.length && (
          <button onClick={() => setQuantos(q => q + 60)} className="miudo py-4 hover:opacity-70">
            mostrar mais ({lista.length - quantos})
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

function Bloco({ titulo, aberto, alterna, children }: {
  titulo: string; aberto?: boolean; alterna?: () => void; children: React.ReactNode
}) {
  return (
    <section>
      <button onClick={alterna} disabled={!alterna}
        className="w-full flex items-center justify-between miudo mb-2 hover:opacity-70 disabled:hover:opacity-100">
        {titulo}
        {alterna && <span aria-hidden style={{ opacity: 0.5 }}>{aberto ? '−' : '+'}</span>}
      </button>
      {aberto !== false && <div className="flex flex-col">{children}</div>}
    </section>
  )
}

function Opcao({ ativo, quantos, clique, children }: {
  ativo: boolean; quantos?: number; clique: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={clique}
      className="flex items-baseline gap-2 py-1 text-left text-sm hover:opacity-70"
      style={{ color: ativo ? 'var(--acento)' : 'var(--tinta)' }}>
      <span
        className="w-3 h-3 shrink-0 rounded-[3px] translate-y-0.5"
        style={{
          border: `1px solid ${ativo ? 'var(--acento)' : 'var(--linha)'}`,
          background: ativo ? 'var(--acento)' : 'transparent',
        }}
      />
      <span className="min-w-0 truncate">{children}</span>
      {quantos !== undefined && (
        <span className="ml-auto text-xs tabular-nums shrink-0" style={{ color: 'var(--tinta-2)' }}>{quantos}</span>
      )}
    </button>
  )
}

/** Quinhentos autores não cabem numa lista. Um campo de filtro, e cabem. */
function ListaDeAutores({ autores, escolhido, escolhe }: {
  autores: { id: number; nome: string; quantos: number }[]
  escolhido: number | null
  escolhe: (id: number) => void
}) {
  const [procura, setProcura] = useState('')
  const filtrados = useMemo(() => {
    const t = normal(procura.trim())
    const base = t ? autores.filter(a => normal(a.nome).includes(t)) : autores
    return base.slice(0, procura ? 40 : 12)
  }, [autores, procura])

  return (
    <>
      <input
        value={procura}
        onChange={e => setProcura(e.target.value)}
        placeholder={`filtrar ${autores.length} autores`}
        className="w-full px-2.5 py-1.5 mb-2 rounded outline-none text-xs"
        style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
      />
      <div className="max-h-64 overflow-y-auto flex flex-col">
        {filtrados.map(a => (
          <Opcao key={a.id} ativo={escolhido === a.id} quantos={a.quantos} clique={() => escolhe(a.id)}>
            {a.nome}
          </Opcao>
        ))}
        {filtrados.length === 0 && <p className="miudo py-2">nenhum autor com esse nome</p>}
      </div>
    </>
  )
}
