// Que língua este texto está, medida no texto e não no rótulo.
//
//   node ingestao/conferir-idioma.mjs --banco /dados/catalogo.db
//   node ingestao/conferir-idioma.mjs --banco /dados/catalogo.db --corrigir
//
// Existe por causa do Othello, e a primeira versão deste arquivo quase estragou
// o catálogo. Vale contar as duas coisas, porque a segunda é a lição.
//
// ─────────────────────────────────────────────────────────────
// POR QUE SE MEDE EM FATIAS, E NÃO NO LIVRO INTEIRO
//
// A primeira versão juntava os três primeiros capítulos num bolo, media o bolo
// e dizia uma língua. Acusou 7 textos de rótulo errado. Olhados um a um, cinco
// estavam certos: eram livros portugueses cujas primeiras páginas são um
// prefácio em francês, uma dedicatória latina, uma carta de um editor
// estrangeiro. O "Cancioneiro chinez" é português e abre com um prefácio do
// General Tcheng-Ki-Tong, em francês. Trocar o rótulo dele teria tirado um
// livro português da prateleira portuguesa.
//
// O começo de um livro é justamente o lugar onde ele menos fala a própria
// língua. Medir o bolo esconde isso; medir em fatias mostra.
//
// E fatiar achou o que o bolo não achava: "Uma História de Cachorro", do Mark
// Twain, começa em português — "Meu pai era um São-Bernardo, minha mãe era uma
// Collie" — e no meio vira inglês e não volta mais. É uma tradução abandonada
// no meio do caminho. Como um livro só, com rótulo `pt`, ela passa por legível.
// Quem abre lê um parágrafo em português e cai no original.
//
// São três estados, e não dois:
//   coerente   — o livro todo fala a língua do rótulo
//   rótulo errado — o livro todo fala OUTRA língua
//   mistura    — ele troca no meio, e aí nenhum rótulo está certo
//
// Só o segundo se corrige sozinho. O terceiro é defeito de texto, e mudar o
// rótulo dele seria trocar uma mentira por outra.
// ─────────────────────────────────────────────────────────────
//
// COMO SE MEDE CADA FATIA
//
// Por palavra de função — artigo, preposição, conjunção. São as palavras que
// ninguém escolhe: o assunto muda o vocabulário todo, mas "que", "de" e "não"
// aparecem na mesma proporção num romance e num tratado.
//
// O espanhol é o vizinho perigoso: "que", "de", "la", "el" servem aos dois. Os
// termos que separam de verdade são os que o português tem e o espanhol não —
// "não" contra "no", "são" contra "son" — e por isso eles pesam três vezes.

import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

// Peso 3 nas marcas que uma língua tem e as vizinhas não têm.
const MARCAS = {
  pt: { 1: ['que', 'de', 'da', 'do', 'em', 'para', 'com', 'uma', 'os', 'as', 'ele', 'ela', 'seu', 'sua', 'mas', 'como', 'foi', 'ao'],
    3: ['não', 'são', 'então', 'também', 'já', 'muito', 'nós', 'você', 'está', 'até', 'depois', 'porque', 'assim', 'ainda', 'senhor'] },
  en: { 1: ['the', 'and', 'of', 'to', 'in', 'that', 'it', 'is', 'was', 'for', 'with', 'as', 'his', 'her', 'they', 'at', 'but', 'from'],
    3: ['which', 'their', 'would', 'there', 'about', 'these', 'should', 'through', 'been', 'were', 'said', 'upon', 'shall'] },
  es: { 1: ['que', 'de', 'la', 'el', 'en', 'los', 'las', 'con', 'una', 'su', 'por', 'para', 'como'],
    3: ['pero', 'muy', 'cuando', 'entonces', 'después', 'porque', 'está', 'así', 'hacia', 'señor', 'más'] },
  fr: { 1: ['le', 'la', 'les', 'de', 'des', 'et', 'un', 'une', 'que', 'qui', 'dans', 'pour', 'est', 'en'],
    3: ['pas', 'plus', 'cette', 'vous', 'nous', 'était', 'avec', 'mais', 'tout', 'comme', 'monsieur'] },
  de: { 1: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'zu', 'in', 'den', 'dem', 'von', 'mit'],
    3: ['nicht', 'sich', 'auch', 'aber', 'noch', 'wenn', 'werden', 'einem', 'durch', 'über'] },
  it: { 1: ['di', 'che', 'il', 'la', 'le', 'un', 'una', 'per', 'con', 'del', 'della', 'in'],
    3: ['non', 'più', 'come', 'anche', 'quando', 'perché', 'questo', 'essere', 'aveva', 'signore'] },
  la: { 1: ['et', 'in', 'est', 'ad', 'cum', 'non', 'qui', 'quod', 'ut', 'sed', 'ex', 'de'],
    3: ['enim', 'autem', 'atque', 'sunt', 'esse', 'ipse', 'nobis', 'quae', 'quibus', 'omnia'] },
}

