// Os nomes próprios de um livro, e os que o tradutor comeu (20/09/2026).
//
// ─────────────────────────────────────────────────────────────
// O PEDIDO
//
// O dono: "personagens também ele traduziu". É verdade e está no acervo:
// *White Fang* virou "Fingão Branco"; "Sol-leks" virou "Sol-leks" numa página
// e outra coisa na seguinte. Nome de gente e de lugar não se traduz — nem uma
// tradução humana faz isso — e quando a máquina faz, o leitor perde o
// personagem de vista no meio do livro.
//
// O QUE ESTE ARQUIVO FAZ, E O QUE ELE NÃO CONSEGUE FAZER
//
// Ele LISTA: os nomes próprios frequentes do texto original que não aparecem
// na nossa tradução. Em "A Morte de Artur" a primeira linha dessa lista é
// "Mark (172x)" — que é exatamente o personagem que virou outra coisa. A
// lista é confiável e é a parte útil.
//
// Ele NÃO decide no que cada nome virou. A ideia óbvia — casar por contagem,
// "White Fang ×243 no original, Fingão Branco ×241 na nossa, logo são o
// mesmo" — foi implementada, testada em livro real e REPROVADA no mesmo dia.
// O porquê está em detalhe mais abaixo, junto de `casarPorFrequencia`, que
// fica aqui como experimento registrado e não é usada por serviço nenhum.
//
// Em resumo: a pergunta "este nome deveria ter sido traduzido?" depende de
// saber o que a palavra É. Contagem não sabe o que nada é. Ireland deve virar
// Irlanda; White Fang não deve virar Fingão Branco; e nenhuma estatística
// separa os dois casos. Aqui a máquina entrega a lista curta, e quem fecha a
// conta é gente.
// ─────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'

// Palavras que começam com maiúscula e NÃO são nome próprio: começo de frase,
// tratamento, dia, mês. Sem esta lista, "Senhor" e "Janeiro" entram como
// personagens e disputam contagem com gente de verdade.
const NAO_E_NOME = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'ele', 'ela', 'eles', 'elas', 'eu', 'tu', 'nos', 'vos',
  'mas', 'que', 'quando', 'como', 'porque', 'se', 'por', 'para', 'com', 'sem', 'depois', 'antes',
  'senhor', 'senhora', 'senhorita', 'sr', 'sra', 'dom', 'dona', 'doutor', 'doutora', 'rei', 'rainha',
  'deus', 'capitulo', 'capítulo', 'livro', 'parte', 'fim', 'nota', 'sim', 'nao', 'não',
  'janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro',
  'segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta', 'sabado', 'sábado', 'domingo',
  'the', 'and', 'but', 'when', 'what', 'who', 'why', 'how', 'if', 'then', 'there', 'this', 'that',
  'he', 'she', 'it', 'they', 'we', 'you', 'i', 'my', 'his', 'her', 'their', 'mr', 'mrs', 'miss',
  'sir', 'lord', 'lady', 'god', 'chapter', 'book', 'part', 'end', 'yes', 'no',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'monday', 'sunday',
  'der', 'die', 'das', 'und', 'aber', 'wenn', 'wie', 'ich', 'er', 'sie', 'es', 'herr', 'frau',
  'kapitel', 'buch', 'ende', 'ja', 'nein',
  // Títulos e postos: em inglês vêm com maiúscula e passam por nome próprio.
  // Foi o que fez "Knight" (158x) casar com "Marcos" (141x) em A Morte de
  // Artur. Nenhum deles é nome de ninguém.
  'king', 'queen', 'knight', 'prince', 'princess', 'duke', 'earl', 'count', 'countess',
  'baron', 'emperor', 'empress', 'captain', 'colonel', 'major', 'general', 'doctor',
  'professor', 'father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'madam', 'madame',
  'monsieur', 'mademoiselle', 'signor', 'don', 'sire', 'master', 'mistress',
  'rei', 'rainha', 'cavaleiro', 'principe', 'príncipe', 'princesa', 'duque', 'conde',
  'condessa', 'barao', 'barão', 'imperador', 'capitao', 'capitão', 'coronel', 'general',
  'padre', 'frei', 'irmao', 'irmão', 'irma', 'irmã', 'tio', 'tia', 'primo', 'prima',
  'könig', 'königin', 'ritter', 'prinz', 'graf', 'kaiser', 'hauptmann', 'vater', 'mutter',
  'roi', 'reine', 'chevalier', 'comte', 'duc', 'père', 'mère',
  // Palavras de cenário que também vêm com maiúscula em título de capítulo
  'round', 'table', 'red', 'white', 'black', 'green', 'great', 'little', 'old', 'new',
  'holy', 'lake', 'castle', 'court', 'hall', 'abbey', 'forest', 'river',
])

