// Tradução de sentido: o mesmo livro, na língua de hoje.
//
// Não é tradução de idioma. É pegar um texto em português de 1880 e deixá-lo
// legível para quem lê em 2026 — "elle disse que o pharmaceutico era um
// homem attento" vira "ele disse que o farmacêutico era um homem atento".
// Mesma frase, mesmo sentido, mesma ordem das palavras. Só a grafia e um
// punhado de palavras que saíram de uso.
//
// ─────────────────────────────────────────────────────────────
// ONDE ISTO PODE SER APLICADO, E ONDE NÃO PODE
//
// A máquina daqui é neutra: ela moderniza qualquer texto em português. O que
// decide se pode rodar é a PROCEDÊNCIA do texto, e são só dois casos:
//
//   PODE   texto que já é nosso ou de ninguém — as 4.409 obras legíveis do
//          acervo, todas domínio público, e as traduções que nós mesmos
//          fizermos do original.
//
//   NÃO    tradução comercial protegida. Modernizar a tradução da editora é
//          "quaisquer outras transformações" do art. 29, III, da Lei
//          9.610/98, que depende de autorização prévia e expressa. E o art.
//          15, § 1º diz na letra que rever e atualizar obra alheia NÃO
//          torna ninguém coautor — é o único artigo que fala em mexer em
//          texto existente, e ele fecha essa porta em vez de abrir.
//
// Por isso este arquivo não baixa nada. Ele recebe um `texto_id` que já está
// no acervo, e o acervo já sabe o direito de cada texto.
// ─────────────────────────────────────────────────────────────
//
// POR QUE É INSTANTÂNEO E DE GRAÇA
//
// Não há modelo, não há rede, não há chamada. São regras e uma lista. Um
// livro inteiro sai em menos de um segundo, e mil livros saem no tempo de ler
// o banco. A tradução de idioma precisa de máquina porque o sentido tem que
// ser recriado; aqui o sentido já está em português, e o que atrapalha é a
// casca.
//
// O preço é que regra não entende contexto. Onde a regra tem dúvida, ela não
// mexe: deixar "cousa" no lugar é um livro um pouco mais difícil, e trocar
// errado é um livro que mente.

// ─────────────────────────────────────────────────────────────
// 1. O s longo, que é defeito de digitalização e não de língua
//
// Edições anteriores ao século XIX imprimem "ſ" onde hoje se lê "s". O OCR
// preserva o caractere, e o leitor moderno lê "aſſim" sem entender por quê.
// ─────────────────────────────────────────────────────────────
const sLongo = (t) => t.replace(/ſ/g, 's')

// ─────────────────────────────────────────────────────────────
// 2. Palavras que a regra não acerta sozinha
//
// A maioria precisa de acento que a regra mecânica não sabe pôr: tirar o "ff"
// de "difficil" dá "dificil", que está ERRADO — a forma certa é "difícil".
// Grafia antiga é pelo menos honesta; grafia moderna errada é só erro.
//
// Por isso a lista vem ANTES das regras, e o que ela resolve as regras não
// tocam mais.
// ─────────────────────────────────────────────────────────────
const LISTA = {
  // pronomes e artigos, que são o que mais aparece
  elle: 'ele', elles: 'eles', ella: 'ela', ellas: 'elas',
  aquelle: 'aquele', aquelles: 'aqueles', aquella: 'aquela', aquellas: 'aquelas',
  daquelle: 'daquele', naquelle: 'naquele', aquillo: 'aquilo',

  // grafia com acento que a regra não põe
  difficil: 'difícil', difficeis: 'difíceis', facil: 'fácil',
  pharmaceutico: 'farmacêutico', pharmacia: 'farmácia',
  philosophia: 'filosofia', philosopho: 'filósofo', philosophico: 'filosófico',
  physica: 'física', physico: 'físico', psychologia: 'psicologia',
  chimica: 'química', chimico: 'químico', historia: 'história',
  sciencia: 'ciência', sciencias: 'ciências', consciencia: 'consciência',
  experiencia: 'experiência', intelligencia: 'inteligência',
  providencia: 'providência', differença: 'diferença', differente: 'diferente',
  officio: 'ofício', official: 'oficial', officina: 'oficina',
  espirito: 'espírito', proprio: 'próprio', propria: 'própria',
  ultimo: 'último', ultima: 'última', unico: 'único', unica: 'única',
  publico: 'público', publica: 'pública', musica: 'música',
  medico: 'médico', pratica: 'prática', politica: 'política',
  familia: 'família', memoria: 'memória', gloria: 'glória',
  silencio: 'silêncio', paciencia: 'paciência', violencia: 'violência',
  necessario: 'necessário', ordinario: 'ordinário', contrario: 'contrário',
  seculo: 'século', principio: 'princípio', dominio: 'domínio',
  theatro: 'teatro', theoria: 'teoria', thesouro: 'tesouro',
  authoridade: 'autoridade', author: 'autor', authora: 'autora',
  successo: 'sucesso', successivo: 'sucessivo', necessidade: 'necessidade',
  commum: 'comum', communs: 'comuns', commercio: 'comércio',
  immenso: 'imenso', immediato: 'imediato', innocente: 'inocente',
  attenção: 'atenção', attento: 'atento', affecto: 'afeto',
  effeito: 'efeito', official_: 'oficial', addicionar: 'adicionar',

  // consoante muda, que caiu no acordo de 1943
  director: 'diretor', directora: 'diretora', direcção: 'direção',
  acto: 'ato', actos: 'atos', activo: 'ativo', actual: 'atual',
  actualmente: 'atualmente', actor: 'ator', actriz: 'atriz',
  facto: 'fato', factos: 'fatos', objecto: 'objeto', objectivo: 'objetivo',
  perfeito: 'perfeito', respectivo: 'respectivo', collecção: 'coleção',
  secção: 'seção', selecção: 'seleção', correcto: 'correto',
  exacto: 'exato', exactamente: 'exatamente', contacto: 'contato',
  adopção: 'adoção', adoptar: 'adotar', baptismo: 'batismo',
  optimo: 'ótimo', optima: 'ótima', subtil: 'sutil',

  // palavras que simplesmente saíram de uso
  cousa: 'coisa', cousas: 'coisas', hontem: 'ontem', hombro: 'ombro',
  hombros: 'ombros', assucar: 'açúcar', quaes: 'quais', taes: 'tais',
  aquem: 'aquém', alem: 'além', porém: 'porém', comtudo: 'contudo',
  emquanto: 'enquanto', comsigo: 'consigo', tambem: 'também',
  ninguem: 'ninguém', alguem: 'alguém', armazem: 'armazém',
  refem: 'refém', vintem: 'vintém', parabens: 'parabéns',
}

