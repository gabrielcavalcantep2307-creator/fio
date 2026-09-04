import { useSyncExternalStore } from 'react'

// O cliente de contas.
//
// O site é estático e o servidor de contas é outro processo (servidor/). Este
// arquivo é a única coisa que sabe disso: se `VITE_API` não estiver definida,
// tudo aqui responde "sem servidor" e o site continua funcionando inteiro,
// só sem conta. Ler não depende de ter conta.
//
// Nada de token no localStorage: a sessão é um cookie HttpOnly que o
// JavaScript não enxerga, e por isso um XSS não a rouba. O preço é
// `credentials: 'include'` em toda chamada.

export const API: string | undefined = import.meta.env.VITE_API || undefined
export const temServidor = () => !!API

export type Pessoa = { id: number; nome: string; email: string; papel: 'leitor' | 'editor' | 'admin' }

let quem: Pessoa | null = null
let carregado = false
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach(f => f())

export function useConta() {
  return useSyncExternalStore(
    f => { ouvintes.add(f); return () => ouvintes.delete(f) },
    () => quem,
    () => null,
  )
}

async function chamar<T>(rota: string, corpo?: unknown, metodo = 'POST'): Promise<T> {
  if (!API) throw new Error('O servidor de contas ainda não está no ar.')
  const r = await fetch(API + rota, {
    method: corpo === undefined && metodo === 'POST' ? 'GET' : metodo,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      // O servidor exige este cabeçalho em toda escrita. Um formulário de
      // outro site não consegue mandá-lo sem passar pelo CORS, e é isso que
      // fecha a porta do CSRF.
      'x-fio': '1',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const dado = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dado.erro || `falhou (${r.status})`)
  return dado as T
}

export async function verificar() {
  if (!API || carregado) return quem
  carregado = true
  try {
    quem = (await chamar<{ pessoa: Pessoa }>('/eu', undefined, 'GET')).pessoa
  } catch { quem = null }
  avisar()
  return quem
}

export async function entrar(email: string, senha: string) {
  quem = (await chamar<{ pessoa: Pessoa }>('/entrar', { email, senha })).pessoa
  avisar()
  return quem
}

export async function criar(nome: string, email: string, senha: string, convite: string) {
  quem = (await chamar<{ pessoa: Pessoa }>('/criar', { nome, email, senha, convite })).pessoa
  avisar()
  return quem
}

export const esqueci = (email: string) => chamar<{ ok: true }>('/esqueci', { email })
export const trocarSenha = (token: string, senha: string) => chamar<{ ok: true }>('/trocar-senha', { token, senha })

export async function sair() {
  await chamar('/sair', {})
  quem = null
  avisar()
}

/**
 * Força mínima de senha, checada no navegador para dar aviso cedo — e checada
 * de novo no servidor, que é onde vale. Comprimento pesa mais que "um símbolo
 * e um número": uma frase de doze letras é melhor que "S3nh@!".
 */
export function forcaDaSenha(senha: string) {
  if (senha.length < 10) return { ok: false, aviso: 'Pelo menos 10 caracteres.' }
  if (/^\d+$/.test(senha)) return { ok: false, aviso: 'Só números não serve.' }
  if (/^(.)\1+$/.test(senha)) return { ok: false, aviso: 'Repetir a mesma letra não serve.' }
  const variedade = new Set(senha.toLowerCase()).size
  if (variedade < 5) return { ok: false, aviso: 'Use mais letras diferentes.' }
  return { ok: true, aviso: senha.length >= 16 ? 'boa' : 'serve' }
}
