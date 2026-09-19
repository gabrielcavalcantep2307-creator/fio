// Mangá, manhwa e manhua modernos: o catálogo de descoberta.
//
// ─────────────────────────────────────────────────────────────
// O QUE ISTO É, E O QUE NÃO É
//
// Mangá, manhwa e manhua modernos têm dono (autor e editora), então o Fio NÃO
// hospeda página nenhuma deles. O que o Fio faz é ajudar a ACHAR — filtrar por
// tipo, cor, gênero, status — e mandar para onde se lê OFICIALMENTE, muitas
// vezes de graça e em português (o MANGA Plus publica em português, por
// exemplo). Ler dentro do Fio continua sendo só o que é livre (quadrinhos.mjs).
//
// Os dados vêm do AniList, CONSULTADO NA HORA. Os termos da API
// (docs.anilist.co/guide/terms-of-use) liberam uso não comercial e proíbem
// "coleta em massa" e usar a API como armazenamento. Por isso não há cópia do
// catálogo aqui: cada filtro vira uma consulta, com cache curto na memória
// (30 min) e um teto de chamadas por minuto, e o crédito aparece na tela.
//
// As capas passam pelo nosso servidor (`/api/capa-manga/...`): o navegador do
// leitor não conversa com terceiros, e a CSP continua `img-src 'self'`. O
// proxy só aceita o caminho de capa de mangá do CDN do AniList — sem isso, ele
// viraria uma ferramenta para o servidor buscar qualquer endereço (SSRF).
// ─────────────────────────────────────────────────────────────

const API = 'https://graphql.anilist.co'
const CDN = 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/'
const UA = 'fio-biblioteca/1.0 (uso nao comercial; fiolib.com.br)'

// ── listas fechadas: nada do que o leitor digita entra cru na consulta ──
export const TIPOS = { todos: null, manga: 'JP', manhwa: 'KR', manhua: 'CN' }
export const ORDENS = {
  populares: ['POPULARITY_DESC'], alta: ['TRENDING_DESC', 'POPULARITY_DESC'],
  nota: ['SCORE_DESC'], novos: ['START_DATE_DESC'],
}
// Época: o dono quer o que saiu de 2010 para cá (18/09), e esse é o padrão.
export const EPOCAS = { 2010: 20100000, 2015: 20150000, 2020: 20200000, todas: null }
export const STATUS = { todos: null, lancando: 'RELEASING', finalizado: 'FINISHED', hiato: 'HIATUS' }
export const GENEROS = {
  Action: 'Ação', Adventure: 'Aventura', Comedy: 'Comédia', Drama: 'Drama', Fantasy: 'Fantasia',
  Horror: 'Terror', 'Mahou Shoujo': 'Garotas mágicas', Mecha: 'Mecha', Music: 'Música',
  Mystery: 'Mistério', Psychological: 'Psicológico', Romance: 'Romance', 'Sci-Fi': 'Ficção científica',
  'Slice of Life': 'Cotidiano', Sports: 'Esportes', Supernatural: 'Sobrenatural', Thriller: 'Suspense',
}
const TAGS = {
  Isekai: 'Isekai', Reincarnation: 'Reencarnação', 'Martial Arts': 'Artes marciais', Revenge: 'Vingança',
  Magic: 'Magia', Swordplay: 'Espadas', Villainess: 'Vilã', 'Time Manipulation': 'Tempo', Survival: 'Sobrevivência',
  Dungeon: 'Masmorra', 'Video Games': 'Games', Zombie: 'Zumbis', Vampire: 'Vampiros', Demons: 'Demônios',
  Samurai: 'Samurai', Ninja: 'Ninja', School: 'Escola', Military: 'Militar', Detective: 'Detetive',
  Tragedy: 'Tragédia', 'Anti-Hero': 'Anti-herói', 'Female Protagonist': 'Protagonista mulher',
  'Male Protagonist': 'Protagonista homem', Politics: 'Política', Historical: 'Histórico', Medicine: 'Medicina',
  'Post-Apocalyptic': 'Pós-apocalíptico', Monster: 'Monstros', 'Super Power': 'Superpoderes', Cooking: 'Culinária',
  Mythology: 'Mitologia', 'Full Color': 'Colorido', Gore: 'Violento', Crime: 'Crime', Space: 'Espaço',
  Cyberpunk: 'Cyberpunk', Gods: 'Deuses', 'Kingdom Management': 'Reinos', 'Primarily Adult Cast': 'Elenco adulto',
}
const IDIOMAS = {
  Portuguese: 'Português', English: 'Inglês', Spanish: 'Espanhol', Japanese: 'Japonês', Korean: 'Coreano',
  Chinese: 'Chinês', French: 'Francês', German: 'Alemão', Italian: 'Italiano', Indonesian: 'Indonésio',
  Thai: 'Tailandês', Vietnamese: 'Vietnamita', Russian: 'Russo', Arabic: 'Árabe',
}
const SITES_SOCIAIS = /^(twitter|x|instagram|facebook|youtube|tiktok|bluesky|threads|discord|reddit|pixiv|weibo|line)$/i

