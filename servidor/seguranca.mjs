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
  // Criar conta já é limitado pelo convite, que é de uso único: o freio aqui
  // existe só contra quem varre códigos, não contra quem erra de digitação.
  // Cinco era pouco — dois enganos e a pessoa ficava trancada uma hora com um
  // convite VÁLIDO na mão. Doze, e acerto zera o contador.
  'criar': { quantas: 12, minutos: 60 },
  // Trocar a senha sabendo a antiga seria um jeito de chutar a senha atual
  // sem passar pelo freio de "entrar". Fecha essa porta.
  'senha': { quantas: 6, minutos: 60 },
  // Ver as perguntas de segurança de um e-mail é barato e não revela nada
  // (a rota responde com perguntas mesmo para endereço que não existe), mas
  // um laço que varra a base gera ruído: quatro por hora basta para quem
  // realmente esqueceu a senha.
  'esqueci': { quantas: 4, minutos: 60 },
  // RESPONDER é a porta de verdade, e é a mais frágil do sistema: três
  // perguntas de memória são chutáveis, e o que impede o chute não é a
  // dificuldade da pergunta — é este número. Cinco tentativas por hora torna
  // a força bruta inviável mesmo contra respostas curtas e previsíveis.
  'responder': { quantas: 5, minutos: 60 },
  // A sincronia roda a cada dois minutos por aparelho. 40 numa hora dá folga
  // para três ou quatro aparelhos e ainda assim tranca uma torneira.
  'guardar': { quantas: 40, minutos: 60 },
  // Avaliar é escrever no que todo mundo lê. Trinta por hora cobre uma
  // maratona de organizar a estante e não cobre um robô.
  'avaliar': { quantas: 30, minutos: 60 },
  // Abrir livro é gesto comum; o freio aqui só existe para um laço de script
  // não inventar popularidade.
  'abrir': { quantas: 120, minutos: 60 },
}

/**
 * O teto por IP, que é o que a doutrina acima prometia e o código não fazia.
 *
 * As chamadas usavam `email ?? ip` — OU um OU outro. Como todo ataque de
 * verdade traz um e-mail bem formado, o ramo do IP nunca rodava: quem tivesse
 * uma senha vazada podia testá-la em mil endereços de uma máquina só, oito
 * vezes em cada, sem nunca esbarrar em freio nenhum.
 *
 * Os números são generosos de propósito. `dicaDeIp` guarda só `187.45.x.x`,
 * para não ter IP inteiro no banco, e nesse tamanho um balde é um pedaço de
 * operadora — apertar aqui trancaria vizinho de quem errou a senha. O que
 * estes tetos impedem é a VARREDURA: uma máquina tentando muitas contas.
 */
export const LIMITES_IP = {
  'entrar': { quantas: 60, minutos: 15 },
  'esqueci': { quantas: 40, minutos: 60 },
  'responder': { quantas: 30, minutos: 60 },
}

/**
 * Os dois freios, na ordem que importa.
 *
 * O do IP primeiro: se a máquina já estourou, nem se registra tentativa no
 * balde do e-mail — senão a varredura tranca as contas alheias de brinde, que
 * é negação de serviço de graça para o atacante.
 */
export function freioDuplo(banco, acao, email, ip) {
  const dica = dicaDeIp(ip) ?? 'sem-ip'
  const limiteIp = LIMITES_IP[acao]
  if (limiteIp) {
    const alvo = `${acao}@ip:${dica}`
    const { n } = banco.prepare(
      `SELECT COUNT(*) n FROM tentativa WHERE chave = ? AND quando > datetime('now', ?)`,
    ).get(alvo, `-${limiteIp.minutos} minutes`)
    if (n >= limiteIp.quantas) return { passa: false, esperar: limiteIp.minutos }
    banco.prepare('INSERT INTO tentativa (chave) VALUES (?)').run(alvo)
  }
  return freio(banco, acao, email ?? dica)
}

