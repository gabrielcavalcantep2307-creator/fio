// Quadrinhos, mangá e manhwa: duas estantes numa página.
//
//   DESCOBRIR — o catálogo moderno (mangá, manhwa, manhua), com filtros, vindo
//               do AniList pelo nosso servidor (/api/mangas). O Fio não hospeda
//               essas obras: a ficha manda para onde se lê oficialmente.
//   LER AQUI  — o que é livre e mora no Fio (/dados/quadrinhos.json), com o
//               leitor próprio (quadrinho.html).
//
// Todo texto entra por nó de texto. Link externo só se for https, e capa de
// mangá só pelo caminho do nosso proxy.

const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v != null && v !== false) e.setAttribute(k, v)
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
  return e
}
const lerProgresso = () => { try { return JSON.parse(localStorage.getItem('fio:quadrinhos') || '{}') } catch { return {} } }

const main = document.getElementById('main')

// Progresso da conta chega aqui antes de desenhar "continuar lendo" (17/09).
const progressoDaConta = fetch('/api/quadrinhos/progresso', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null)).then((r) => {
    if (!r?.series) return
    window.fioDono?.conferir(r.dono) // dados de outra conta saem antes de misturar
    const todos = lerProgresso()
    for (const s of r.series) if (!todos[s.serie] || (todos[s.serie].em ?? 0) < s.em) todos[s.serie] = { cap: s.cap, pag: s.pag, lidos: s.lidos, em: s.em }
    try { localStorage.setItem('fio:quadrinhos', JSON.stringify(todos)) } catch {}
  }).catch(() => {})

/** A prateleira "Continuar lendo": as séries com leitura em curso, a mais recente primeiro. */
async function prateleiraContinuar() {
  await progressoDaConta
  const todos = lerProgresso()
  const emCurso = Object.entries(todos).filter(([, p]) => p?.cap).sort((a, b) => (b[1].em ?? 0) - (a[1].em ?? 0)).slice(0, 12)
  if (!emCurso.length) return null
  catalogo ??= await fetch('/dados/quadrinhos.json').then((r) => r.json()).catch(() => ({ series: [] }))
  const cartoes = emCurso.map(([id, p]) => {
    const s = catalogo.series.find((x) => x.id === id)
    const c = s?.capitulos.find((x) => x.n === p.cap)
    if (!s || !c) return null
    const fracao = Math.min(1, ((p.pag ?? 0) + 1) / c.paginas.length)
    return el('a', { class: 'cap', href: `/quadrinho.html?serie=${encodeURIComponent(id)}&cap=${c.n}${p.pag ? `&p=${p.pag}` : ''}`, style: 'width:132px;flex:none' },
      el('img', { src: s.capa, alt: '', loading: 'lazy', onerror: (e) => { e.target.style.visibility = 'hidden' } }),
      el('div', { class: 'barrinha' }, el('i', { style: `width:${Math.round(fracao * 100)}%` })),
      el('div', { class: 't' }, s.titulo), el('div', { class: 'n' }, `${c.titulo} · pág. ${(p.pag ?? 0) + 1}`))
  }).filter(Boolean)
  if (!cartoes.length) return null
  return el('section', { style: 'margin:0 0 26px' },
    el('h2', { style: 'font-family:Literata,Georgia,serif;font-weight:500;font-size:20px;margin:0 0 12px' }, 'Continuar lendo'),
    el('div', { style: 'display:flex;gap:14px;overflow-x:auto;padding-bottom:6px' }, cartoes))
}
const url = new URLSearchParams(location.search)
let aba = url.get('aba') === 'aqui' || url.get('serie') ? 'aqui' : 'descobrir'

// ─────────────────────────────────────────────────────────────
// DESCOBRIR
// ─────────────────────────────────────────────────────────────

const GENEROS = [['', 'Todos os gêneros'], ['Action', 'Ação'], ['Adventure', 'Aventura'], ['Comedy', 'Comédia'], ['Drama', 'Drama'],
  ['Fantasy', 'Fantasia'], ['Horror', 'Terror'], ['Mystery', 'Mistério'], ['Psychological', 'Psicológico'], ['Romance', 'Romance'],
  ['Sci-Fi', 'Ficção científica'], ['Slice of Life', 'Cotidiano'], ['Sports', 'Esportes'], ['Supernatural', 'Sobrenatural'],
  ['Thriller', 'Suspense'], ['Mecha', 'Mecha'], ['Music', 'Música'], ['Mahou Shoujo', 'Garotas mágicas']]