const INDICE = Object.fromEntries(Object.entries(MARCAS).map(([nome, pesos]) => {
  const m = new Map()
  for (const [peso, palavras] of Object.entries(pesos)) for (const p of palavras) m.set(p, Number(peso))
  return [nome, m]
}))

export const semTags = (html) => String(html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')

const PALAVRAS_POR_FATIA = 400
const MINIMO = 150

/** A língua de uma fatia, e o quanto ela ganhou da segunda colocada. */
export function lingua(amostra) {
  const palavras = amostra.toLowerCase().match(/[\p{L}]+/gu) ?? []
  if (palavras.length < MINIMO) return { lingua: null, porque: `curta (${palavras.length} palavras)` }

  const pontos = {}
  for (const [nome, marcas] of Object.entries(INDICE)) {
    let p = 0
    for (const w of palavras) p += marcas.get(w) ?? 0
    pontos[nome] = p / palavras.length
  }
  const [primeira, segunda] = Object.entries(pontos).sort((a, b) => b[1] - a[1])
  return {
    lingua: primeira[0],
    vantagem: segunda[1] > 0 ? primeira[1] / segunda[1] : Infinity,
    palavras: palavras.length,
  }
}

/**
 * O veredito sobre um livro inteiro, a partir das suas fatias.
 *
 * Uma fatia discordante não diz nada: é o prefácio, é a epígrafe, é a carta do
 * editor. O que importa é a MAIORIA, e o tamanho dela. Oito de dez fatias em
 * português com duas em francês é um livro português com prefácio francês —
 * exatamente o "Cancioneiro chinez". Cinco e cinco é outra coisa.
 */
export function vereditoDe(fatias, rotulo) {
  const boas = fatias.filter((f) => f.lingua)
  if (boas.length < 2) return { estado: 'pouco-texto', medido: boas[0]?.lingua ?? null, boas: boas.length }

  const conta = {}
  for (const f of boas) conta[f.lingua] = (conta[f.lingua] ?? 0) + 1
  const [vencedora, n] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0]
  const parte = n / boas.length

  // Menos de 4/5 de acordo é mistura: nem o rótulo atual nem outro qualquer
  // descreve o que está lá dentro.
  if (parte < 0.8) {
    return { estado: 'mistura', medido: vencedora, parte, conta, boas: boas.length }
  }
  if (vencedora === rotulo) return { estado: 'coerente', medido: vencedora, parte, conta, boas: boas.length }

  // ── a barra para MEXER, que é mais alta que a barra para SUSPEITAR ──
  //
  // Os dois números abaixo saíram de olhar sete casos na mão, e cada um
  // reprovou um jeito diferente de errar:
  //
  // 8 fatias, porque "Senhora, por vos lembrar" é uma cantiga medieval de duas
  // fatias — "a tristeza qu'em mym cabe" — e português do século XV pontua como
  // espanhol. Com texto curto não há o que desempate, e o veredito vira sorte.
  //
  // 9 de 10 de acordo, porque "Os jardins" é uma edição bilíngue: prólogo
  // português e o poema do Abbade Delille em francês por inteiro. Doze fatias
  // francesas contra duas portuguesas descrevem o livro corretamente e mesmo
  // assim a conclusão está errada — o livro é português, e o francês é o
  // original que ele carrega junto. O mesmo vale para os volumes de "Negócios
  // externos", que são atas portuguesas recheadas de correspondência francesa.
  //
  // Abaixo da barra não vira "coerente", vira "conferir à mão": continua
  // suspeito, só não se corrige sozinho.
  const firme = parte >= 0.9 && boas.length >= 8
  return {
    estado: firme ? 'rotulo-errado' : 'conferir-a-mao',
    medido: vencedora, parte, conta, boas: boas.length,
  }
}

