// Senha, sessão e freio.
//
// Tudo aqui usa só `node:crypto`. Nenhuma dependência: menos código de
// terceiro no caminho da senha de alguém é menos superfície para dar errado,
// e uma biblioteca de autenticação abandonada é um problema que só aparece
// quando já é tarde.
//
// As decisões, e por que cada uma:
//
//   scrypt em vez de bcrypt   vem no Node, é resistente a GPU por consumir
//                             memória, e não tem o limite de 72 bytes.
//   sal por pessoa            duas pessoas com a mesma senha têm hashes
//                             diferentes; tabela pronta não serve para nada.
//   parâmetros gravados       endurecer o scrypt no ano que vem não pode
//                             trancar quem já tem conta.
//   token de sessão opaco     é sorteado, não assinado. Para invalidar,
//                             apaga-se a linha — um JWT não se apaga.
//   resumo no banco           quem levar o banco não entra como ninguém.
//   comparação em tempo fixo  medir quanto demora a resposta não pode
//                             entregar quantos caracteres estavam certos.

import { randomBytes, scrypt, createHash, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

// N=2^15 leva uns 100 ms num servidor modesto — devagar o bastante para
// estragar a vida de quem tenta em massa, rápido o bastante para quem entra.
export const PARAMS = { N: 32768, r: 8, p: 1, tam: 64 }

// O scrypt do Node recusa qualquer coisa acima de 32 MB por padrão, e
// N=2^15 com r=8 precisa de exatamente 128·N·r = 32 MB — ou seja, bate no
// teto e falha com "memory limit exceeded". `maxmem` é só o limite de
// segurança da chamada: NÃO entra na conta do hash, e por isso não é
// gravado junto com os parâmetros.
const TETO_DE_MEMORIA = 96 * 1024 * 1024
const comTeto = (p) => ({ N: p.N, r: p.r, p: p.p, maxmem: TETO_DE_MEMORIA })

export async function guardarSenha(senha) {
  const sal = randomBytes(16)
  const hash = await scryptAsync(senha.normalize('NFKC'), sal, PARAMS.tam, comTeto(PARAMS))
  return { hash, sal, params: JSON.stringify(PARAMS) }
}

export async function conferirSenha(senha, hash, sal, params) {
  const p = { ...PARAMS, ...JSON.parse(params || '{}') }
  const tentativa = await scryptAsync(senha.normalize('NFKC'), sal, p.tam ?? PARAMS.tam, comTeto(p))
  const guardado = Buffer.from(hash)
  if (tentativa.length !== guardado.length) return false
  return timingSafeEqual(tentativa, guardado)
}

/**
 * Sempre gaste o mesmo tempo, mesmo quando o e-mail não existe.
 *
 * Sem isso, "não existe" responde em 1 ms e "senha errada" em 100 ms — e
 * qualquer um descobre quem tem conta aqui só olhando o relógio.
 */
export async function gastarTempoAtoa() {
  await scryptAsync('senha-que-ninguem-tem', randomBytes(16), PARAMS.tam, comTeto(PARAMS))
}

// ── tokens: sessão, convite, recuperação ─────────────────────

/** O segredo que viaja. 32 bytes de aleatório real, em base64url. */
export const sortearToken = () => randomBytes(32).toString('base64url')

/** O que fica no banco. Do resumo não se volta para o segredo. */
export const resumo = (token) => createHash('sha256').update(token).digest()

/** Código de convite legível de dizer no telefone: FIO-7K2M-9QXB */
export function sortearConvite() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1
  const bloco = () => [...randomBytes(4)].map(b => alfabeto[b % alfabeto.length]).join('')
  return `FIO-${bloco()}-${bloco()}`
}

/**
 * A forma canônica de um convite, para comparar.
 *
 * O código é dito no telefone, colado de um WhatsApp, digitado com o dedo no
 * celular. Ele chega com espaço no meio, sem os hífens, em minúscula, com o
 * `FIO-` esquecido, com um espaço no fim que o teclado do celular põe sozinho.
 * Nada disso é um código diferente — e recusar por causa disso é o sistema
 * culpando a pessoa por um problema dele.
 *
 * Some tudo que não é letra ou número, sobe para maiúscula, e tira o `FIO`
 * da frente. Sobram oito caracteres, que é o convite de verdade.
 */
export function normalizarConvite(bruto) {
  const cru = String(bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cru.startsWith('FIO') ? cru.slice(3) : cru
}

// ── freio ────────────────────────────────────────────────────

/**
 * Quantas tentativas cabem numa janela. Duas contas separadas:
 *
 *   por e-mail   protege UMA conta de quem insiste nela
 *   por IP       protege TODAS as contas de quem varre a lista
 *
 * Só a segunda existir deixa quem tem botnet passar; só a primeira deixa
 * quem tem uma senha vazada testá-la em mil e-mails.
 */
export const LIMITES = {
  'entrar': { quantas: 8, minutos: 15 },
  'criar': { quantas: 5, minutos: 60 },
  'esqueci': { quantas: 4, minutos: 60 },
  // A sincronia roda a cada dois minutos por aparelho. 40 numa hora dá folga
  // para três ou quatro aparelhos e ainda assim tranca uma torneira.
  'guardar': { quantas: 40, minutos: 60 },
}

export function freio(banco, acao, chave) {
  const limite = LIMITES[acao]
  if (!limite) return { passa: true }
  const alvo = `${acao}:${chave}`

  banco.prepare(`DELETE FROM tentativa WHERE quando < datetime('now', '-24 hours')`).run()
  const { n } = banco.prepare(
    `SELECT COUNT(*) n FROM tentativa WHERE chave = ? AND quando > datetime('now', ?)`,
  ).get(alvo, `-${limite.minutos} minutes`)

  if (n >= limite.quantas) {
    return { passa: false, esperar: limite.minutos }
  }
  banco.prepare('INSERT INTO tentativa (chave) VALUES (?)').run(alvo)
  return { passa: true }
}

/** Deu certo: some com o histórico de tentativas daquela chave. */
export const perdoar = (banco, acao, chave) =>
  banco.prepare('DELETE FROM tentativa WHERE chave = ?').run(`${acao}:${chave}`)

// ── validação de entrada ─────────────────────────────────────

// Deliberadamente frouxa: validar e-mail por regex estrita rejeita endereço
// válido de gente de verdade. Quem valida de fato é o e-mail que chega.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function conferirEmail(email) {
  const limpo = String(email ?? '').trim().toLowerCase()
  if (limpo.length < 6 || limpo.length > 254 || !EMAIL.test(limpo)) return null
  return limpo
}

/**
 * A mesma regra do navegador, repetida aqui — porque a do navegador é aviso,
 * e esta é a que vale. Comprimento pesa mais que "um símbolo e um número":
 * uma frase de doze letras resiste mais que "S3nh@!".
 */
export function conferirSenha_(senha) {
  const s = String(senha ?? '')
  if (s.length < 10) return 'A senha precisa de pelo menos 10 caracteres.'
  if (s.length > 200) return 'Senha longa demais.'
  if (/^\d+$/.test(s)) return 'Só números não serve.'
  if (new Set(s.toLowerCase()).size < 5) return 'Use mais caracteres diferentes.'
  return null
}

/** Guarda só o começo do IP: dá para frear, não dá para rastrear ninguém. */
export function dicaDeIp(ip) {
  if (!ip) return null
  const v4 = ip.match(/(\d+)\.(\d+)\./)
  if (v4) return `${v4[1]}.${v4[2]}.x.x`
  return ip.split(':').slice(0, 3).join(':') + '::'
}