const filtros = {
  q: url.get('q') ?? '', tipo: url.get('tipo') ?? 'todos', cor: url.get('cor') ?? 'todos', genero: url.get('genero') ?? '',
  status: url.get('status') ?? 'todos', ordem: url.get('ordem') ?? 'populares', pt: url.get('pt') === '1',
  // o padrão é de 2010 para cá, os mais populares primeiro (pedido do dono, 18/09)
  desde: url.get('desde') ?? '2010',
}
let resultados = [], proxima = 1, carregando = false, pedidoAtual = 0

function queryDosFiltros(pagina) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filtros)) {
    if (k === 'pt') { if (v) p.set('pt', '1') } else if (v && v !== 'todos') p.set(k, v)
  }
  if (pagina > 1) p.set('pagina', String(pagina))
  return p
}

function espelharNaUrl() {
  const p = queryDosFiltros(1)
  const manga = new URLSearchParams(location.search).get('manga')
  if (manga) p.set('manga', manga)
  history.replaceState(null, '', `/quadrinhos.html${p.toString() ? '?' + p : ''}`)
}

// O botão marcado tem que acompanhar o filtro. Até 17/09 o painel era montado
// uma vez só e o clique mudava o filtro sem remarcar os botões: a lista
// filtrava, e "Todos" continuava aceso.
const chips = (nome, opcoes) => {
  const botoes = opcoes.map(([valor, rotulo, chaveFiltro]) => {
    const b = el('button', {
      class: 'filtro', type: 'button', 'aria-pressed': String(filtros[chaveFiltro] === valor),
      onclick: () => {
        filtros[chaveFiltro] = valor
        for (const outro of botoes) outro.setAttribute('aria-pressed', String(outro._valor === valor))
        buscar(true)
      },
    }, rotulo)
    b._valor = valor
    return b
  })
  return el('div', { class: 'linha-filtro' }, el('span', { class: 'rot' }, nome), botoes)
}

const seletor = (chave, opcoes) => {
  const s = el('select', { class: 'sel', 'aria-label': chave, onchange: (e) => { filtros[chave] = e.target.value; buscar(true) } },
    opcoes.map(([v, r]) => { const o = el('option', { value: v }, r); if (filtros[chave] === v) o.selected = true; return o }))
  return s
}

function cartaoManga(o) {
  return el('button', { class: 'card', type: 'button', onclick: () => abrirFicha(o.id) },
    el('div', { class: 'cap', style: o.cor ? `background:${o.cor}` : null },
      o.capa?.startsWith('/api/capa-manga/') ? el('img', { src: o.capa, alt: `Capa de ${o.titulo}`, loading: 'lazy' }) : null,
      el('div', { class: 'selos-c' },
        el('span', {}, o.tipo), o.colorido ? el('span', {}, 'colorido') : null, o.emPortugues ? el('span', { class: 'pt' }, 'em português') : null)),
    el('div', { class: 't' }, o.titulo),
    el('div', { class: 'g' }, [o.generos.slice(0, 2).join(' · '), o.nota ? `★ ${o.nota / 10}` : null].filter(Boolean).join('  ')))
}

async function buscar(recomecar) {
  if (recomecar) { resultados = []; proxima = 1 }
  // Filtro novo passa mesmo com busca em andamento: a resposta velha é
  // descartada pelo `pedidoAtual`. Antes, o segundo clique rápido (tipo e
  // depois cor) era ignorado e a lista mostrava só o primeiro filtro.
  if (!proxima || (carregando && !recomecar)) return
  carregando = true
  const meu = ++pedidoAtual
  espelharNaUrl()
  desenharDescobrir()
  try {
    const r = await fetch(`/api/mangas?${queryDosFiltros(proxima)}`).then(async (x) => {
      const j = await x.json().catch(() => ({})); if (!x.ok) throw new Error(j.erro || `erro ${x.status}`); return j
    })
    if (meu !== pedidoAtual) return
    const vistos = new Set(resultados.map((o) => o.id))
    resultados.push(...r.obras.filter((o) => !vistos.has(o.id)))
    proxima = r.proximaPagina
    erroDescobrir = null
  } catch (e) {
    if (meu === pedidoAtual) erroDescobrir = e.message
  } finally {
    if (meu === pedidoAtual) { carregando = false; desenharDescobrir() }
  }
}
let erroDescobrir = null

