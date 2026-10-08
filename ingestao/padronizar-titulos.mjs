// Títulos padronizados — PROPOSTA, nunca gravação (05/10/2026).
//
//   node ingestao/padronizar-titulos.mjs --catalogo catalogo.json --saida propostas.json
//
// O dono abriu o site e o Top 10 mostrava "Anno historico sul-rio-gran-dense
// em forma de ephemerides". Medido no catálogo inteiro: 1.056 de 5.192 títulos
// com algum sinal de defeito — ortografia de 1890, "Vol. 2 (of 2)" do
// Gutenberg, "(Portuguese Edition)" da Amazon, "-(EURO 11.97)" de planilha de
// livraria, subtítulo cortado em "..." pelo archive.org, TUDO EM MAIÚSCULA.
//
// O PADRÃO (um só, para o site inteiro):
//   - Título: subtítulo            dois-pontos e minúscula depois, como nas editoras
//   - Título — Volume 2            volume sempre assim, por extenso, algarismo arábico
//   - ortografia de hoje           "Chronica" → "Crônica", "Brazil" → "Brasil"
//   - sem preço, sem "(of 3)", sem "(Portuguese Edition)", sem ponto final,
//     sem subtítulo cortado no meio ("..." é sinal de que o resto se perdeu)
//   - maiúscula só na primeira letra e onde já havia; TUDO MAIÚSCULO vira normal
//
// Sai uma lista {id, antes, depois, regras}. Quem aplica é outro passo, depois
// de alguém ler a lista: título é a primeira coisa que o leitor vê.

import { readFileSync, writeFileSync } from 'node:fs'
import { modernizar } from './modernizar.mjs'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : p }

// O que o modernizador geral não pega em título, e que aparece muito aqui.
// Só palavra que a forma antiga determina sozinha (ver memória do glossário).
const ORTOGRAFIA = {
  brazil: 'Brasil', brazileiro: 'brasileiro', brazileira: 'brasileira', brazileiros: 'brasileiros', brazileiras: 'brasileiras',
  chronica: 'crônica', chronicas: 'crônicas', chronologia: 'cronologia', chronologica: 'cronológica',
  scena: 'cena', scenas: 'cenas', sciencia: 'ciência', sciencias: 'ciências', scientifico: 'científico',
  portuguez: 'português', portugueza: 'portuguesa', portuguezes: 'portugueses', portuguezas: 'portuguesas',
  historico: 'histórico', historica: 'histórica', historicos: 'históricos', historicas: 'históricas', historia: 'história',
  ephemerides: 'efemérides', efemerides: 'efemérides', geographia: 'geografia', geographica: 'geográfica',
  philosophia: 'filosofia', philosophico: 'filosófico', orthographia: 'ortografia', bibliographia: 'bibliografia',
  bibliotheca: 'biblioteca', theatro: 'teatro', thesouro: 'tesouro', rhetorica: 'retórica', pharmacia: 'farmácia',
  christo: 'Cristo', christão: 'cristão', christã: 'cristã', christianismo: 'cristianismo',
  memoria: 'memória', memorias: 'memórias', relatorio: 'relatório', relatorios: 'relatórios', noticia: 'notícia',
  poesias: 'poesias', poema: 'poema', contemporaneo: 'contemporâneo', contemporanea: 'contemporânea',
  provincia: 'província', provincias: 'províncias', agencia: 'agência', influencia: 'influência',
  civilisação: 'civilização', internacionaes: 'internacionais', nacionaes: 'nacionais', geraes: 'gerais',
  sessao: 'sessão', assemblea: 'assembleia', legislativa: 'legislativa', camara: 'câmara',
  annaes: 'anais', annos: 'anos', anno: 'ano', diario: 'diário', viagem: 'viagem', commercio: 'comércio',
  commentario: 'comentário', commentarios: 'comentários', exposicao: 'exposição', collecção: 'coleção', collecao: 'coleção',
  actos: 'atos', acto: 'ato', facto: 'fato', factos: 'fatos', author: 'autor', authores: 'autores',
  vida: 'vida', heygiene: 'higiene', hygiene: 'higiene', medico: 'médico', medicos: 'médicos',
}
// ─────────────────────────────────────────────────────────────
// CAIXA DE TÍTULO (05/10/2026, pedido do dono: "cara mais profissional")
//
// O padrão das editoras brasileiras: maiúscula em toda palavra que conta,
// minúscula nas palavrinhas que ligam ("Memórias Póstumas de Brás Cubas").
// A primeira palavra e a primeira depois de ":", "—", "(" ou fim de frase
// sempre sobem. O que já tem maiúscula DENTRO (SICAF, McDonald, D.C.N., XIV)
// fica como está: é sigla ou nome, e baixar estraga.
// ─────────────────────────────────────────────────────────────
const PEQUENAS = new Set(('a o as os ao aos à às á ás da das do dos de e em na nas no nos num numa nuns numas ' +
  'por pelo pela pelos pelas para com sem sob um uma uns umas ou que se nem entre após até contra desde perante sobre ' +
  'me te lhe lhes vos del el etc').split(' '))