// ── a consulta ──
const CAMPOS = `id title{romaji english native} format countryOfOrigin status startDate{year} chapters volumes
  genres averageScore popularity isAdult tags{name rank isMediaSpoiler} coverImage{large color}
  externalLinks{site url type language}`

// A consulta da lista é MONTADA com só os filtros escolhidos. No AniList, uma
// variável enviada como null não é "sem filtro": vira "campo vazio" e zera a
// lista (16/09 — "populares" voltava com 0 títulos). Então argumento sem valor
// simplesmente não entra na consulta.
const ARGUMENTOS = {
  sort: ['[MediaSort]', 'sort'], country: ['CountryCode', 'countryOfOrigin'], genre: ['[String]', 'genre_in'],
  tagIn: ['[String]', 'tag_in'], tagNotIn: ['[String]', 'tag_not_in'], status: ['MediaStatus', 'status'], search: ['String', 'search'],
  desde: ['FuzzyDateInt', 'startDate_greater'],
}
function consultaDaLista(variaveis) {
  const usadas = Object.entries(variaveis).filter(([k, v]) => ARGUMENTOS[k] && v != null)
  const declara = ['$page:Int', ...usadas.map(([k]) => `$${k}:${ARGUMENTOS[k][0]}`)].join(',')
  const filtra = usadas.map(([k]) => `${ARGUMENTOS[k][1]}:$${k}`).join(',')
  return {
    query: `query(${declara}){Page(page:$page,perPage:30){pageInfo{hasNextPage currentPage}
      media(type:MANGA,isAdult:false,format_in:[MANGA,ONE_SHOT],genre_not_in:["Ecchi","Hentai"]${filtra ? ',' + filtra : ''}){${CAMPOS}}}}`,
    variables: Object.fromEntries(usadas),
  }
}

const Q_DETALHE = `query($id:Int){Media(id:$id,type:MANGA,isAdult:false){${CAMPOS}
  description(asHtml:false) siteUrl
  staff(perPage:4,sort:RELEVANCE){edges{role node{name{full}}}}
  recommendations(perPage:12,sort:RATING_DESC){nodes{mediaRecommendation{id isAdult genres title{romaji english} coverImage{large} countryOfOrigin format}}}}}`

/** Erro que pode ir para a tela. */
export class ErroManga extends Error { constructor(m, status) { super(m); this.status = status; this.publica = true } }

// ── cache e teto de chamadas ──
const cache = new Map() // chave → { em, valor }
const TTL = 30 * 60000
const chamadas = []     // instantes das últimas chamadas ao AniList
const TETO_POR_MINUTO = 25

async function consultar(query, variables) {
  const chave = JSON.stringify([query, variables])
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.em < TTL) return guardado.valor

  const agora = Date.now()
  while (chamadas.length && agora - chamadas[0] > 60000) chamadas.shift()
  if (chamadas.length >= TETO_POR_MINUTO) {
    if (guardado) return guardado.valor // melhor velho que nada
    throw new ErroManga('Muita gente procurando agora. Tente de novo em um minuto.', 503)
  }
  chamadas.push(agora)

  let r
  try {
    r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    if (guardado) return guardado.valor
    throw new ErroManga('O catálogo de mangás não respondeu. Tente de novo.', 502)
  }
  if (r.status === 404) return null
  if (!r.ok) {
    if (guardado) return guardado.valor
    throw new ErroManga(r.status === 429 ? 'Muita gente procurando agora. Tente de novo em um minuto.' : 'O catálogo de mangás não respondeu.', r.status === 429 ? 503 : 502)
  }
  const valor = (await r.json()).data
  if (cache.size > 800) cache.delete(cache.keys().next().value)
  cache.set(chave, { em: Date.now(), valor })
  return valor
}