let areaResultados = null
function desenharDescobrir() {
  if (aba !== 'descobrir') return
  if (!areaResultados || !document.body.contains(areaResultados)) montarDescobrir()
  areaResultados.replaceChildren(
    resultados.length ? el('div', { class: 'grade-m' }, resultados.map(cartaoManga)) : null,
    carregando ? el('p', { class: 'estado-m' }, 'procurando…') : null,
    !carregando && erroDescobrir ? el('p', { class: 'estado-m' }, erroDescobrir) : null,
    !carregando && !erroDescobrir && !resultados.length ? el('p', { class: 'estado-m' }, 'Nada com esses filtros. Tente tirar algum.') : null,
    !carregando && proxima && resultados.length ? el('button', { class: 'filtro mais', onclick: () => buscar(false) }, 'Carregar mais') : null)
}

function montarDescobrir() {
  let espera = null
  const busca = el('input', { class: 'busca', type: 'search', placeholder: 'Buscar por título (ex.: Solo Leveling, Dandadan)', value: filtros.q, 'aria-label': 'Buscar' })
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { filtros.q = busca.value.trim(); buscar(true) }, 450) })
  areaResultados = el('div', {})
  const painel = el('div', { class: 'painel-filtros' },
    el('div', { class: 'linha-filtro' }, busca),
    chips('Tipo', [['todos', 'Todos', 'tipo'], ['manga', 'Mangá (Japão)', 'tipo'], ['manhwa', 'Manhwa (Coreia)', 'tipo'], ['manhua', 'Manhua (China)', 'tipo']]),
    chips('Cor', [['todos', 'Todos', 'cor'], ['colorido', 'Colorido', 'cor'], ['pb', 'Preto e branco', 'cor']]),
    el('div', { class: 'linha-filtro' },
      el('span', { class: 'rot' }, 'Mais'),
      seletor('genero', GENEROS),
      seletor('status', [['todos', 'Qualquer status'], ['lancando', 'Em lançamento'], ['finalizado', 'Finalizado'], ['hiato', 'Em hiato']]),
      seletor('desde', [['2010', 'De 2010 para cá'], ['2015', 'De 2015 para cá'], ['2020', 'De 2020 para cá'], ['todas', 'Todas as épocas']]),
      seletor('ordem', [['populares', 'Mais populares'], ['alta', 'Em alta agora'], ['nota', 'Mais bem avaliados'], ['novos', 'Mais novos']]),
      el('label', { class: 'chave' },
        el('input', { type: 'checkbox', ...(filtros.pt ? { checked: '' } : {}), onchange: (e) => { filtros.pt = e.target.checked; buscar(true) } }),
        'Só com versão oficial em português')))
  main.replaceChildren(
    cabecalho(),
    el('p', { class: 'sub' }, 'Milhares de mangás, manhwas e manhuas para descobrir. O Fio não hospeda essas obras — elas têm dono —, então cada ficha mostra onde ler oficialmente, muitas vezes de graça e em português.'),
    painel, areaResultados,
    el('p', { class: 'credito-m' }, 'Dados e capas: AniList (anilist.co). As obras pertencem aos seus autores e editoras — leia nas plataformas oficiais.'))
}