const semTags = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#[0-9]+;/g, ' ')

/**
 * Os nomes próprios de um texto, com quantas vezes cada um aparece.
 *
 * Pega palavra com maiúscula que NÃO está no começo de frase — no começo,
 * toda palavra tem maiúscula e a caixa não diz nada. Pega também o par
 * ("White Fang", "Padre Brown"), porque o nome inteiro é o que importa.
 */
export function nomesDe(texto) {
  const limpo = semTags(texto).replace(/[ \t\r\n]+/g, ' ')
  const contas = new Map()
  const somar = (nome) => contas.set(nome, (contas.get(nome) ?? 0) + 1)

  // Cada frase separada: dentro dela, a primeira palavra não conta.
  for (const frase of limpo.split(/(?<=[.!?…:;»"”])[ ]+|["“«»”]/)) {
    const palavras = frase.match(/[A-ZÀ-Ý][a-zà-ÿ'’-]{1,}|[A-ZÀ-Ý]{2,}/g)
    if (!palavras) continue
    // onde cada palavra começa, para saber qual é a primeira da frase
    const primeira = frase.trimStart().split(' ')[0]?.replace(/[^A-Za-zÀ-ÿ'’-]/g, '')
    for (let i = 0; i < palavras.length; i++) {
      const p = palavras[i]
      if (p === primeira && i === 0) continue
      if (NAO_E_NOME.has(p.toLowerCase())) continue
      if (p.length < 3) continue
      somar(p)
      // o par, quando o seguinte também é nome
      const prox = palavras[i + 1]
      if (prox && !NAO_E_NOME.has(prox.toLowerCase()) && prox.length >= 3 &&
          frase.includes(p + ' ' + prox)) somar(p + ' ' + prox)
    }
  }
  return contas
}

/** Só os que aparecem o bastante para a contagem valer alguma coisa. */
export const frequentes = (contas, piso = PISO) =>
  new Map([...contas]
    .filter(([nome, n]) => n >= piso && !RUIDO_DA_FONTE.has(nome.toLowerCase()))
    .sort((a, b) => b[1] - a[1]))

// ─────────────────────────────────────────────────────────────
// O QUE O PRIMEIRO TESTE REAL MOSTROU, E POR QUE ISTO NUNCA APLICA SOZINHO
//
// Rodado em "A Morte de Artur" (20/09/2026), o casamento por frequência
// propôs três trocas, e as TRÊS estavam erradas:
//
//   "Marcos" (141x)    → "Knight" (158x)     é o rei Mark, não "knight"
//   "Cavaleiro" (116x) → "Arthur’s" (117x)   "Cavaleiro" É a tradução certa
//   "Irlanda" (62x)    → "Ireland" (72x)     traduzir Irlanda é o CORRETO
//
// Três defeitos diferentes, e vale nomear cada um porque nenhum se conserta
// mexendo no número:
//
//   1. Em inglês, TÍTULO tem maiúscula: King, Queen, Knight, Round Table.
//      Eles entram na lista de "nomes" dos dois lados e disputam contagem com
//      gente de verdade — e "Knight" (158) fica mais perto de "Marcos" (141)
//      do que o "Mark" (172) que é a resposta.
//   2. Nome de lugar DEVE ser traduzido: Ireland vira Irlanda, London vira
//      Londres, e o mesmo vale para rei canônico (Arthur → Artur). Isso não é
//      defeito; é português correto. A contagem não sabe a diferença.
//   3. Contagem parecida não é identidade. Num livro com 265 nomes
//      frequentes, achar outro a 15% de distância é fácil e quase sempre
//      errado.
//
// Apertar os números ajuda e não resolve: o problema é que a pergunta "este
// nome deveria ter sido traduzido?" depende de saber o que a palavra é, e
// contagem não sabe o que nada é.
//
// Por isso este arquivo PROPÕE e nunca aplica. Ele entrega uma lista curta
// com a contagem dos dois lados escrita ao lado de cada linha, para alguém
// olhar em dez segundos e dizer sim ou não. É o único ponto de todo o sistema
// em que a máquina não consegue fechar a conta sozinha — e fingir que
// consegue seria trocar 168 traduções ruins por 168 traduções destruídas.
// ─────────────────────────────────────────────────────────────

// APERTAR NÃO SALVOU. Segunda rodada, com piso 20, tolerância 5% e uma lista
// de títulos e postos fora da conta:
//
//   "Tristran" (85x) → "Gutenberg" (83x)   a licença do Project Gutenberg
//   "Castelo" (44x)  → "Knights" (43x)     ainda um posto
//   "Sócrates" (49x) → "Mensch" (47x)      "Mensch" é "homem"
//
// E apareceu o defeito que fecha o assunto: **em alemão todo substantivo tem
// maiúscula.** Musik, Tragödie, Kunst, Welt, Natur — o original alemão inteiro
// vira uma lista de "nomes próprios", e não há lista de exceções que dê conta
// de um idioma. Onze dos nossos livros vêm do alemão.
//
// `casarPorFrequencia` fica aqui como EXPERIMENTO REGISTRADO, com os testes
// que provam o que ela faz em laboratório — e com este aviso, para que
// ninguém (eu, daqui a três meses) a reconstrua achando que é uma boa ideia.
// Ela NÃO é usada por nenhum serviço, e `ingestao/conferir-nomes.mjs` mostra
// os casamentos sob o rótulo de suspeitos, embaixo da informação que presta.
//
// O QUE PRESTA é a outra metade: a lista de nomes frequentes no original que
// NÃO aparecem na nossa tradução. Ela não diz no que viraram — mas diz onde
// olhar, e em "A Morte de Artur" a primeira linha dela é "Mark (172x)", que é
// exatamente o personagem em questão. Dez segundos de olho humano fecham o
// que a contagem não fecha.
export const PISO = 20
export const TOLERANCIA = 0.05

/** O texto de licença do Project Gutenberg, que não é personagem de ninguém. */
export const RUIDO_DA_FONTE = new Set([
  'gutenberg', 'project', 'project gutenberg', 'foundation', 'ebook', 'ebooks', 'archive',
  'literary', 'license', 'licence', 'copyright', 'trademark', 'donations', 'irs', 'utf',
  'ascii', 'html', 'wikisource', 'transcriber', 'proofreading', 'distributed',
])

/**
 * Casa o que sumiu do nosso texto com o que apareceu do nada nele.
 *
 * @param {Map} nossos     nomes da nossa tradução → contagem
 * @param {Map} originais  nomes do texto original → contagem
 * @returns {{casados: Array, sumiram: Array, apareceram: Array}}
 *   `casados` é o que vira proposta: { de, para, nossa, original }
 */
export function casarPorFrequencia(nossos, originais) {
  const nossosF = frequentes(nossos, PISO)
  const originaisF = frequentes(originais, PISO)

  // Quem está de um lado e não do outro. "Não estar" é contagem baixa
  // demais para ser o mesmo nome, e não necessariamente zero: um nome pode
  // sobreviver em duas páginas e ser traduzido no resto.
  const sumiram = [...originaisF].filter(([nome, n]) => (nossos.get(nome) ?? 0) < n * 0.2)
  const apareceram = [...nossosF].filter(([nome, n]) => (originais.get(nome) ?? 0) < n * 0.2)

  const casados = []
  for (const [nomeOriginal, nO] of sumiram) {
    // candidatos com contagem parecida
    const perto = apareceram.filter(([, nN]) => Math.abs(nN - nO) <= nO * TOLERANCIA)
    // trava 3: o casamento tem que ser único. Dois candidatos = nenhum.
    if (perto.length !== 1) continue
    const [nomeNosso, nN] = perto[0]
    // um nome não casa consigo mesmo, nem com pedaço de si
    if (nomeNosso === nomeOriginal) continue
    if (nomeOriginal.includes(nomeNosso) || nomeNosso.includes(nomeOriginal)) continue
    casados.push({ de: nomeNosso, para: nomeOriginal, nossa: nN, original: nO })
  }

  // um nome nosso não pode virar dois originais diferentes
  const vezes = new Map()
  for (const c of casados) vezes.set(c.de, (vezes.get(c.de) ?? 0) + 1)
  return {
    casados: casados.filter((c) => vezes.get(c.de) === 1),
    sumiram: sumiram.map(([nome, n]) => ({ nome, vezes: n })),
    apareceram: apareceram.map(([nome, n]) => ({ nome, vezes: n })),
  }
}

// ─────────────────────────────────────────────────────────────
// O original, baixado e guardado
//
// Guardado em /dados porque um deploy leva /tmp e /app junto, e baixar de
// novo 5 mil livros do Gutenberg para refazer a mesma conta seria mau uso do
// serviço de uma fundação.
// ─────────────────────────────────────────────────────────────

export async function baixarOriginal(url, pasta) {
  if (!url) return null
  mkdirSync(pasta, { recursive: true })
  const nome = join(pasta, String(url).replace(/[^a-zA-Z0-9]/g, '_').slice(-120) + '.txt')
  if (existsSync(nome)) return readFileSync(nome, 'utf8')
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) })
  if (!r.ok) throw new Error('original devolveu ' + r.status)
  const bruto = await r.text()
  writeFileSync(nome, bruto)
  return bruto
}