// ─────────────────────────────────────────────────────────────
// 3. As regras, para o que a lista não cobre
//
// Só as que não têm exceção em português moderno. Onde há dúvida, não entra.
// ─────────────────────────────────────────────────────────────
const REGRAS = [
  // Apóstrofo de contração, que o século XIX usava e hoje se escreve junto:
  // "d'este" → "deste", "n'aquelle" → "naquele".
  [/([dnDN])'(?=[aeiouáéíóúâêôãõAEIOU])/g, '$1'],

  // "ph" é sempre "f". Não existe "ph" no português de hoje.
  [/ph/g, 'f'], [/Ph/g, 'F'], [/PH/g, 'F'],

  // "th" é sempre "t", pelo mesmo motivo.
  [/th/g, 't'], [/Th/g, 'T'],
]

// ─────────────────────────────────────────────────────────────
// A consoante dobrada, e por que ela só roda em palavra minúscula
//
// Em português moderno SÓ "rr" e "ss" dobram; as outras vieram do latim e
// caíram. "anno" → "ano", "bella" → "bela", "fallar" → "falar".
//
// Só que nome próprio não seguiu reforma ortográfica nenhuma. Aplicada sem
// cuidado, esta regra transforma Hobbes em "Hobes", Cromwell em "Cromwel",
// Rossetti em "Rosseti" e Villa-Lobos em "Vila-Lobos" — estraga exatamente
// os nomes por onde alguém procuraria o livro depois. Conferido: os quatro
// quebravam.
//
// Palavra que começa com maiúscula fica de fora. Perde-se "Lettras" quando
// ela abre a frase; salva-se todo nome próprio do acervo. É a troca certa,
// porque grafia antiga é honesta e nome próprio errado é defeito.
// ─────────────────────────────────────────────────────────────
const SO_MINUSCULA = /(?<!\p{L})\p{Ll}+(?!\p{L})/gu
const desdobrar = (t) => t.replace(SO_MINUSCULA, (palavra) =>
  palavra.replace(/([bcdfgjklmnpqtvxz])\1/g, '$1'))

/** Preserva a caixa do original ao trocar a palavra. */
function comAMesmaCaixa(original, nova) {
  if (original === original.toUpperCase() && original.length > 1) return nova.toUpperCase()
  if (original[0] === original[0].toUpperCase()) return nova[0].toUpperCase() + nova.slice(1)
  return nova
}

// Montada uma vez. `\p{L}` porque `\b` do JavaScript é ASCII e não reconhece
// "ç" nem vogal acentuada como letra — sem isto, "attenção" escapa.
let deLista = null
function pelaLista(t) {
  deLista ??= new RegExp(
    `(?<![\\p{L}])(${Object.keys(LISTA).filter((k) => !k.endsWith('_')).join('|')})(?![\\p{L}])`,
    'giu')
  return t.replace(deLista, (achado) => {
    const nova = LISTA[achado.toLowerCase()]
    return nova ? comAMesmaCaixa(achado, nova) : achado
  })
}

/**
 * O texto de hoje.
 *
 * A ordem importa: o s longo primeiro, porque "aſſim" tem que virar "assim"
 * antes de qualquer regra olhar para as consoantes dobradas; a lista depois,
 * porque ela é a única que sabe pôr acento; e as regras por último, no que
 * sobrou.
 *
 * Marcação HTML passa intacta: as regras só rodam no texto entre as tags.
 */
export function modernizar(html) {
  return String(html ?? '').replace(/(<[^>]*>)|([^<]+)/g, (todo, tag, texto) => {
    if (tag) return tag
    let t = sLongo(texto)
    t = pelaLista(t)
    for (const [de, para] of REGRAS) t = t.replace(de, para)
    return desdobrar(t)
  })
}

/** Quanto este texto ganharia — para decidir se vale gravar uma versão nova. */
export function quantoMuda(html) {
  const antes = String(html ?? '')
  const depois = modernizar(antes)
  if (antes === depois) return { mudou: 0, proporcao: 0 }
  const palavrasAntes = antes.split(/\s+/)
  const palavrasDepois = depois.split(/\s+/)
  let mudou = 0
  for (let i = 0; i < palavrasAntes.length; i++) {
    if (palavrasAntes[i] !== palavrasDepois[i]) mudou++
  }
  return { mudou, proporcao: mudou / Math.max(palavrasAntes.length, 1) }
}