// ── a ficha ──
async function abrirFicha(id) {
  const p = new URLSearchParams(location.search); p.set('manga', String(id))
  history.replaceState(null, '', `/quadrinhos.html?${p}`)
  const caixa = el('div', { class: 'ficha', role: 'dialog', 'aria-modal': 'true' }, el('p', { class: 'estado-m' }, 'abrindo…'))
  const veu = el('div', { class: 'veu', onclick: (e) => { if (e.target === veu) fecharFicha() } }, caixa)
  document.querySelector('.veu')?.remove()
  document.body.append(veu)
  document.addEventListener('keydown', escFecha)
  let d
  try {
    const x = await fetch(`/api/mangas/${Number(id)}`)
    d = await x.json(); if (!x.ok) throw new Error(d.erro || 'não abriu')
  } catch (e) { caixa.replaceChildren(el('button', { class: 'fechar', onclick: fecharFicha, 'aria-label': 'Fechar' }, '×'), el('p', { class: 'estado-m' }, e.message)); return }

  const emPt = d.ondeLer.filter((l) => l.pt), outros = d.ondeLer.filter((l) => !l.pt)
  const link = (l) => /^https:\/\//i.test(l.url)
    ? el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: l.pt ? 'pt' : null }, l.site, l.idioma ? el('small', {}, l.idioma) : null)
    : null
  const sinopse = d.sinopse ? el('div', { class: 'sinopse' }, d.sinopse) : null
  caixa.replaceChildren(
    el('button', { class: 'fechar', onclick: fecharFicha, 'aria-label': 'Fechar' }, '×'),
    el('div', { class: 'ficha-topo' },
      d.capa?.startsWith('/api/capa-manga/') ? el('img', { src: d.capa, alt: `Capa de ${d.titulo}` }) : el('div'),
      el('div', {},
        el('h2', {}, d.titulo),
        d.original && d.original !== d.titulo ? el('div', { class: 'orig' }, [d.original, d.romaji].filter((x) => x && x !== d.titulo).join(' · ')) : null,
        el('div', { class: 'selos' },
          el('span', { class: 'selo' }, d.tipo), el('span', { class: 'selo' }, d.colorido ? 'colorido' : 'preto e branco'),
          el('span', { class: 'selo' }, d.sentido === 'rtl' ? 'lê-se ←' : 'lê-se →'), d.emPortugues ? el('span', { class: 'selo' }, 'oficial em português') : null),
        el('div', { class: 'dados' },
          [d.status, d.ano, d.capitulos ? `${d.capitulos} capítulos` : null, d.volumes ? `${d.volumes} volumes` : null, d.nota ? `nota ${d.nota}/100` : null]
            .filter(Boolean).map((t) => el('span', {}, t))),
        d.autores.length ? el('div', { class: 'aut' }, d.autores.map((a) => a.nome).join(', ')) : null,
        d.generos.length ? el('div', { class: 'dados' }, [...d.generos, ...d.temas].map((g) => el('span', { class: 'selo' }, g))) : null)),
    el('div', { class: 'onde' },
      el('h3', {}, 'Onde ler oficialmente'),
      d.ondeLer.length
        ? el('div', {},
          emPt.length ? el('div', { class: 'links' }, emPt.map(link)) : el('p', { class: 'orig' }, 'Não achamos versão oficial em português registrada. Outras línguas:'),
          outros.length ? el('div', { class: 'links', style: 'margin-top:8px' }, outros.map(link)) : null)
        : el('p', { class: 'orig' }, 'Sem plataforma oficial registrada para este título.')),
    sinopse ? el('div', {},
      el('h3', {}, 'Sinopse (em inglês, do AniList)'), sinopse,
      el('button', { class: 'filtro', style: 'margin-top:8px', onclick: (e) => { sinopse.classList.toggle('aberta'); e.target.textContent = sinopse.classList.contains('aberta') ? 'menos' : 'ler tudo' } }, 'ler tudo')) : null,
    d.parecidos.length ? el('div', {}, el('h3', {}, 'Quem lê isso também lê'),
      el('div', { class: 'parecidos' }, d.parecidos.map((r) => el('button', { class: 'card', type: 'button', onclick: () => abrirFicha(r.id) },
        el('div', { class: 'cap' }, r.capa?.startsWith('/api/capa-manga/') ? el('img', { src: r.capa, alt: r.titulo, loading: 'lazy' }) : null,
          el('div', { class: 'selos-c' }, el('span', {}, r.tipo))),
        el('div', { class: 't' }, r.titulo))))) : null,
    el('p', { class: 'credito-m' }, 'Dados: ', el('a', { href: d.anilist, target: '_blank', rel: 'noopener noreferrer' }, 'AniList'),
      '. Os direitos da obra são dos autores e editoras.'))
  caixa.scrollIntoView({ block: 'start' })
}

function escFecha(e) { if (e.key === 'Escape') fecharFicha() }
function fecharFicha() {
  document.querySelector('.veu')?.remove()
  document.removeEventListener('keydown', escFecha)
  const p = new URLSearchParams(location.search); p.delete('manga')
  history.replaceState(null, '', `/quadrinhos.html${p.toString() ? '?' + p : ''}`)
}

