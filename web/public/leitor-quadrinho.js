// O leitor de quadrinhos e mangá.
//
// ─────────────────────────────────────────────────────────────
// POR QUE ELE É DIFERENTE DO LEITOR DE LIVROS
//
// Livro é texto que se refaz na largura da tela. Quadrinho é IMAGEM com
// composição fixa, e cada tipo pede um jeito de ler:
//
//   ROLAGEM  — a coluna contínua do quadrinho feito para a tela (webtoon,
//              manhwa, Pepper&Carrot). O dedo só desce. É o padrão no celular.
//   PÁGINA   — uma página inteira por vez, ajustada à tela, virando com toque
//              nas laterais, setas ou deslize. É como se lê mangá de papel.
//   DUPLA    — duas páginas lado a lado, no computador: a página dupla que o
//              desenhista compôs como uma só.
//
// E o SENTIDO: mangá japonês se lê da direita para a esquerda. Aí "próxima"
// fica à esquerda — toque, seta e deslize invertem juntos, e na página dupla a
// primeira página fica à direita. O padrão vem da série; o leitor muda se quiser,
// e a escolha fica guardada por série.
// ─────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id)
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* modo privado */ } }
const ler = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p } catch { return p } }

const params = new URLSearchParams(location.search)
const estado = { serie: null, cap: null, pagina: 0, modo: 'pagina', sentido: 'ltr', total: 0, traducao: null, mostrarTraducao: false }
let escondeTimer = null

