// O painel do Fio, do lado do navegador.
//
// Página separada do app (cujo fonte se perdeu), como a estante particular. Ela
// não guarda segredo nenhum: tudo que mostra vem de rotas que exigem sessão de
// ADMIN no servidor. Um leitor comum que abrir /admin.html recebe "sem acesso"
// e as rotas respondem 404 para ele — o painel nem se revela.

const API = '/api'
const pedir = (caminho, corpo) => fetch(API + caminho, {
  method: corpo ? 'POST' : 'GET',
  headers: corpo ? { 'content-type': 'application/json', 'x-fio': '1' } : {},
  body: corpo ? JSON.stringify(corpo) : undefined,
  credentials: 'include',
}).then(async (r) => {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `erro ${r.status}`)
  return j
})

const el = (tag, attrs = {}, ...filhos) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else if (k === 'html') e.innerHTML = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (v != null) e.setAttribute(k, v)
  }
  for (const f of filhos) e.append(f?.nodeType ? f : document.createTextNode(String(f ?? '')))
  return e
}
const num = (n) => (n ?? 0).toLocaleString('pt-BR')
const main = document.getElementById('main')

async function iniciar() {
  let eu
  try { eu = (await pedir('/eu')).pessoa } catch { eu = null }
  if (!eu) {
    main.replaceChildren(el('p', { class: 'ajuda' },
      'Você precisa entrar. ', el('a', { href: '/' }, 'Entrar no site'),
      ' com a conta de administração, e voltar a esta página.'))
    return
  }
  if (eu.papel !== 'admin') {
    main.replaceChildren(el('p', { class: 'ajuda' },
      'Esta conta não tem acesso ao painel. Entre com a conta de administração.'))
    return
  }
  document.getElementById('quem').textContent = `entrado como ${eu.usuario}`
  await desenhar()
}

async function desenhar() {
  main.replaceChildren(el('p', { class: 'ajuda' }, 'Carregando o panorama…'))
  let p, fila
  try { [p, fila] = await Promise.all([pedir('/painel'), pedir('/fila')]) }
  catch (e) { main.replaceChildren(recado('ruim', `Não deu para carregar: ${e.message}`)); return }

  main.replaceChildren(
    panorama(p),
    secaoFila(fila.itens),
    secaoAdicionar(),
    recentes(p.recentes),
  )
}

const recado = (tipo, texto) => el('div', { class: `recado ${tipo}` }, texto)

function cartao(n, r) {
  return el('div', { class: 'cartao' }, el('div', { class: 'n' }, num(n)), el('div', { class: 'r' }, r))
}

function panorama(p) {
  const a = p.acervo, f = p.fila
  return el('section', {},
    el('h2', {}, 'O acervo'),
    el('div', { class: 'cartoes' },
      cartao(a.legiveis, 'livros para ler'),
      cartao(a.obras, 'obras no catálogo'),
      cartao(a.nossas, 'traduzidos por nós'),
      cartao(Math.round(a.palavras / 1e6) + ' mi', 'palavras'),
      cartao(a.autores, 'autores'),
      cartao(p.leitores.contas, 'contas de leitor')),
    el('h2', { style: 'margin-top:22px' }, 'A esteira de tradução'),
    el('div', { class: 'cartoes' },
      cartao(f.espera, 'na fila, esperando'),
      cartao(f.na_esteira, 'traduzindo agora'),
      cartao(f.pronto, 'prontos'),
      cartao(f.erro, 'com erro')))
}

function secaoFila(itens) {
  const s = el('section', {}, el('h2', {}, `Fila de tradução (${itens.length})`))
  if (!itens.length) { s.append(el('div', { class: 'vazio' }, 'A fila está vazia. Adicione livros abaixo.')); return s }
  const t = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Título'), el('th', {}, 'Autor'), el('th', {}, 'De'),
      el('th', {}, 'Estado'), el('th', {}, ''))))
  const corpo = el('tbody', {})
  for (const it of itens) {
    const acao = ['espera', 'erro'].includes(it.estado)
      ? el('button', { class: 'fraco', onclick: () => remover(it.id) }, 'tirar')
      : ''
    corpo.append(el('tr', {},
      el('td', {}, it.titulo),
      el('td', {}, it.autor),
      el('td', { class: 'mono' }, it.idioma),
      el('td', {}, el('span', { class: `selo ${it.estado}`, title: it.nota || '' }, rotulo(it.estado))),
      el('td', {}, acao)))
  }
  t.append(corpo); s.append(t)
  return s
}

const rotulo = (e) => ({ espera: 'esperando', na_esteira: 'traduzindo', pronto: 'pronto', erro: 'erro' }[e] ?? e)

