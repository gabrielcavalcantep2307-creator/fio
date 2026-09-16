// A estante de quadrinhos e mangá: as séries, e os capítulos de cada uma.
//
// Tudo vem de /dados/quadrinhos.json (gerado por ingestao/quadrinhos.mjs). O
// progresso de leitura mora neste navegador (localStorage), como o do leitor de
// livros antes de ter conta; todo texto entra por nó de texto.

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

const lerProgresso =() => { try { return JSON.parse(localStorage.getItem('fio:quadrinhos') || '{}') } catch { return {} } }

const main = document.getElementById('main')
const SENTIDO = { ltr: 'lê-se →', rtl: 'mangá · lê-se ←' }
let catalogo = null
let filtro = 'todos'

async function iniciar() {
  catalogo = await fetch('/dados/quadrinhos.json').then((r) => r.json())
  const serie = new URLSearchParams(location.search).get('serie')
  const s = catalogo.series.find((x) => x.id === serie)
  s ? mostrarSerie(s) : mostrarEstante()
}

function selos(s) {
  return el('div', { class: 'selos' },
    el('span', { class: 'selo' }, s.estilo), el('span', { class: 'selo' }, s.formato),
    el('span', { class: 'selo' }, SENTIDO[s.sentido]), el('span', { class: 'selo' }, s.idioma),
    el('span', { class: 'selo' }, `${s.capitulos.length} ${s.formato === 'mangá' ? 'volumes' : 'episódios'}`))
}

function ondeParou(s) {
  const p = lerProgresso()[s.id]
  if (!p) return null
  const cap = s.capitulos.find((c) => c.n === p.cap)
  return cap ? { cap, pagina: p.pag } : null
}

function mostrarEstante() {
  const FILTROS = [['todos', 'Tudo'], ['colorido', 'Colorido'], ['preto e branco', 'Preto e branco'], ['rtl', 'Mangá (lê-se ←)'], ['lendo', 'Continuar lendo']]
  const passa = (s) => filtro === 'todos' || s.estilo === filtro || (filtro === 'rtl' && s.sentido === 'rtl') || (filtro === 'lendo' && ondeParou(s))
  const lista = catalogo.series.filter(passa)
  main.replaceChildren(
    el('h1', {}, 'Quadrinhos e mangá'),
    el('p', { class: 'sub' }, 'Colorido e preto e branco, ocidental e japonês — cada um com o jeito certo de ler: rolagem para o quadrinho da tela, página dupla e da direita para a esquerda para o mangá.'),
    el('div', { class: 'filtros' }, FILTROS.map(([chave, rotulo]) => el('button', {
      class: 'filtro', 'aria-pressed': String(filtro === chave), onclick: () => { filtro = chave; mostrarEstante() },
    }, rotulo))),
    lista.length ? el('div', { class: 'series' }, lista.map((s) => {
      const parou = ondeParou(s)
      return el('a', { class: 'serie', href: `/quadrinhos.html?serie=${encodeURIComponent(s.id)}` },
        el('img', { src: s.capa, alt: `Capa de ${s.titulo}`, loading: 'lazy' }),
        el('div', {},
          el('h2', {}, s.titulo), el('div', { class: 'aut' }, `${s.autor} · ${s.ano}`),
          selos(s), el('p', { class: 'resumo' }, s.resumo),
          parou ? el('span', { class: 'continuar' }, `continuar: ${parou.cap.titulo} →`) : null))
    })) : el('p', { class: 'sub' }, 'Nada aqui ainda.'),
    el('div', { class: 'aviso' },
      'Por que não tem One Piece, Naruto ou Jujutsu? Mangá comercial em português tem dono duas vezes — o autor e a editora da tradução — e site que "tem tudo" é scan pirata. Aqui entra só o que o autor liberou ou que já está em domínio público, sempre com crédito.'))
}

function mostrarSerie(s) {
  document.title = `${s.titulo} — Fio`
  const progresso = lerProgresso()[s.id] ?? {}
  const parou = ondeParou(s)
  const lidos = new Set(progresso.lidos ?? [])
  const leitor = (c, p = 0) => `/quadrinho.html?serie=${encodeURIComponent(s.id)}&cap=${c.n}${p ? `&p=${p}` : ''}`
  main.replaceChildren(
    el('p', {}, el('a', { href: '/quadrinhos.html', style: 'font-size:13px;color:var(--tinta2);text-decoration:none' }, '← todas as séries')),
    el('div', { class: 'topo' },
      el('img', { src: s.capa, alt: `Capa de ${s.titulo}` }),
      el('div', {},
        el('h1', {}, s.titulo), el('div', { class: 'aut' }, `${s.autor} · ${s.ano}`), selos(s),
        el('p', { style: 'max-width:62ch' }, s.resumo),
        el('p', {}, parou
          ? el('a', { class: 'botao', href: leitor(parou.cap, parou.pagina) }, `Continuar: ${parou.cap.titulo}`)
          : el('a', { class: 'botao', href: leitor(s.capitulos[0]) }, `Começar do ${s.formato === 'mangá' ? 'volume' : 'episódio'} 1`)),
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

iniciar().catch((e) => main.replaceChildren(el('p', { class: 'sub' }, `Não consegui abrir os quadrinhos: ${e.message}`)))