if (process.argv[1]?.endsWith('conferir-idioma.mjs')) {
  const corrigir = process.argv.includes('--corrigir')
  const db = new DatabaseSync(arg('banco', 'dados/catalogo.db'), { readOnly: !corrigir })

  const textos = db.prepare(`
    SELECT t.id, t.obra_id, t.idioma, t.fonte, t.fonte_url, o.titulo
      FROM texto t JOIN obra o ON o.id = t.obra_id
     ORDER BY t.id`).all()

  // Capítulos espalhados pelo livro, e não os três primeiros. O teto de 12 é
  // para não ler 300 mil palavras de Karamázov só para saber que é português.
  const capsDe = db.prepare(
    'SELECT ordem, corpo FROM capitulo WHERE texto_id = ? ORDER BY ordem')

  console.log(`${textos.length} textos para conferir\n`)

  const balde = { coerente: [], 'rotulo-errado': [], 'conferir-a-mao': [], mistura: [], 'pouco-texto': [], vazio: [] }

  for (const t of textos) {
    const todos = capsDe.all(t.id)
    if (!todos.length) { balde.vazio.push(t); continue }

    const passo = Math.max(1, Math.ceil(todos.length / 12))
    const escolhidos = todos.filter((_, i) => i % passo === 0).slice(0, 12)
    const texto = escolhidos.map((c) => semTags(c.corpo)).join('\n').replace(/\s+/g, ' ')

    const palavras = texto.split(' ').filter(Boolean)
    const fatias = []
    for (let i = 0; i < palavras.length && fatias.length < 14; i += PALAVRAS_POR_FATIA) {
      fatias.push(lingua(palavras.slice(i, i + PALAVRAS_POR_FATIA).join(' ')))
    }

    const v = vereditoDe(fatias, t.idioma)
    balde[v.estado].push({ ...t, ...v, parte: v.parte ? Number(v.parte.toFixed(2)) : undefined })
  }

  for (const [estado, lista] of Object.entries(balde)) {
    console.log(`  ${estado.padEnd(14)} ${String(lista.length).padStart(5)}`)
  }

  const mostrar = (titulo, lista, quantos = 20) => {
    if (!lista.length) return
    console.log(`\n-- ${titulo} --`)
    for (const e of lista.slice(0, quantos)) {
      console.log(`  texto ${String(e.id).padStart(5)} obra ${String(e.obra_id).padStart(5)} ` +
        `${e.idioma}->${e.medido ?? '?'} ${String(e.parte ?? '').padStart(4)} ` +
        `${JSON.stringify(e.conta ?? {}).padEnd(22)} ${String(e.titulo).slice(0, 38)}`)
    }
    if (lista.length > quantos) console.log(`  ... e mais ${lista.length - quantos}`)
  }

  mostrar('rótulo errado: o livro TODO fala outra língua (corrige sozinho)', balde['rotulo-errado'], 40)
  mostrar('suspeito, mas abaixo da barra: conferir à mão', balde['conferir-a-mao'], 40)
  mostrar('mistura: o livro troca de língua no meio', balde.mistura, 40)

  const relatorio = `/tmp/idioma-${corrigir ? 'corrigido' : 'conferido'}.json`
  writeFileSync(relatorio, JSON.stringify({ feito_em: new Date().toISOString(), ...balde }, null, 1))
  console.log(`\nrelatório em ${relatorio}`)

  if (!corrigir) {
    console.log('\nnada foi mudado. para corrigir os de rótulo errado, acrescente --corrigir')
    console.log('as misturas NÃO se corrigem por rótulo — o texto é que está partido.')
  } else {
    // O relatório sai ANTES da transação e guarda o valor antigo de cada linha.
    // Se esta correção estiver errada, ele é o caminho de volta.
    db.exec('BEGIN')
    const mudar = db.prepare('UPDATE texto SET idioma = ? WHERE id = ?')
    for (const e of balde['rotulo-errado']) mudar.run(e.medido, e.id)
    db.exec('COMMIT')
    console.log(`\n${balde['rotulo-errado'].length} rótulos corrigidos.`)
    console.log(`o valor antigo de cada um está em ${relatorio}`)
  }
}