// Progresso na conta (17/09): o navegador guarda na hora; a conta recebe a
// cada 15 s e ao sair da página. Ao abrir, o que for mais novo vence.
let pendenteConta = null, relogioConta = null
async function puxarDaConta() {
  const r = await fetch('/api/quadrinhos/progresso', { credentials: 'same-origin' }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
  if (!r?.series) return false
  const todos = ler('fio:quadrinhos', {})
  for (const s of r.series) {
    const local = todos[s.serie]
    if (!local || (local.em ?? 0) < s.em) todos[s.serie] = { cap: s.cap, pag: s.pag, lidos: s.lidos, em: s.em }
  }
  guardar('fio:quadrinhos', todos)
  return true
}
function mandarParaConta(agora = false) {
  if (!pendenteConta) return
  const corpo = JSON.stringify({ itens: [pendenteConta] })
  pendenteConta = null
  fetch('/api/quadrinhos/progresso', { method: 'POST', credentials: 'same-origin', keepalive: agora,
    headers: { 'content-type': 'application/json', 'x-fio': '1' }, body: corpo }).catch(() => {})
}
addEventListener('pagehide', () => mandarParaConta(true))

async function iniciar() {
  const naConta = await puxarDaConta()
  const catalogo = await fetch('/dados/quadrinhos.json').then((r) => r.json())
  const s = catalogo.series.find((x) => x.id === params.get('serie'))
  const c = s?.capitulos.find((x) => x.n === Number(params.get('cap')))
  if (!s || !c) { location.replace('/quadrinhos.html'); return }
  // só caminho da própria casa vira <img>
  c.paginas = c.paginas.filter((p) => typeof p === 'string' && p.startsWith('/quadrinhos/'))

  // Sem conta, só o primeiro volume de cada série (o servidor recusa as
  // imagens dos outros). Em vez de páginas quebradas, o convite.
  if (c.n > 1) {
    const eu = await fetch('/api/eu', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (!eu?.pessoa) {
      const caixa = document.createElement('div')
      caixa.setAttribute('style', 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:#111;color:#eee;font:16px/1.5 Inter,system-ui,sans-serif;text-align:center')
      const dentro = document.createElement('div')
      dentro.setAttribute('style', 'max-width:420px')
      const t = document.createElement('p'); t.setAttribute('style', 'font:22px Literata,Georgia,serif;margin:0 0 10px'); t.textContent = 'Continue lendo com uma conta grátis'
      const p = document.createElement('p'); p.setAttribute('style', 'color:#bbb;margin:0 0 20px'); p.textContent = `O primeiro volume de ${s.titulo} é aberto para todo mundo. Para seguir, crie uma conta — é de graça.`
      const entrar = document.createElement('a'); entrar.href = '/#/entrar'; entrar.textContent = 'Criar conta ou entrar'
      entrar.setAttribute('style', 'display:inline-block;background:#c96a5c;color:#fff;border-radius:8px;padding:11px 20px;text-decoration:none')
      const voltar = document.createElement('a'); voltar.href = `/quadrinhos.html?aba=aqui&serie=${encodeURIComponent(s.id)}`; voltar.textContent = 'voltar à série'
      voltar.setAttribute('style', 'display:block;margin-top:14px;color:#bbb')
      dentro.append(t, p, entrar, voltar); caixa.append(dentro); document.body.append(caixa)
      return
    }
  }

  sincronizaConta = naConta
  estado.serie = s; estado.cap = c; estado.total = c.paginas.length
  const prefs = ler('fio:quadrinhos:prefs', {})[s.id] ?? {}
  estado.modo = prefs.modo ?? s.modo
  estado.sentido = prefs.sentido ?? s.sentido
  if (estado.modo === 'dupla' && innerWidth < 900) estado.modo = 'pagina'

  // Tradução dos balões (ingestao/quadrinhos-ocr.mjs). Só caminho da casa.
  if (typeof s.traducao === 'string' && s.traducao.startsWith('/dados/quadrinhos-traducao/')) {
    estado.traducao = await fetch(s.traducao).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const temAqui = estado.traducao && c.paginas.some((p) => estado.traducao.paginas?.[p]?.blocos?.length)
    if (temAqui) {
      estado.mostrarTraducao = prefs.traducao ?? true
      $('traducao').hidden = false
      $('traducao').addEventListener('click', alternarTraducao)
    }
  }
  estado.pagina = Math.max(0, Math.min(estado.total - 1, Number(params.get('p')) || 0))

  document.title = `${c.titulo} — ${s.titulo}`
  $('voltar').href = `/quadrinhos.html?serie=${encodeURIComponent(s.id)}`
  $('titulo').replaceChildren(Object.assign(document.createElement('b'), { textContent: s.titulo }),
    Object.assign(document.createElement('span'), { textContent: c.titulo }))
  for (const x of s.capitulos) {
    const o = document.createElement('option'); o.value = x.n; o.textContent = x.titulo; o.selected = x.n === c.n
    $('capitulo').append(o)
  }
  $('capitulo').addEventListener('change', (e) => irParaCapitulo(Number(e.target.value)))
  $('barra').max = String(estado.total - 1)

  for (const b of document.querySelectorAll('[data-modo]')) b.addEventListener('click', () => mudarModo(b.dataset.modo))
  $('sentido').addEventListener('click', () => { estado.sentido = estado.sentido === 'rtl' ? 'ltr' : 'rtl'; salvarPrefs(); desenhar(); dica(estado.sentido === 'rtl' ? 'Mangá: lê-se da direita para a esquerda ←' : 'Lê-se da esquerda para a direita →') })
  $('tela').addEventListener('click', telaCheia)
  $('anterior').addEventListener('click', () => (estado.sentido === 'rtl' ? avancar() : voltar()))
  $('seguinte').addEventListener('click', () => (estado.sentido === 'rtl' ? voltar() : avancar()))
  $('barra').addEventListener('input', (e) => irPara(Number(e.target.value)))
  $('zonaEsq').addEventListener('click', () => (estado.sentido === 'rtl' ? avancar() : voltar()))
  $('zonaDir').addEventListener('click', () => (estado.sentido === 'rtl' ? voltar() : avancar()))
  $('palco').addEventListener('dblclick', () => { $('palco').classList.toggle('zoom'); requestAnimationFrame(() => { for (const f of camadas) f() }) })
  $('palco').addEventListener('scroll', () => { for (const f of camadas) f() }, { passive: true })
  $('palco').addEventListener('click', alternarUi)
  document.addEventListener('keydown', teclas)
  gestos()
  addEventListener('scroll', aoRolar, { passive: true })

  desenhar()
  if (estado.sentido === 'rtl' && !ler('fio:quadrinhos:vi-dica-rtl', false)) {
    dica('Mangá: lê-se da direita para a esquerda ←'); guardar('fio:quadrinhos:vi-dica-rtl', true)
  }
}

function salvarPrefs() {
  const todas = ler('fio:quadrinhos:prefs', {})
  todas[estado.serie.id] = { modo: estado.modo, sentido: estado.sentido, traducao: estado.mostrarTraducao }
  guardar('fio:quadrinhos:prefs', todas)
}

function salvarProgresso(terminou = false) {
  const todos = ler('fio:quadrinhos', {})
  const p = todos[estado.serie.id] ?? { lidos: [] }
  p.cap = estado.cap.n; p.pag = estado.pagina; p.em = Date.now()
  if (terminou && !p.lidos.includes(estado.cap.n)) p.lidos.push(estado.cap.n)
  todos[estado.serie.id] = p
  guardar('fio:quadrinhos', todos)
  if (sincronizaConta) {
    pendenteConta = { serie: estado.serie.id, cap: p.cap, pag: p.pag, lidos: p.lidos, em: p.em }
    clearTimeout(relogioConta)
    relogioConta = setTimeout(() => mandarParaConta(), 15_000)
  }
}
let sincronizaConta = false

function mudarModo(modo) {
  estado.modo = modo; salvarPrefs(); desenhar()
}

function desenhar() {
  for (const b of document.querySelectorAll('[data-modo]')) b.setAttribute('aria-pressed', String(b.dataset.modo === estado.modo))
  $('sentido').textContent = estado.sentido === 'rtl' ? 'mangá ←' : 'ocidental →'
  $('traducao').setAttribute('aria-pressed', String(estado.mostrarTraducao))
  $('traducao').textContent = estado.mostrarTraducao ? 'PT' : 'original'
  const rolando = estado.modo === 'rolagem'
  $('rolagem').hidden = !rolando
  $('palco').hidden = rolando
  $('zonaEsq').hidden = rolando; $('zonaDir').hidden = rolando
  $('fimPagina').style.display = 'none'
  if (rolando) montarRolagem(); else mostrarPagina()
  atualizarBarra()
}

// ── rolagem ──
function montarRolagem() {
  const box = $('rolagem')
  box.replaceChildren()
  // Carregamento preguiçoso NATIVO, e não IntersectionObserver: o observador não
  // dispara em aba escondida ou em alguns navegadores embutidos, e a página
  // ficava sem imagem nenhuma. As três primeiras vão já, sem esperar rolagem.
  estado.cap.paginas.forEach((src, i) => {
    const img = document.createElement('img')
    img.alt = `Página ${i + 1} de ${estado.total}`; img.dataset.i = i
    img.loading = i < 3 ? 'eager' : 'lazy'; img.decoding = 'async'
    img.addEventListener('load', () => img.setAttribute('data-carregada', ''), { once: true })
    img.src = src
    const folha = document.createElement('div'); folha.className = 'folha'
    folha.append(img)
    box.append(folha)
    sobrepor(img, src)
  })
  box.append(blocoFim())
  const alvo = box.children[estado.pagina]
  if (alvo && estado.pagina > 0) requestAnimationFrame(() => alvo.scrollIntoView())
  else scrollTo(0, 0)
}

let ultimoY = 0, rolagemPendente = false
function aoRolar() {
  if (estado.modo !== 'rolagem' || rolagemPendente) return
  rolagemPendente = true
  requestAnimationFrame(() => {
    rolagemPendente = false
    const y = scrollY
    document.body.classList.toggle('escondida', y > ultimoY + 4 && y > 120)
    if (y < ultimoY - 4) document.body.classList.remove('escondida')
    ultimoY = y
    const meio = innerHeight / 2
    let atual = 0
    for (const img of $('rolagem').querySelectorAll('.folha > img')) {
      if (img.getBoundingClientRect().top < meio) atual = Number(img.dataset.i); else break
    }
    if (atual !== estado.pagina) { estado.pagina = atual; atualizarBarra() }
    const noFim = innerHeight + y >= document.body.scrollHeight - 200
    salvarProgresso(noFim)
  })
}

// ── página e dupla ──
function paginasVisiveis() {
  if (estado.modo !== 'dupla') return [estado.pagina]
  const par = [estado.pagina, estado.pagina + 1].filter((i) => i < estado.total)
  return estado.sentido === 'rtl' ? par.reverse() : par
}

function mostrarPagina() {
  const palco = $('palco')
  palco.classList.toggle('dupla', estado.modo === 'dupla')
  palco.classList.remove('zoom')
  palco.replaceChildren(...paginasVisiveis().map((i) => {
    const img = document.createElement('img')
    img.src = estado.cap.paginas[i]; img.alt = `Página ${i + 1} de ${estado.total}`; img.draggable = false
    return img
  }))
  for (const img of [...palco.querySelectorAll('img')]) sobrepor(img, img.getAttribute('src'))
  // já pede as próximas, para virar a página não esperar rede
  for (let k = 1; k <= 3; k++) { const src = estado.cap.paginas[estado.pagina + k]; if (src) new Image().src = src }
  salvarProgresso(estado.pagina + (estado.modo === 'dupla' ? 2 : 1) >= estado.total)
  history.replaceState(null, '', `?serie=${encodeURIComponent(estado.serie.id)}&cap=${estado.cap.n}&p=${estado.pagina}`)
  agendarEsconder()
}

const passo = () => (estado.modo === 'dupla' ? 2 : 1)

function avancar() {
  if (estado.modo === 'rolagem') { scrollBy({ top: innerHeight * 0.85, behavior: 'smooth' }); return }
  if ($('fimPagina').style.display === 'flex') { const prox = proximoCapitulo(); if (prox) irParaCapitulo(prox.n); return }
  if (estado.pagina + passo() >= estado.total) { mostrarFim(); return }
  estado.pagina += passo(); mostrarPagina(); atualizarBarra()
}

function voltar() {
  if (estado.modo === 'rolagem') { scrollBy({ top: -innerHeight * 0.85, behavior: 'smooth' }); return }
  if ($('fimPagina').style.display === 'flex') { $('fimPagina').style.display = 'none'; return }
  if (estado.pagina === 0) { const ant = capituloAnterior(); if (ant) irParaCapitulo(ant.n, ant.paginas.length - 1); return }
  estado.pagina = Math.max(0, estado.pagina - passo()); mostrarPagina(); atualizarBarra()
}

function irPara(i) {
  estado.pagina = i
  if (estado.modo === 'rolagem') $('rolagem').children[i]?.scrollIntoView()
  else { $('fimPagina').style.display = 'none'; mostrarPagina() }
  atualizarBarra()
}

function atualizarBarra() {
  $('barra').value = String(estado.pagina)
  const ate = estado.modo === 'dupla' ? Math.min(estado.total, estado.pagina + 2) : estado.pagina + 1
  $('contador').textContent = estado.modo === 'dupla' && ate > estado.pagina + 1 ? `${estado.pagina + 1}-${ate} / ${estado.total}` : `${estado.pagina + 1} / ${estado.total}`
  // na leitura da direita para a esquerda a barra também anda para a esquerda
  $('barra').style.direction = estado.sentido === 'rtl' ? 'rtl' : 'ltr'
}

// ── fim de capítulo ──
const proximoCapitulo = () => estado.serie.capitulos[estado.serie.capitulos.indexOf(estado.cap) + 1]
const capituloAnterior = () => estado.serie.capitulos[estado.serie.capitulos.indexOf(estado.cap) - 1]

function blocoFim() {
  const prox = proximoCapitulo()
  const d = document.createElement('div'); d.className = 'fim'
  const h = document.createElement('h2'); h.textContent = `Fim de ${estado.cap.titulo}`
  const cred = document.createElement('p'); cred.textContent = estado.serie.licenca.credito
  const lic = document.createElement('a'); lic.href = estado.serie.licenca.url; lic.target = '_blank'; lic.rel = 'noopener noreferrer'; lic.textContent = estado.serie.licenca.nome
  cred.append(' ', lic)
  d.append(h, cred)
  if (prox) {
    const a = document.createElement('a'); a.className = 'proximo'
    a.href = `/quadrinho.html?serie=${encodeURIComponent(estado.serie.id)}&cap=${prox.n}`; a.textContent = `Próximo: ${prox.titulo} →`
    d.append(a)
  } else {
    const p = document.createElement('p'); p.textContent = 'Você chegou ao fim da série.'
    const v = document.createElement('a'); v.href = '/quadrinhos.html'; v.className = 'proximo'; v.textContent = 'Ver outras séries'
    d.append(p, v)
  }
  return d
}

function mostrarFim() {
  salvarProgresso(true)
  const f = $('fimPagina'); f.replaceChildren(blocoFim()); f.style.display = 'flex'
  document.body.classList.remove('escondida')
}

function irParaCapitulo(n, pagina = 0) {
  location.href = `/quadrinho.html?serie=${encodeURIComponent(estado.serie.id)}&cap=${n}${pagina ? `&p=${pagina}` : ''}`
}

// ── controles ──
function teclas(e) {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return
  const rtl = estado.sentido === 'rtl'
  if (e.key === 'ArrowRight') { e.preventDefault(); rtl ? voltar() : avancar() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); rtl ? avancar() : voltar() }
  else if (e.key === ' ' && estado.modo !== 'rolagem') { e.preventDefault(); avancar() }
  else if (e.key === 'f' || e.key === 'F') telaCheia()
  else if ((e.key === 't' || e.key === 'T') && !$('traducao').hidden) alternarTraducao()
  else if (e.key === 'm' || e.key === 'M') mudarModo({ rolagem: 'pagina', pagina: innerWidth >= 900 ? 'dupla' : 'rolagem', dupla: 'rolagem' }[estado.modo])
}

function gestos() {
  let x0 = null, y0 = 0, t0 = 0
  const palco = $('palco')
  addEventListener('touchstart', (e) => { if (estado.modo === 'rolagem' || e.touches.length > 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now() }, { passive: true })
  addEventListener('touchend', (e) => {
    if (x0 == null || palco.classList.contains('zoom')) { x0 = null; return }
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0
    x0 = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) || Date.now() - t0 > 700) return
    const rtl = estado.sentido === 'rtl'
    // dedo para a esquerda = "puxar a próxima" no ocidental; no mangá, o contrário
    if (dx < 0) rtl ? voltar() : avancar()
    else rtl ? avancar() : voltar()
  }, { passive: true })
}

function alternarUi(e) {
  if (e.target.closest('.zona')) return
  document.body.classList.toggle('escondida')
}

function agendarEsconder() {
  clearTimeout(escondeTimer)
  document.body.classList.remove('escondida')
  escondeTimer = setTimeout(() => { if (estado.modo !== 'rolagem') document.body.classList.add('escondida') }, 2500)
}

// ── a tradução sobre os balões ──
//
// Uma camada do tamanho exato da imagem, com uma caixa por balão (posições em %
// vindas do OCR). O texto encolhe até caber na caixa. Tudo por textContent.
const camadas = new Set()

function sobrepor(img, caminho) {
  const blocos = estado.traducao?.paginas?.[caminho]?.blocos
  if (!blocos?.length) return
  const camada = document.createElement('div')
  camada.className = 'camada'
  for (const b of blocos) {
    if (!b.t) continue
    const caixa = document.createElement('div')
    caixa.className = b.duvida ? 'balao duvida' : 'balao'
    // um pouco maior que o texto original, para cobrir as letras de baixo
    const folga = 0.6
    caixa.style.left = `${Math.max(0, b.x - folga)}%`
    caixa.style.top = `${Math.max(0, b.y - folga)}%`
    caixa.style.width = `${b.w + folga * 2}%`
    caixa.style.height = `${b.h + folga * 2}%`
    caixa.title = b.o
    caixa.textContent = b.t
    camada.append(caixa)
  }
  img.parentElement.append(camada)
  const posicionar = () => {
    if (!img.isConnected) { camadas.delete(posicionar); camada.remove(); return }
    camada.hidden = !estado.mostrarTraducao
    if (!estado.mostrarTraducao || !img.naturalWidth) return
    const pai = img.parentElement.getBoundingClientRect(), r = img.getBoundingClientRect()
    Object.assign(camada.style, { left: `${r.left - pai.left + img.parentElement.scrollLeft}px`, top: `${r.top - pai.top + img.parentElement.scrollTop}px`, width: `${r.width}px`, height: `${r.height}px` })
    for (const caixa of camada.children) caber(caixa)
  }
  camadas.add(posicionar)
  if (img.complete) posicionar(); else img.addEventListener('load', posicionar, { once: true })
}

function caber(caixa) {
  let tam = Math.min(22, caixa.clientHeight * 0.45)
  caixa.style.fontSize = `${tam}px`
  while (tam > 5 && (caixa.scrollHeight > caixa.clientHeight + 1 || caixa.scrollWidth > caixa.clientWidth + 1)) {
    tam -= 0.5
    caixa.style.fontSize = `${tam}px`
  }
}

let quadroPendente = false
addEventListener('resize', () => {
  if (quadroPendente) return
  quadroPendente = true
  requestAnimationFrame(() => { quadroPendente = false; for (const f of camadas) f() })
})

function alternarTraducao() {
  estado.mostrarTraducao = !estado.mostrarTraducao
  salvarPrefs()
  $('traducao').setAttribute('aria-pressed', String(estado.mostrarTraducao))
  $('traducao').textContent = estado.mostrarTraducao ? 'PT' : 'original'
  for (const f of camadas) f()
  dica(estado.mostrarTraducao ? 'Tradução sobre os balões' : 'Original em inglês')
}

function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen?.()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}

function dica(texto) {
  const d = document.createElement('div'); d.className = 'dica'; d.textContent = texto
  document.body.append(d)
  setTimeout(() => { d.style.opacity = '0' }, 2000)
  setTimeout(() => d.remove(), 2700)
}

iniciar().catch((e) => { document.body.textContent = `Não consegui abrir: ${e.message}` })