function secaoAdicionar() {
  const s = el('section', {}, el('h2', {}, 'Adicionar livros à fila'))
  s.append(el('p', { class: 'ajuda' },
    'Só domínio público, e a fonte tem de ser o original no Project Gutenberg. ',
    'A esteira, na máquina do dono, puxa esta fila e traduz — os livros aparecem no site quando ficam prontos.'))

  const abas = el('div', { class: 'aba' })
  const bUm = el('button', { 'aria-selected': 'true' }, 'Um livro')
  const bLote = el('button', { 'aria-selected': 'false' }, 'Vários (colar lista)')
  abas.append(bUm, bLote)
  s.append(abas)

  // ── um livro ──
  const titulo = el('input', { placeholder: 'em português, ex.: A Ilha do Tesouro' })
  const autor = el('input', { placeholder: 'ex.: Robert Louis Stevenson' })
  const gut = el('input', { placeholder: 'id ou URL do Gutenberg, ex.: 120' })
  const idioma = el('input', { placeholder: 'en', value: 'en' })
  const formUm = el('form', { class: 'add', onsubmit: enviarUm },
    el('div', { class: 'campos' },
      el('div', {}, el('label', {}, 'Título'), titulo),
      el('div', {}, el('label', {}, 'Autor'), autor),
      el('div', {}, el('label', {}, 'Gutenberg'), gut),
      el('div', {}, el('label', {}, 'Língua'), idioma)),
    el('div', { style: 'margin-top:12px' }, el('button', {}, 'Adicionar à fila')))

  // ── lote ──
  const area = el('textarea', {
    placeholder: 'Um por linha, separado por | :\nTítulo | Autor | id-do-gutenberg | língua\n\nA Ilha do Tesouro | Robert Louis Stevenson | 120 | en\nFrankenstein | Mary Shelley | 84 | en',
  })
  const formLote = el('form', { class: 'add', hidden: true, onsubmit: enviarLote },
    area, el('div', { style: 'margin-top:12px' }, el('button', {}, 'Adicionar todos')))

  bUm.onclick = () => { bUm.setAttribute('aria-selected', 'true'); bLote.setAttribute('aria-selected', 'false'); formUm.hidden = false; formLote.hidden = true }
  bLote.onclick = () => { bLote.setAttribute('aria-selected', 'true'); bUm.setAttribute('aria-selected', 'false'); formLote.hidden = false; formUm.hidden = true }

  s.append(formUm, formLote)
  s._campos = { titulo, autor, gut, idioma, area }
  return s
}

async function enviar(livros, botao) {
  botao.disabled = true
  try {
    const r = await pedir('/fila', { livros })
    const msg = `${r.aceitos} adicionado(s)` + (r.recusados.length ? `, ${r.recusados.length} recusado(s)` : '')
    await desenhar()
    main.prepend(recado(r.aceitos ? 'bom' : 'ruim', msg + (r.recusados[0] ? ` — ${r.recusados[0].porque}` : '')))
  } catch (e) {
    botao.disabled = false
    main.prepend(recado('ruim', e.message))
  }
}

function enviarUm(ev) {
  ev.preventDefault()
  const c = ev.target.closest('section')._campos
  enviar([{ titulo: c.titulo.value, autor: c.autor.value, gutenberg: c.gut.value, idioma: c.idioma.value }], ev.submitter)
}

function enviarLote(ev) {
  ev.preventDefault()
  const c = ev.target.closest('section')._campos
  const livros = c.area.value.split('\n').map((l) => l.trim()).filter(Boolean).map((linha) => {
    const [titulo, autor, gutenberg, idioma] = linha.split('|').map((x) => x.trim())
    return { titulo, autor, gutenberg, idioma: idioma || 'en' }
  })
  if (!livros.length) return
  enviar(livros, ev.submitter)
}

async function remover(id) {
  try { await pedir('/fila/remover', { id }); await desenhar() }
  catch (e) { main.prepend(recado('ruim', e.message)) }
}

function recentes(lista) {
  const s = el('section', {}, el('h2', {}, 'Últimos que subiram'))
  if (!lista?.length) { s.append(el('div', { class: 'vazio' }, 'nada ainda')); return s }
  const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Título'), el('th', {}, 'Autor'), el('th', {}, 'Quando'))))
  const corpo = el('tbody', {})
  for (const o of lista) {
    corpo.append(el('tr', {},
      el('td', {}, el('a', { href: `/obra/${o.id}` }, o.titulo)),
      el('td', {}, o.autor || '—'),
      el('td', { class: 'mono' }, (o.criado_em || '').slice(0, 16))))
  }
  t.append(corpo); s.append(t)
  return s
}

iniciar()
