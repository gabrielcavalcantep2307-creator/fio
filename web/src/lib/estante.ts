import { useSyncExternalStore } from 'react'

// Tudo o que é do leitor mora no navegador dele.
//
// Não é preguiça: o site é estático e não existe conta. Quando houver
// servidor, isto vira a camada de cache e sincroniza — a forma dos dados já
// está desenhada para isso (cada registro tem `mudouEm`).
//
// LGPD, na prática: nada disto sai do aparelho. "Esquecer tudo" é uma linha.

const CHAVE = 'fio.estante.v1'

export type Marcacao = {
  id: string
  obraId: number
  capitulo: number
  inicio: number
  fim: number
  trecho: string
  cor: 'importante' | 'conceito' | 'duvida' | 'conexao'
  nota?: string
  mudouEm: number
}

export type Progresso = {
  capitulo: number
  fracao: number
  mudouEm: number
  segundos: number
}

export type Preferencias = {
  tema: 'claro' | 'sepia' | 'noturno'
  modo: 'pagina' | 'rolagem'
  corpo: number
  entrelinha: number
  medida: number
  spoiler: 'nenhum' | 'ate_aqui' | 'liberado'
}

type Estante = {
  progresso: Record<number, Progresso>
  marcacoes: Marcacao[]
  estado: Record<number, 'quero_ler' | 'lendo' | 'concluido' | 'abandonado'>
  prefs: Preferencias
}

const PADRAO: Estante = {
  progresso: {},
  marcacoes: [],
  estado: {},
  prefs: {
    tema: 'claro',
    modo: 'pagina',
    corpo: 1.18,
    entrelinha: 1.72,
    medida: 34,
    spoiler: 'ate_aqui',
  },
}

let estado: Estante = ler()
const ouvintes = new Set<() => void>()

function ler(): Estante {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return PADRAO
    const d = JSON.parse(bruto) as Partial<Estante>
    return { ...PADRAO, ...d, prefs: { ...PADRAO.prefs, ...d.prefs } }
  } catch {
    // aba anônima, armazenamento bloqueado, JSON corrompido: segue sem
    return PADRAO
  }
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch { /* sem espaço ou sem permissão — a leitura continua funcionando */ }
  ouvintes.forEach(f => f())
}

function mudar(f: (e: Estante) => Estante) {
  estado = f(estado)
  gravar()
}

// ── leitura reativa ───────────────────────────────────────────

export function useEstante() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f) },
    () => estado,
    () => PADRAO,
  )
}

// ── escrita ───────────────────────────────────────────────────

export function guardarProgresso(obraId: number, p: Omit<Progresso, 'mudouEm' | 'segundos'>, segundos = 0) {
  mudar(e => ({
    ...e,
    progresso: {
      ...e.progresso,
      [obraId]: {
        ...p,
        mudouEm: Date.now(),
        segundos: (e.progresso[obraId]?.segundos ?? 0) + segundos,
      },
    },
    estado: e.estado[obraId] ? e.estado : { ...e.estado, [obraId]: 'lendo' },
  }))
}

export function marcar(m: Omit<Marcacao, 'id' | 'mudouEm'>) {
  const id = `${m.obraId}:${m.capitulo}:${m.inicio}-${m.fim}`
  mudar(e => ({
    ...e,
    marcacoes: [...e.marcacoes.filter(x => x.id !== id), { ...m, id, mudouEm: Date.now() }],
  }))
  return id
}

export const desmarcar = (id: string) =>
  mudar(e => ({ ...e, marcacoes: e.marcacoes.filter(m => m.id !== id) }))

export const anotar = (id: string, nota: string) =>
  mudar(e => ({ ...e, marcacoes: e.marcacoes.map(m => (m.id === id ? { ...m, nota, mudouEm: Date.now() } : m)) }))

export const definirEstado = (obraId: number, v: Estante['estado'][number]) =>
  mudar(e => ({ ...e, estado: { ...e.estado, [obraId]: v } }))

export const preferir = (p: Partial<Preferencias>) =>
  mudar(e => ({ ...e, prefs: { ...e.prefs, ...p } }))

export function esquecerTudo() {
  estado = PADRAO
  try { localStorage.removeItem(CHAVE) } catch { /* já não existe */ }
  ouvintes.forEach(f => f())
}

export const exportar = () => JSON.stringify(estado, null, 2)