const CLITICOS = new Set('me te se lhe lhes nos vos o a os as lo la los las no na nas'.split(' '))
const ROMANO_MINUSC = /^(?=[ivxl]{2,8}$)(x[cl]|l?x{0,3})(i[xv]|v?i{0,3})$/

function subir(w) { return w[0].toLocaleUpperCase('pt-BR') + w.slice(1) }

export function caixaDeTitulo(titulo) {
  let inicio = true
  return String(titulo).replace(/(\p{L}[\p{L}\p{M}'’-]*)|([^\p{L}]+)/gu, (todo, palavra, resto) => {
    if (resto !== undefined) {
      // ponto NÃO abre frase aqui: em título ele é quase sempre abreviatura
      // ("D. Diniz", "Illm.o", "Pe. Bartolomeu", "Edgar Allan Poe. Medo")
      // aspa de ABERTURA (logo antes da palavra) abre; a de fechamento não ('O "Menininho" do Presépio')
      if (/[:—–(!?;/\n]\s*$|\s-\s*$|(^|\s)["“«]$/.test(resto)) inicio = true
      return resto
    }
    const era = inicio
    inicio = false
    // sigla, nome com maiúscula no meio, romano já em caixa alta: não toca
    if (/\p{Lu}/u.test(palavra.slice(1))) return palavra
    // letra sozinha em maiúscula é inicial de nome ou abreviatura ("D.", "S.", "A.")
    if (palavra.length === 1 && palavra !== palavra.toLowerCase()) return palavra
    const partes = palavra.split(/([-'’])/)
    return partes.map((p, i) => {
      if (!p || /^[-'’]$/.test(p)) return p
      // depois de apóstrofo a palavra fica como veio ("N'esta", "d'Angola", "d'uma")
      if (partes[i - 1] === "'" || partes[i - 1] === '’') return p
      const baixa = p.toLocaleLowerCase('pt-BR')
      if (ROMANO_MINUSC.test(baixa) && !['vi', 'li', 'xi'].includes(baixa)) return baixa.toUpperCase()
      const primeira = era && i === 0
      // pronome preso por hífen fica em minúscula: "Dize-me", "Levanta-te", "Erguei-lhe"
      if (i > 0 && partes[i - 1] === '-' && CLITICOS.has(baixa)) return baixa
      // a parte ANTES do apóstrofo ("d'", "n'") também fica, salvo abrindo o título
      if (partes[i + 1] === "'" || partes[i + 1] === '’') return primeira ? subir(p) : p
      if (!primeira && PEQUENAS.has(baixa)) return baixa
      return subir(p)
    }).join('')
  })
}

/** Caracteres que não são de título nenhum, a não ser que o original os tenha de propósito. */
export function limparCaracteres(t) {
  // QUEBRA DE LINHA dentro do título. Duas coisas diferentes vêm assim: o
  // subtítulo posto embaixo ("Clepsydra↵Poêmas de Camillo Pessanha") e a
  // linha que só acabou no meio da frase ("Primeira origem da arte↵de
  // imprimir"). Vira ":" quando a linha de cima é curta (até 5 palavras),
  // não termina em pontuação e a de baixo abre com maiúscula ou número; no
  // resto, vira espaço.
  const linhas = String(t).split(/\s*\n+\s*/)
  let junto = linhas[0]
  for (const prox of linhas.slice(1)) {
    const curta = (junto.split(/[:;]/).pop().match(/\S+/g) ?? []).length <= 5
    const subtitulo = curta && !/[:;.!?,(]$/.test(junto) && /^[\p{Lu}\d]/u.test(prox)
    junto += (subtitulo ? ': ' : ' ') + prox
  }
  let s = junto
    .replace(/[′՚ʹ]/g, "'")                          // apóstrofos exóticos de OCR
    .replace(/\^/g, '')                               // "Illm.^o"
    .replace(/\s*\[?&c\.?\s*\]?\s*$/, ' etc.')        // "[&c" no fim
    .replace(/\s+([:;,])/g, '$1')                     // "gosto : resposta"
    .replace(/([:;])(?=\p{L})/gu, '$1 ')              // "Tradução:Relato"
    .replace(/_+/g, ' ')
  // acento solto que não formou letra (sobra de digitalização: "inquisiça︢︣o", "c̜")
  s = s.normalize('NFC').replace(/[︠-︯]/g, '').replace(/(?<=\p{L})\p{M}+/gu, '').normalize('NFC')
  // colchete ou parêntese sem par
  for (const [a, f] of [['[', ']'], ['(', ')']]) {
    const abre = s.split(a).length - 1, fecha = s.split(f).length - 1
    if (abre !== fecha) s = s.split(a).join('').split(f).join('')
  }
  return s.replace(/\s{2,}/g, ' ').trim()
}

export const SUBSTANTIVO_DE_TITULO = {
  historia: 'história', historias: 'histórias', memoria: 'memória', memorias: 'memórias',
  noticia: 'notícia', noticias: 'notícias', influencia: 'influência', catalogo: 'catálogo',
  ás: 'às', commercio: 'comércio', negocios: 'negócios', comedia: 'comédia', comedias: 'comédias',
  tragedia: 'tragédia', secretario: 'secretário', principios: 'princípios', exercicios: 'exercícios',
}
const comCaixa = (orig, nova) => (orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase()
  ? nova[0].toUpperCase() + nova.slice(1) : nova)

const ROMANO = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 }
const numVol = (s) => (/^\d+$/.test(s) ? String(Number(s)) : ROMANO[s.toLowerCase()] ? String(ROMANO[s.toLowerCase()]) : null)

// A forma de hoje de UMA palavra, pela lista e pelo modernizador. Quem decide
// se ela vale é o dicionário (padronizar recebe `valida`), nunca esta função.
const TOKEN = /\p{L}+(?:['’-]\p{L}+)*/gu
export function candidatoDe(w) {
  if (/['’]/.test(w)) return null           // d'el, d'um: apóstrofo é grafia viva, fica
  const daLista = ORTOGRAFIA[w.toLowerCase()]
  const c = daLista ? comCaixa(w, daLista) : modernizar(w)
  return c && c !== w ? c : null
}

/**
 * `valida(palavra)` diz se o dicionário pt-BR conhece a palavra. Com ela, a
 * ortografia só troca palavra DESCONHECIDA por uma CONHECIDA, e nunca mexe em
 * "celebre" (verbo), "Bebes", "Alias", "Cthulhu", "Mary". Sem ela, a
 * ortografia não roda: na amostra de 05/10 a regra cega errou 7 em 60, e
 * errar título é pior que deixá-lo antigo.
 */
// Título em outra língua: a ortografia portuguesa NÃO toca nele ("The Prince"
// virava "Te Prince", "Les Misérables" virava "Lés"). Ele precisa de
// tradução, que é decisão de gente. Só palavras que não existem em português
// contam — "das", "mais", "a", "de" são nossas também.
const SO_DE_FORA = new Set(('the of and with on for from to by is it my your his her this that in ' +
  'les du aux chez et une sur avec dans pour la le ' +
  'los las del y un una en con su sus ' +   // "por" e "el" (el-rei) são nossos também
  'der die und den dem ein eine mit von zu ist').split(' '))
export function emOutraLingua(titulo) {
  const t = String(titulo ?? '')
  if (/[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Arabic}\p{Script=Hebrew}]/u.test(t)) return true
  return (t.toLowerCase().match(/\p{L}+/gu) ?? []).some((w) => SO_DE_FORA.has(w))
}

/**
 * `glossario` = as decisões por PALAVRA já tomadas por quem revisa
 * ({"productos": "produtos", "archeologia": "arqueologia"}): valem para todo
 * título onde a palavra aparece, e vêm antes do dicionário.
 */
export function padronizar(titulo, { valida = null, glossario = null } = {}) {
  let t = String(titulo ?? '')
  const regras = []
  const passo = (nome, f) => { const n = f(t); if (n !== t) { regras.push(nome); t = n } }
  // acento gravado como caractere separado ("i" + "´"): igual na tela,
  // quebra a busca e o corretor. NFC junta, sem mudar nada que se veja.
  passo('unicode', (s) => s.normalize('NFC'))

  passo('lixo', (s) => s.replace(/&#\d+;?/g, '').replace(/\s*-?\(EURO [\d.,]+\)\s*/gi, ' ')
    .replace(/\s*\(Portuguese Edition\)/gi, '')
    // nota de catalogador em inglês grudada no título: "[ed. by I.F. da Silva]",
    // "[or rather, written]", "[With] Additamento", "[tr. by …"
    .replace(/\s*\[(?:[^\]]*?\b(?:ed\.|by|tr\.|with|or rather|title-leaf)\b[^\]]*)(?:\]|$)/gi, '').replace(/\s*\((?:[^()]*,\s*)?grafia de \d{4}\)/gi, ''))
  passo('volume', (s) => s
    // ":", "-" ou "[" antes do volume e "]" depois somem junto ("Portugal: Tomo I", "[Vol. I]")
    .replace(/\s*[:,\-–]?\s*[[(]?\b(?:vol(?:ume)?\.?|tomo)\s*([0-9]+|[ivxl]+)\b\.?(?:\s+of\s+\d+)?[\])]?(?:\s*\(of \d+\))?/gi, (m, n) => (numVol(n) ? ` — Volume ${numVol(n)}` : m))
    .replace(/\s*\(of \d+\)/gi, '')
    .replace(/\s*—\s*—\s*/g, ' — '))
  // só reticência com ESPAÇO antes é corte de catálogo ("Almanach ... para ...");
  // "Era uma vez...", "Antes que cases..." são o título, e ficam
  passo('subtítulo cortado', (s) => s.replace(/:\s[^:]*?\s(?:\.\.\.|…)\s*$/, '').replace(/\s+(?:\.\.\.|…)\s*$/, '').replace(/^\.\.\.\s*/, ''))
  passo('pontuação', (s) => s.replace(/\s*[.,]:/g, ':'))       // "Lucio,: Narrativa", "Alfonsíada.: Poema"
  // TUDO MAIÚSCULO só vira normal se for frase; sigla (SICAF, IS-RBHA) fica
  passo('maiúsculas', (s) => (/[a-zà-ú]/.test(s) || !/[A-ZÀ-Ú]{4,}/.test(s) || (s.match(/\p{L}{3,}/gu) ?? []).length < 3 ? s
    : s.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase())))
  // a língua é medida DEPOIS da limpeza: "(of 2)" fazia "O Guarany" parecer inglês
  const estrangeiro = emOutraLingua(t)
  if (!estrangeiro && glossario) passo('ortografia', (s) => s.replace(TOKEN, (w) => {
    const g = glossario[w.toLowerCase()]
    return g ? comCaixa(w, g) : w
  }))
  // A LISTA CURADA vale para qualquer caixa ("Chronica" → "Crônica", "Brazil" → "Brasil").
  if (!estrangeiro) passo('ortografia', (s) => s.replace(TOKEN, (w) => {
    const n = ORTOGRAFIA[w.toLowerCase()]
    return n ? comCaixa(w, n) : w
  }))
  // O DICIONÁRIO só vale para palavra em MINÚSCULA. Com maiúscula pode ser
  // nome — e a leitura de 05/10 achou "Allan→Alan", "Collor de Mello→Melo",
  // "Epicteto→Epíteto", "Miss Dollar→Dólar", "Anna→Ana". Nome só muda pela
  // lista curada ou pelo glossário, palavra aprovada uma a uma.
  if (!estrangeiro && valida) passo('ortografia', (s) => s.replace(TOKEN, (w) => {
    if (w[0] !== w[0].toLowerCase() || valida(w)) return w
    const c = candidatoDe(w)
    return c && valida(c) ? c : w
  }))
  // Em TÍTULO estas são sempre o substantivo, nunca o verbo que o dicionário
  // também aceita ("historia" = ele historia; "Historia de Portugal" = História).
  // "Ás" com maiúscula pode ser a carta ("Ás de Copas"); só o "ás" minúsculo é crase
  if (!estrangeiro) passo('ortografia', (s) => s.replace(TOKEN, (w) => { const n = w !== 'Ás' && SUBSTANTIVO_DE_TITULO[w.toLowerCase()]; return n ? comCaixa(w, n) : w }))
  // ponto final sai, MENOS de abreviatura ("G.H.", "A.C.M.", "etc.", "A. A.");
  // travessão e reticência do fim são do título ("Só socialmente--")
  passo('pontuação', (s) => {
    s = s.replace(/[\s,;:]+$/, '')
    // abreviatura = letra SOZINHA antes do ponto ("G.H.", "A. A.") ou "etc."
    const abreviatura = /(?:^|[\s.])\p{L}\.$/u.test(s) || /\betc\.$/i.test(s)
    if (!abreviatura && !/\.\.\.$/.test(s)) s = s.replace(/\.$/, '')
    return s.replace(/\s{2,}/g, ' ').trim()
  })
  passo('primeira letra', (s) => s.replace(/^\p{Ll}/u, (c) => c.toUpperCase()))
  return { depois: t, regras: [...new Set(regras)] }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('padronizar-titulos.mjs')) {
  const { obras } = JSON.parse(readFileSync(arg('catalogo'), 'utf8'))
  const propostas = []
  for (const o of obras) {
    const { depois, regras } = padronizar(o.titulo)
    if (depois !== o.titulo) propostas.push({ id: o.id, autor: o.autor, antes: o.titulo, depois, regras })
  }
  writeFileSync(arg('saida', 'propostas-titulos.json'), JSON.stringify(propostas, null, 1))
  const por = {}
  for (const p of propostas) for (const r of p.regras) por[r] = (por[r] ?? 0) + 1
  console.log(`${propostas.length} de ${obras.length} títulos mudariam`, JSON.stringify(por))
}