// ─────────────────────────────────────────────────────────────
// LER AQUI
// ─────────────────────────────────────────────────────────────

let catalogo = null
const SENTIDO = { ltr: 'lê-se →', rtl: 'mangá · lê-se ←' }
const filtrosAqui = { q: '', estilo: 'todos', sentido: 'todos', lendo: false }

function selos(s) {
  return el('div', { class: 'selos' },
    el('span', { class: 'selo' }, s.estilo), el('span', { class: 'selo' }, s.formato),
    el('span', { class: 'selo' }, SENTIDO[s.sentido]), el('span', { class: 'selo' }, s.idioma),
    el('span', { class: 'selo' }, `${s.capitulos.length} ${s.formato === 'quadrinho' ? 'episódios' : 'volumes'}`))
}

function ondeParou(s) {
  const p = lerProgresso()[s.id]
  const cap = p && s.capitulos.find((c) => c.n === p.cap)
  return cap ? { cap, pagina: p.pag } : null
}

// ── a vitrine (18/09) ──
const hojeDia = Math.floor(Date.now() / 86_400_000)
const haQuanto = (ms) => {
  const d = Math.floor((Date.now() - ms) / 86_400_000)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : d < 365 ? `há ${Math.floor(d / 30)} ${d < 60 ? 'mês' : 'meses'}` : 'há mais de um ano'
}
const linkSerie = (id) => `/quadrinhos.html?aba=aqui&serie=${encodeURIComponent(id)}`

/** A série em destaque: a que a curadoria marcou, senão uma diferente a cada dia. */
function destaqueDoDia(series) {
  const marcadas = series.filter((s) => s.destaque)
  const escolha = (marcadas.length ? marcadas : series)[hojeDia % (marcadas.length || series.length)]
  if (!escolha) return null
  const fundo = el('div', { class: 'fundo' })
  fundo.style.backgroundImage = `url("${String(escolha.capa).replace(/["\\]/g, '')}")`
  return el('a', { class: 'destaque', href: linkSerie(escolha.id) },
    fundo,
    el('img', { src: escolha.capa, alt: `Capa de ${escolha.titulo}` }),
    el('div', {},
      el('div', { class: 'tag' }, marcadas.length ? 'DESTAQUE DA CURADORIA' : 'DESTAQUE DE HOJE'),
      el('h2', {}, escolha.titulo),
      el('div', { style: 'color:#c9b8a8;font-size:13.5px;margin-bottom:10px' }, `${escolha.autor} · ${escolha.ano}`),
      el('p', {}, escolha.resumo),
      el('span', { class: 'botao' }, 'Ler agora')))
}

function faixaNovidades(v) {
  if (!v?.novidades?.length || !catalogo) return null
  const cards = v.novidades.map((n) => {
    const s = catalogo.series.find((x) => x.id === n.serie)
    const c = s?.capitulos.find((x) => x.n === n.cap)
    if (!s || !c) return null
    return el('a', { class: 'novo', href: `/quadrinho.html?serie=${encodeURIComponent(s.id)}&cap=${c.n}` },
      el('img', { src: c.capa, alt: '', loading: 'lazy', onerror: (e) => { e.target.style.visibility = 'hidden' } }),
      Date.now() - n.em < 7 * 86_400_000 ? el('span', { class: 'marca' }, 'NOVO') : null,
      el('div', { class: 't' }, s.titulo),
      el('div', { class: 'q' }, `${c.titulo} · ${haQuanto(n.em)}`))
  }).filter(Boolean)
  return cards.length ? el('section', { class: 'faixa' },
    el('div', { class: 'faixa-topo' }, el('h2', {}, 'Novidades no Fio'), el('span', {}, 'os volumes que chegaram por último')),
    el('div', { class: 'rolo' }, cards)) : null
}

function faixaRanking(v) {
  const r = (v?.ranking ?? []).map((x) => ({ ...x, s: catalogo?.series.find((s) => s.id === x.serie) })).filter((x) => x.s)
  if (r.length < 3) return null // ranking de duas séries não é ranking
  return el('section', { class: 'faixa' },
    el('div', { class: 'faixa-topo' }, el('h2', {}, 'Mais lidos'), el('span', {}, 'pelas contas que estão lendo')),
    el('div', { class: 'ranking' }, r.map((x) => el('a', { href: linkSerie(x.s.id) },
      el('img', { src: x.s.capa, alt: '', loading: 'lazy' }),
      el('div', {}, el('b', {}, x.s.titulo), el('small', {}, `${x.leitores} ${x.leitores === 1 ? 'leitor' : 'leitores'} · ${x.s.capitulos.length} ${x.s.formato === 'quadrinho' ? 'episódios' : 'volumes'}`))))))
}