/** Deu certo: limpa o balde do e-mail E o do IP daquela ação. */
export function perdoarDuplo(banco, acao, email, ip) {
  perdoar(banco, acao, email ?? (dicaDeIp(ip) ?? 'sem-ip'))
  banco.prepare('DELETE FROM tentativa WHERE chave = ?')
    .run(`${acao}@ip:${dicaDeIp(ip) ?? 'sem-ip'}`)
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

// As que se descobrem em segundos. A lista é curta de propósito: não é para
// substituir a régua, é para pegar o punhado que aparece em toda invasão.
const OBVIAS = new Set([
  'senha', 'senha123', 'password', '123456', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwertyui', 'asdfghjk', 'abc123', 'admin123',
  'iloveyou', 'princesa', 'brasil', 'flamengo', 'corinthians', 'palmeiras',
  'teamo', 'familia', 'mudar123', 'trocar123', 'letmein', 'senhasenha',
])

const semAcentoBaixo = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * A senha serve? E, quando serve, quão bem?
 *
 * ── o piso desceu de 10 para 8, e é uma decisão ──
 *
 * Dez é número de quem protege banco. Isto é uma biblioteca fechada por
 * convite, onde o que se perde numa invasão é o que alguém marcou num livro.
 * Régua alta demais num lugar assim não produz senha forte: produz senha
 * anotada no papel, e a mesma de sempre com um "1" no fim.
 *
 * O que NÃO desceu é a recusa do que já é público por construção — só
 * dígitos, uma letra repetida, a lista das óbvias, e a senha ser o próprio
 * nome de usuário. Essas não são senhas fracas; são senhas que já estão na
 * mão de quem for tentar.
 *
 * ── e por isso devolve DUAS coisas ──
 *
 * `erro` é o que impede. `forca` é o que a tela mostra, e é o que faz a régua
 * baixa não virar descuido: a pessoa escolhe uma senha fraca SABENDO que é
 * fraca, em vez de escolher uma forte por obrigação e esquecê-la na semana
 * seguinte.
 */
export function avaliarSenha(senha, { usuario = '', email = '' } = {}) {
  const s = String(senha ?? '')
  if (s.length < 8) return { erro: 'A senha precisa de pelo menos 8 caracteres.' }
  if (s.length > 200) return { erro: 'Senha longa demais.' }

  const nu = semAcentoBaixo(s)
  if (/^\d+$/.test(s)) return { erro: 'Só números não serve: é o primeiro palpite de qualquer um.' }
  if (new Set(nu).size < 4) return { erro: 'Poucos caracteres diferentes. Varie um pouco mais.' }
  if (OBVIAS.has(nu)) return { erro: 'Essa é uma das senhas mais usadas do mundo. Escolha outra.' }

  // A senha não pode ser o nome com que se entra: quem descobre um descobre
  // os dois de uma vez, e descobrir o nome é trivial.
  const eu = semAcentoBaixo(usuario).replace(/[^a-z0-9]/g, '')
  const nuSo = nu.replace(/[^a-z0-9]/g, '')
  if (eu.length >= 3 && (nuSo.includes(eu) || eu.includes(nuSo))) {
    return { erro: 'A senha não pode ser o seu nome de usuário.' }
  }
  const antesDoArroba = semAcentoBaixo(email).split('@')[0].replace(/[^a-z0-9]/g, '')
  if (antesDoArroba.length >= 4 && nuSo.includes(antesDoArroba)) {
    return { erro: 'A senha não pode ser o seu e-mail.' }
  }

  // A força conta o que de fato custa a quem adivinha: tamanho antes de tudo,
  // variedade depois. Símbolo obrigatório é teatro — "S3nh@!" tem os quatro
  // tipos e cai antes de "a casa de matacavalos", que não tem nenhum.
  const familias = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(s)).length
  const distintos = new Set(s).size
  const pontos = s.length * 1.6 + familias * 4 + distintos * 1.2 + (/\s/.test(s) ? 6 : 0)

  const forca = pontos >= 46 ? 'forte' : pontos >= 32 ? 'razoavel' : 'fraca'
  return {
    erro: null,
    forca,
    recado: forca === 'fraca'
      ? 'Dá para entrar com ela, mas é fraca. Uma frase de quatro palavras resiste muito mais que uma palavra com símbolos.'
      : forca === 'razoavel' ? 'Serve bem.' : 'Forte.',
  }
}

/** A régua, para quem só quer saber se passa. */
export const conferirSenha_ = (senha, quem) => avaliarSenha(senha, quem).erro

/** Guarda só o começo do IP: dá para frear, não dá para rastrear ninguém. */
/**
 * O IP de quem pediu, e por que é o ÚLTIMO da lista e não o primeiro.
 *
 * O Caddy ACRESCENTA o IP do cliente ao `X-Forwarded-For` que chegou, em vez
 * de substituir. Quem manda `X-Forwarded-For: 1.2.3.4` de fora faz o cabeçalho
 * chegar aqui como `1.2.3.4, <ip de verdade>` — e ler o PRIMEIRO, que era o
 * que se fazia, é ler o que o atacante escreveu. Com isso todo freio por IP
 * saía de graça: bastava sortear um valor novo a cada pedido.
 *
 * O último item é o que o nosso proxy pôs, e é o único em que se pode
 * confiar. Vale enquanto houver UM proxy na frente; entrando outro, esta
 * conta muda junto.
 */
export function ipDoPedido(cabecalho, doSoquete) {
  const cadeia = String(cabecalho ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return cadeia.at(-1) || doSoquete
}

export function dicaDeIp(ip) {
  if (!ip) return null
  const v4 = ip.match(/(\d+)\.(\d+)\./)
  if (v4) return `${v4[1]}.${v4[2]}.x.x`
  return ip.split(':').slice(0, 3).join(':') + '::'
}
