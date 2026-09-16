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

const chips = (nome, opcoes) => el('div', { class: 'linha-filtro' }, el('span', { class: 'rot' }, nome),
  opcoes.map(([valor, rotulo, chaveFiltro]) => el('button', {
    class: 'filtro', 'aria-pressed': String(filtros[chaveFiltro] === valor),
    onclick: () => { filtros[chaveFiltro] = valor; buscar(true) },
  }, rotulo)))

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
  if (!proxima || carregando) return
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
    opcoes.map(([v, r]) => el('button', { class: 'filtro', 'aria-pressed': String(filtrosAqui[chave] === v), onclick: () => { filtrosAqui[chave] = v; mostrarAqui() } }, r)))

  const area = el('div', {})
  function desenharListaAqui() {
    const l = catalogo.series.filter(passa)
    area.replaceChildren(l.length ? el('div', { class: 'series' }, l.map((s) => {
      const parou = ondeParou(s)
      return el('a', { class: 'serie', href: `/quadrinhos.html?aba=aqui&serie=${encodeURIComponent(s.id)}` },
        el('img', { src: s.capa, alt: `Capa de ${s.titulo}`, loading: 'lazy' }),
        el('div', {}, el('h2', {}, s.titulo), el('div', { class: 'aut' }, `${s.autor} · ${s.ano}`), selos(s),
          el('p', { class: 'resumo' }, s.resumo), parou ? el('span', { class: 'continuar' }, `continuar: ${parou.cap.titulo} →`) : null))
    })) : el('p', { class: 'estado-m' }, 'Nada com esses filtros.'))
  }
  main.replaceChildren(
    cabecalho(),
    el('p', { class: 'sub' }, `${catalogo.series.length} séries livres para ler aqui dentro, com leitor próprio: domínio público ou licença livre, sempre com crédito.`),
    el('div', { class: 'painel-filtros' },
      el('div', { class: 'linha-filtro' }, busca),
      chipsAqui('Cor', 'estilo', [['todos', 'Todos'], ['colorido', 'Colorido'], ['preto e branco', 'Preto e branco']]),
      chipsAqui('Leitura', 'sentido', [['todos', 'Todos'], ['rtl', 'Mangá (lê-se ←)'], ['ltr', 'Ocidental (lê-se →)']]),
      el('div', { class: 'linha-filtro' }, el('label', { class: 'chave' },
        el('input', { type: 'checkbox', ...(filtrosAqui.lendo ? { checked: '' } : {}), onchange: (e) => { filtrosAqui.lendo = e.target.checked; desenharListaAqui() } }),
        'Só o que estou lendo'))),
    area)
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
        el('img', { src: c.capa, alt: c.titulo, loading: 'lazy' }),
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
      el('button', { role: 'tab', 'aria-selected': String(aba === 'aqui'), onclick: () => trocarAba('aqui') }, 'Ler aqui (livres)')))
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