async function mostrarAqui() {
  catalogo ??= await fetch('/dados/quadrinhos.json').then((r) => r.json())
  const serie = catalogo.series.find((x) => x.id === new URLSearchParams(location.search).get('serie'))
  if (serie) { mostrarSerie(serie); return }

  const normal = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const passa = (s) => (filtrosAqui.estilo === 'todos' || s.estilo === filtrosAqui.estilo)
    && (filtrosAqui.sentido === 'todos' || s.sentido === filtrosAqui.sentido)
    && (!filtrosAqui.lendo || ondeParou(s))
    && (!filtrosAqui.q || normal(`${s.titulo} ${s.autor} ${s.tags.join(' ')}`).includes(normal(filtrosAqui.q)))
  const lista = catalogo.series.filter(passa)

  const busca = el('input', { class: 'busca', type: 'search', placeholder: 'Buscar por título, autor ou tema', value: filtrosAqui.q })
  busca.addEventListener('input', () => { filtrosAqui.q = busca.value; desenharListaAqui() })
  const chipsAqui = (rot, chave, opcoes) => el('div', { class: 'linha-filtro' }, el('span', { class: 'rot' }, rot),
    opcoes.map(([v, r]) => el('button', { class: 'filtro', type: 'button', 'aria-pressed': String(filtrosAqui[chave] === v), onclick: (e) => {
      filtrosAqui[chave] = v
      for (const b of e.currentTarget.parentNode.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === e.currentTarget))
      desenharListaAqui()
    } }, r)))

  const area = el('div', {})
  function desenharListaAqui() {
    const l = catalogo.series.filter(passa)
    area.replaceChildren(l.length ? el('div', { class: 'grade' }, l.map((s) => {
      const parou = ondeParou(s)
      return el('a', { class: 'capa-serie', href: `/quadrinhos.html?aba=aqui&serie=${encodeURIComponent(s.id)}`, title: s.resumo },
        el('div', { class: 'img' },
          el('img', { src: s.capa, alt: `Capa de ${s.titulo}`, loading: 'lazy', onerror: (e) => { e.target.style.visibility = 'hidden' } }),
          el('span', { class: 'tipo' }, s.sentido === 'rtl' ? 'mangá' : s.formato),
          el('span', { class: 'vols' }, `${s.capitulos.length} ${s.formato === 'quadrinho' ? 'ep.' : 'vol.'}${s.estilo === 'colorido' ? ' · cor' : ''}`),
          parou ? el('span', { class: 'marca' }, 'lendo') : null),
        el('div', { class: 't' }, s.titulo), el('div', { class: 'a' }, `${s.autor} · ${s.ano}`))
    })) : el('p', { class: 'estado-m' }, 'Nada com esses filtros.'))
  }
  const [continuar, vitrine] = await Promise.all([prateleiraContinuar(), fetch('/api/quadrinhos/vitrine').then((r) => (r.ok ? r.json() : null)).catch(() => null)])
  main.replaceChildren(...[
    cabecalho(),
    destaqueDoDia(catalogo.series),
    continuar,
    faixaNovidades(vitrine),
    faixaRanking(vitrine),
    el('div', { class: 'faixa-topo' }, el('h2', {}, 'Todas as séries')),
    el('p', { class: 'sub' }, `${catalogo.series.length} séries livres para ler aqui dentro, com leitor próprio: domínio público ou licença livre, sempre com crédito.`),
    el('div', { class: 'painel-filtros' },
      el('div', { class: 'linha-filtro' }, busca),
      chipsAqui('Cor', 'estilo', [['todos', 'Todos'], ['colorido', 'Colorido'], ['preto e branco', 'Preto e branco']]),
      chipsAqui('Leitura', 'sentido', [['todos', 'Todos'], ['rtl', 'Mangá (lê-se ←)'], ['ltr', 'Ocidental (lê-se →)']]),
      el('div', { class: 'linha-filtro' }, el('label', { class: 'chave' },
        el('input', { type: 'checkbox', ...(filtrosAqui.lendo ? { checked: '' } : {}), onchange: (e) => { filtrosAqui.lendo = e.target.checked; desenharListaAqui() } }),
        'Só o que estou lendo'))),
    area].filter(Boolean))
  desenharListaAqui()
  void lista
}