// ── tradução dos campos para o que a tela usa ──
const TIPO_DO_PAIS = { JP: 'mangá', KR: 'manhwa', CN: 'manhua', TW: 'manhua' }
const STATUS_PT = { RELEASING: 'em lançamento', FINISHED: 'finalizado', HIATUS: 'em hiato', CANCELLED: 'cancelado', NOT_YET_RELEASED: 'ainda não lançado' }

export function capaLocal(url) {
  const m = String(url ?? '').match(/^https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/manga\/cover\/(medium|large)\/([\w.-]+\.(?:jpe?g|png|webp))$/i)
  return m ? `/api/capa-manga/${m[1]}/${m[2]}` : null
}

function links(externos = []) {
  const vistos = new Set()
  return externos
    .filter((l) => l?.url && /^https:\/\//i.test(l.url) && !SITES_SOCIAIS.test(String(l.site).trim()) && l.type !== 'SOCIAL')
    .map((l) => ({ site: String(l.site), url: String(l.url), idioma: IDIOMAS[l.language] ?? (l.language ? String(l.language) : null), pt: l.language === 'Portuguese' }))
    .filter((l) => { const k = l.url.replace(/\/+$/, ''); if (vistos.has(k)) return false; vistos.add(k); return true })
    .sort((a, b) => (b.pt - a.pt) || String(a.idioma).localeCompare(String(b.idioma)))
}

export function mapear(m) {
  const tags = (m.tags ?? []).filter((t) => !t.isMediaSpoiler && t.rank >= 50)
  const ondeLer = links(m.externalLinks)
  return {
    id: m.id,
    titulo: m.title?.english || m.title?.romaji || m.title?.native,
    original: m.title?.native ?? null,
    romaji: m.title?.romaji ?? null,
    tipo: m.format === 'ONE_SHOT' ? 'one-shot' : (TIPO_DO_PAIS[m.countryOfOrigin] ?? 'quadrinho'),
    pais: m.countryOfOrigin,
    colorido: (m.tags ?? []).some((t) => t.name === 'Full Color'),
    // mangá japonês se lê da direita para a esquerda; manhwa e manhua, não
    sentido: m.countryOfOrigin === 'JP' ? 'rtl' : 'ltr',
    status: STATUS_PT[m.status] ?? null,
    ano: m.startDate?.year ?? null,
    capitulos: m.chapters ?? null,
    volumes: m.volumes ?? null,
    nota: m.averageScore ?? null,
    popularidade: m.popularity ?? 0,
    generos: (m.genres ?? []).map((g) => GENEROS[g]).filter(Boolean),
    temas: tags.map((t) => TAGS[t.name]).filter((t) => t && t !== 'Colorido').slice(0, 8),
    capa: capaLocal(m.coverImage?.large),
    cor: /^#[0-9a-f]{6}$/i.test(m.coverImage?.color ?? '') ? m.coverImage.color : null,
    emPortugues: ondeLer.some((l) => l.pt),
    ondeLer,
  }
}

/** Traduz a query string da tela em variáveis seguras para o AniList. */
export function filtros(busca) {
  const pega = (k) => String(busca?.get?.(k) ?? '').trim()
  const tipo = Object.hasOwn(TIPOS, pega('tipo')) ? pega('tipo') : 'todos'
  const ordem = Object.hasOwn(ORDENS, pega('ordem')) ? pega('ordem') : 'populares'
  const status = Object.hasOwn(STATUS, pega('status')) ? pega('status') : 'todos'
  const genero = Object.hasOwn(GENEROS, pega('genero')) ? pega('genero') : null
  const cor = ['colorido', 'pb'].includes(pega('cor')) ? pega('cor') : 'todos'
  const q = pega('q').replace(/[^\p{L}\p{N}\s:'!?.,&-]/gu, '').slice(0, 60)
  const pagina = Math.min(200, Math.max(1, Number.parseInt(pega('pagina'), 10) || 1))
  const pt = pega('pt') === '1'
  const epoca = Object.hasOwn(EPOCAS, pega('desde')) ? pega('desde') : '2010'
  return {
    pt, pagina,
    variaveis: {
      sort: q ? ['SEARCH_MATCH', ...ORDENS[ordem]] : ORDENS[ordem],
      country: TIPOS[tipo],
      genre: genero ? [genero] : null,
      tagIn: cor === 'colorido' ? ['Full Color'] : null,
      tagNotIn: cor === 'pb' ? ['Full Color'] : null,
      status: STATUS[status],
      search: q || null,
      // quem busca pelo nome acha em qualquer época
      desde: q ? null : EPOCAS[epoca],
    },
  }
}

export async function listar(busca) {
  const { pt, pagina, variaveis } = filtros(busca)
  // "só com versão oficial em português" não existe como filtro no AniList:
  // filtra-se aqui, andando algumas páginas até juntar resultado suficiente.
  let page = pagina, temMais = true
  const obras = []
  for (let voltas = 0; voltas < (pt ? 4 : 1) && temMais; voltas++) {
    const { query, variables } = consultaDaLista(variaveis)
    const d = await consultar(query, { ...variables, page })
    const itens = (d?.Page?.media ?? []).filter((m) => !m.isAdult).map(mapear)
    obras.push(...(pt ? itens.filter((o) => o.emPortugues) : itens))
    temMais = Boolean(d?.Page?.pageInfo?.hasNextPage)
    page++
    if (obras.length >= 18) break
  }
  return { obras, proximaPagina: temMais ? page : null, fonte: 'AniList' }
}

export async function detalhe(id) {
  const d = await consultar(Q_DETALHE, { id })
  const m = d?.Media
  if (!m || m.isAdult) throw new ErroManga('Não achei este título.', 404)
  const base = mapear(m)
  return {
    ...base,
    // Sinopse do AniList, em inglês: vai como texto, com crédito, e cortada.
    sinopse: String(m.description ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500) || null,
    autores: (m.staff?.edges ?? []).map((e) => ({ nome: e.node?.name?.full, papel: e.role })).filter((a) => a.nome),
    parecidos: (m.recommendations?.nodes ?? []).map((n) => n.mediaRecommendation)
      .filter((r) => r && !r.isAdult && !(r.genres ?? []).includes('Ecchi') && !(r.genres ?? []).includes('Hentai'))
      .map((r) => ({ id: r.id, titulo: r.title?.english || r.title?.romaji, capa: capaLocal(r.coverImage?.large), tipo: TIPO_DO_PAIS[r.countryOfOrigin] ?? 'quadrinho' })),
    anilist: `https://anilist.co/manga/${m.id}`,
    fonte: 'AniList',
  }
}

// As últimas capas pedidas ficam na memória (até ~40 MB): uma estante de 30
// capas rolada por dez pessoas não vira trezentas idas ao CDN.
const capas = new Map()
let bytesEmCache = 0

/** O proxy das capas. Só o caminho de capa de mangá do CDN do AniList. */
export async function servirCapa(res, tamanho, arquivo) {
  if (!['medium', 'large'].includes(tamanho) || !/^[\w.-]+\.(?:jpe?g|png|webp)$/i.test(arquivo)) {
    throw new ErroManga('Não existe.', 404)
  }
  const chave = `${tamanho}/${arquivo}`
  let achada = capas.get(chave)
  if (!achada) {
    let r
    try {
      r = await fetch(CDN + chave, { headers: { 'user-agent': UA }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    } catch { throw new ErroManga('Capa indisponível.', 502) }
    const tipo = r.headers.get('content-type') ?? ''
    if (!r.ok || !/^image\/(jpeg|png|webp)$/i.test(tipo)) throw new ErroManga('Capa indisponível.', 404)
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length > 2 * 1024 * 1024) throw new ErroManga('Capa indisponível.', 502)
    achada = { tipo, bytes }
    capas.set(chave, achada); bytesEmCache += bytes.length
    while (bytesEmCache > 40 * 1024 * 1024 && capas.size) {
      const [velha, v] = capas.entries().next().value
      capas.delete(velha); bytesEmCache -= v.bytes.length
    }
  }
  const { tipo, bytes } = achada
  res.writeHead(200, {
    'content-type': tipo, 'content-length': bytes.length,
    'cache-control': 'public, max-age=604800, immutable', 'x-content-type-options': 'nosniff',
  })
  res.end(bytes)
}
