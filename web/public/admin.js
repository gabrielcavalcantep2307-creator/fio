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
  if (!eu) { telaEntrar(); return }
  if (eu.papel !== 'admin') {
    main.replaceChildren(el('p', { class: 'ajuda' },
      'Esta conta não tem acesso ao painel. Entre com a conta de administração.',
      ' ', el('button', { class: 'fraco', onclick: async () => { try { await pedir('/sair', {}) } catch {} ; telaEntrar() } }, 'trocar de conta')))
    return
  }
  document.getElementById('quem').textContent = `entrado como ${eu.usuario}`
  await desenhar()
}

// O painel entra por si só: uma conta de administração digita aqui e não
// depende da tela de login do site. O backend aceita nome de usuário OU e-mail
// no mesmo campo — quem cuida da casa escreve o que lembrar.
function telaEntrar() {
  document.getElementById('quem').textContent = ''
  const ident = el('input', { placeholder: 'curador', autocomplete: 'username' })
  const senha = el('input', { type: 'password', placeholder: 'sua senha', autocomplete: 'current-password' })
  const aviso = el('p', { class: 'recado ruim', style: 'display:none' })
  const form = el('form', { class: 'add', style: 'max-width:360px',
    onsubmit: async (ev) => {
      ev.preventDefault()
      aviso.style.display = 'none'
      const b = ev.submitter; b.disabled = true
      try {
        await pedir('/entrar', { email: ident.value.trim(), senha: senha.value })
        await iniciar()
      } catch (e) {
        b.disabled = false
        aviso.textContent = e.message
        aviso.style.display = ''
      }
    } },
    el('div', {}, el('label', {}, 'usuário ou e-mail'), ident),
    el('div', { style: 'margin-top:10px' }, el('label', {}, 'senha'), senha),
    aviso,
    el('div', { style: 'margin-top:12px' }, el('button', {}, 'Entrar no painel')))
  main.replaceChildren(
    el('p', { class: 'ajuda' }, 'Painel de administração. Entre com a conta de curadoria.'),
    form)
  ident.focus()
}

async function desenhar() {
  main.replaceChildren(el('p', { class: 'ajuda' }, 'Carregando o panorama…'))
  let p, fila, aj
  try { [p, fila, aj] = await Promise.all([pedir('/painel'), pedir('/fila'), pedir('/ajustes')]) }
  catch (e) { main.replaceChildren(recado('ruim', `Não deu para carregar: ${e.message}`)); return }

  main.replaceChildren(
    abas([
      ['panorama', 'Panorama', () => [panorama(p), recentes(p.recentes)]],
      ['esteira', 'Esteira', () => [secaoFila(fila.itens), secaoAdicionar()]],
      ['ajustes', 'Configurações', () => [secaoAjustes(aj)]],
    ]),
  )
}

// A navegação do painel: três frentes, uma de cada vez. Guarda a escolha em
// memória para redesenhos não voltarem sempre ao começo.
let abaAtual = 'panorama'
function abas(defs) {
  const barra = el('div', { class: 'aba', style: 'margin:0 0 22px' })
  const alvo = el('div', {})
  const pintar = () => {
    const def = defs.find((d) => d[0] === abaAtual) ?? defs[0]
    for (const b of barra.children) b.setAttribute('aria-selected', String(b._chave === def[0]))
    alvo.replaceChildren(...def[2]())
  }
  for (const [chave, rotulo] of defs) {
    const b = el('button', { onclick: () => { abaAtual = chave; pintar() } }, rotulo)
    b._chave = chave
    barra.append(b)
  }
  pintar()
  return el('div', {}, barra, alvo)
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

// ── a central de configurações, por seções ──
function grupo(titulo, descricao, ...filhos) {
  return el('div', { class: 'grupo' },
    el('h3', {}, titulo),
    descricao ? el('p', { class: 'ajuda', style: 'margin:2px 0 12px' }, descricao) : '',
    ...filhos)
}

function chave(rotulo, ligado, aoMudar) {
  const inp = el('input', { type: 'checkbox' })
  inp.checked = ligado
  inp.addEventListener('change', () => aoMudar(inp.checked))
  return el('label', { class: 'liga' }, el('span', {}, rotulo), inp)
}

function secaoAjustes(a) {
  const estado = {
    cadastro_aberto: a.cadastro_aberto,
    portao_ativo: a.portao_ativo,
    portao_paginas: a.portao_paginas,
  }
  const paginasCampo = el('input', { type: 'number', min: '1', value: String(a.portao_paginas), style: 'max-width:120px' })

  const s = el('section', {}, el('h2', {}, 'Configurações'))

  s.append(grupo('Quem entra',
    'Com o cadastro aberto, qualquer pessoa cria conta sem precisar de convite. Fechado, só entra quem recebe um código.',
    chave('Cadastro aberto (sem convite)', estado.cadastro_aberto, (v) => { estado.cadastro_aberto = v })))

  s.append(grupo('Portão de leitura',
    `Depois de um tanto de páginas, quem lê sem conta é convidado a criar uma. O padrão é a média de páginas de um livro do acervo vezes cinco — hoje, ${num(a.portao_paginas_padrao)} páginas. Deixe em branco (0) para usar o padrão.`,
    chave('Pedir conta depois do limite', estado.portao_ativo, (v) => { estado.portao_ativo = v }),
    el('label', { class: 'liga', style: 'margin-top:10px' },
      el('span', {}, 'Páginas de graça'), paginasCampo)))

  s.append(grupo('Esteira e jurisdição',
    'Só leitura. Mudam pelo ambiente do servidor, não por aqui.',
    el('div', { class: 'cartoes' },
      cartao(a.esteira_paralelo, 'traduções em paralelo'),
      cartao(a.jurisdicao, 'jurisdição de direito'))))

  const botao = el('button', {}, 'Salvar configurações')
  const salvar = el('form', { class: 'add', onsubmit: async (ev) => {
    ev.preventDefault()
    botao.disabled = true
    try {
      await pedir('/ajustes', {
        cadastro_aberto: estado.cadastro_aberto,
        portao_ativo: estado.portao_ativo,
        portao_paginas: Number(paginasCampo.value) || 0,
      })
      await desenhar()
      main.prepend(recado('bom', 'Configurações salvas.'))
    } catch (e) { botao.disabled = false; main.prepend(recado('ruim', e.message)) }
  } }, el('div', {}, botao))
  s.append(salvar)
  return s
}

function recentes(lista) {
  const s = el('section', {}, el('h2', {}, 'Últimos que subiram'))
  if (!lista?.length) { s.append(el('div', { class: 'vazio' }, 'nada ainda')); return s }
  const t = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Título'), el('th', {}, 'Autor'), el('th', {}, 'Quando'))))
  const corpo = el('tbody', {})
  for (const o of lista) {
    corpo.append(el('tr', {},
      // o site navega por hash: `/obra/12` abria a home
      el('td', {}, el('a', { href: `/#/obra/${o.id}` }, o.titulo)),
      el('td', {}, o.autor || '—'),
      el('td', { class: 'mono' }, (o.criado_em || '').slice(0, 16))))
  }
  t.append(corpo); s.append(t)
  return s
}

iniciar()