function mostrarSerie(s) {
  document.title = `${s.titulo} — Fio`
  const progresso = lerProgresso()[s.id] ?? {}
  const parou = ondeParou(s)
  const lidos = new Set(progresso.lidos ?? [])
  const leitor = (c, p = 0) => `/quadrinho.html?serie=${encodeURIComponent(s.id)}&cap=${c.n}${p ? `&p=${p}` : ''}`
  main.replaceChildren(
    el('p', {}, el('a', { href: '/quadrinhos.html?aba=aqui', style: 'font-size:13px;color:var(--tinta2);text-decoration:none' }, '← todas as séries livres')),
    el('div', { class: 'topo' },
      el('img', { src: s.capa, alt: `Capa de ${s.titulo}` }),
      el('div', {},
        el('h1', {}, s.titulo), el('div', { class: 'aut' }, `${s.autor} · ${s.ano}`), selos(s),
        el('p', { style: 'max-width:62ch' }, s.resumo),
        el('p', {}, parou
          ? el('a', { class: 'botao', href: leitor(parou.cap, parou.pagina) }, `Continuar: ${parou.cap.titulo}`)
          : el('a', { class: 'botao', href: leitor(s.capitulos[0]) }, `Começar do ${s.formato === 'quadrinho' ? 'episódio' : 'volume'} 1`)),
        el('p', { class: 'credito' }, s.licenca.credito, ' ',
          el('a', { href: s.licenca.url, target: '_blank', rel: 'noopener noreferrer' }, s.licenca.nome)))),
    el('div', { class: 'caps' }, s.capitulos.map((c) => {
      const emCurso = progresso.cap === c.n && !lidos.has(c.n)
      const fracao = emCurso ? Math.min(1, (progresso.pag + 1) / c.paginas.length) : lidos.has(c.n) ? 1 : 0
      return el('a', { class: 'cap', href: emCurso ? leitor(c, progresso.pag) : leitor(c) },
        el('img', { src: c.capa, alt: c.titulo, loading: 'lazy', onerror: (e) => { e.target.style.visibility = 'hidden' } }),
        lidos.has(c.n) ? el('span', { class: 'estado' }, 'lido') : emCurso ? el('span', { class: 'estado' }, 'lendo') : null,
        fracao > 0 ? el('div', { class: 'barrinha' }, el('i', { style: `width:${Math.round(fracao * 100)}%` })) : null,
        el('div', { class: 't' }, c.titulo), el('div', { class: 'n' }, `${c.paginas.length} páginas`))
    })))
}

// ─────────────────────────────────────────────────────────────

function cabecalho() {
  return el('div', {},
    el('h1', {}, 'Quadrinhos, mangá e manhwa'),
    el('div', { class: 'abas', role: 'tablist' },
      el('button', { role: 'tab', 'aria-selected': String(aba === 'descobrir'), onclick: () => trocarAba('descobrir') }, 'Descobrir mangá, manhwa e manhua'),
      el('button', { role: 'tab', 'aria-selected': String(aba === 'aqui'), onclick: () => trocarAba('aqui') }, 'Ler aqui (livres)'),
      el('a', { role: 'tab', href: '/publicacoes.html?tipo=quadrinho', style: 'color:var(--tinta2);font-size:15px;padding:10px 14px;text-decoration:none' }, 'Da comunidade')))
}

function trocarAba(nova) {
  aba = nova
  areaResultados = null
  if (nova === 'aqui') { history.replaceState(null, '', '/quadrinhos.html?aba=aqui'); mostrarAqui() }
  else { espelharNaUrl(); montarDescobrir(); if (!resultados.length) buscar(true); else desenharDescobrir() }
}

function iniciar() {
  if (aba === 'aqui') mostrarAqui()
  else { montarDescobrir(); buscar(true) }
  const manga = Number(url.get('manga'))
  if (manga) abrirFicha(manga)
}

try { iniciar() } catch (e) { main.replaceChildren(el('p', { class: 'sub' }, `Não consegui abrir: ${e.message}`)) }
