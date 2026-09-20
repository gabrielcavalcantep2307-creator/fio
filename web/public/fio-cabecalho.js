// A barra, o sino, o rodapé e os convites aos planos — em TODO o site, app
// incluído (19/09/2026).
//
// Até aqui o app tinha um cabeçalho dentro do bundle e as páginas soltas
// tinham outro, parecido. O dono pediu hierarquia: Buscar · Estante ·
// Quadrinhos ▾ · Comunidade ▾, e no canto direito o tema, o painel (só admin),
// o sino e o perfil. Agora é um cabeçalho só: o do bundle devolve nada e só
// entrega duas funções (window.fioAbrirBusca e window.fioMudarPrefs; ver
// infra/remendar-bundle.mjs).
//
//   <body data-area="quadrinhos" data-sub="comunidade" data-sub-atual="explorar">
//
// `data-area` acende o item da barra; `data-sub` desenha a sub-barra da área.
// Tudo por nó de texto e SVG montado aqui; nenhum HTML vindo de fora.
//
// O que se inspirou em quem faz isso há anos:
//   sino com número e painel que abre no lugar (GitHub, YouTube, LinkedIn):
//     "Todas / Não lidas", ponto no não lido, tempo relativo, "marcar todas";
//   menus que abrem ao passar o mouse e ao tocar (Stripe, Wattpad), com uma
//     linha dizendo o que tem em cada lugar;
//   rodapé em colunas com o institucional por último (Project Gutenberg,
//     Wikipédia, Standard Ebooks, Wattpad);
//   o contador de "livros grátis deste mês" (NYT, Medium, Scribd) e um convite
//     que dá para dispensar e que não volta toda hora.

(function () {
  if (window.fioBarraMontada) return
  window.fioBarraMontada = true

  const h = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v)
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
    return e
  }
  const NS = 'http://www.w3.org/2000/svg'
  const ICONES = {
    busca: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M20 20l-4.3-4.3',
    sol: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
    lua: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    sino: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8 M10.3 21a1.9 1.9 0 0 0 3.4 0',
    painel: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    seta: 'M6 9l6 6 6-6',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    fechar: 'M6 6l12 12 M18 6L6 18',
    livro: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    bandeira: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
    lapis: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    gente: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
    estrela: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  }
  function icone(nome, tam = 18) {
    const s = document.createElementNS(NS, 'svg')
    for (const [k, v] of Object.entries({ width: tam, height: tam, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) s.setAttribute(k, v)
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONES[nome]); s.append(p)
    return s
  }
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const lerGuardado = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }

  const noApp = !!document.getElementById('raiz')
  const esquecerQuem = () => { try { localStorage.removeItem('fio:quem'); sessionStorage.removeItem('fio:barra') } catch {} }

  // ── tema: o mesmo guardado do app ──
  const CHAVE = 'fio.estante.v1'
  const ESCUROS = new Set(['noturno', 'carvao', 'penumbra', 'musgo', 'tinta', 'ambar'])
  const temaAtual = () => document.documentElement.dataset.tema || lerGuardado(CHAVE)?.prefs?.tema || 'claro'
  if (!noApp) document.documentElement.dataset.tema = lerGuardado(CHAVE)?.prefs?.tema || 'claro'
  function trocarTema() {
    const novo = ESCUROS.has(temaAtual()) ? 'claro' : 'noturno'
    if (noApp && window.fioMudarPrefs) window.fioMudarPrefs({ tema: novo })
    else {
      const g = lerGuardado(CHAVE) || {}
      g.prefs = { ...(g.prefs || {}), tema: novo }
      g.prefsMudouEm = Date.now()
      guardar(CHAVE, g)
    }
    document.documentElement.dataset.tema = novo
    desenhar()
  }

  // A busca mora no app: dentro dele, abre na hora; fora, marca o pedido e vai.
  function buscar() {
    if (noApp && window.fioAbrirBusca) { window.fioAbrirBusca(); return }
    try { sessionStorage.setItem('fio:abrir-busca', '1') } catch {}
    location.href = '/#/'
  }

  // ── onde estamos ──
  function areaAtual() {
    if (!noApp) return document.body.dataset.area || ''
    const r = location.hash.replace(/^#/, '')
    if (r.startsWith('/estante')) return 'estante'
    if (r.startsWith('/caderno')) return 'comunidade'
    if (r.startsWith('/entrar')) return 'conta'
    return ''
  }
  const noLeitor = () => noApp && /^#\/ler\//.test(location.hash)

  // ── o que tem em cada menu ──
  const MENUS = {
    quadrinhos: {
      rotulo: 'Quadrinhos', href: '/quadrinhos.html',
      itens: [
        ['Descobrir', '/quadrinhos.html', 'Os mangás, manhwas e manhuas mais lidos desde 2010'],
        ['Mangá', '/quadrinhos.html?tipo=manga', 'Só os japoneses, dos mais populares'],
        ['Ler aqui', '/quadrinhos.html?aba=aqui', 'Quadrinhos livres, inteiros, para ler no site'],
      ],
    },
    comunidade: {
      rotulo: 'Comunidade', href: '/publicacoes.html',
      itens: [
        ['Explorar', '/publicacoes.html', 'Livros e quadrinhos de quem escreve e desenha aqui'],
        ['Publicar', '/publicar.html', 'Mostre o que você escreve ou desenha'],
        ['Planos', '/assinaturas.html', 'Ler sem limite, ouvir, baixar e publicar'],
        ['Caderno', '/#/caderno', 'Suas marcações e notas de leitura'],
      ],
    },
  }

  // A barra desenha ANTES de o servidor dizer quem está entrado. Começar
  // supondo "visitante" fazia o botão "Criar conta grátis" piscar na tela de
  // quem já tinha conta a cada F5. Então ela começa com a última pessoa
  // conhecida NESTE navegador (só nome, usuário e papel; nada secreto) e
  // corrige quando a resposta chega. Enquanto não sabe, não mostra nem
  // "entrar" nem o perfil: melhor um canto vazio por um instante do que a
  // informação errada.
  const LEMBRANCA = 'fio:quem'
  let sabemos = false
  let eu = null, plano = null, avisos = 0, menuAberto = false, abertos = null
  try {
    const l = lerGuardado(LEMBRANCA)
    if (l && l.eu) { eu = l.eu; plano = l.plano ?? null; avisos = l.avisos ?? 0 }
  } catch { /* navegador sem localStorage */ }
  const barra = h('header', { class: 'fio-barra' })
  const SUBS = {
    comunidade: MENUS.comunidade.itens.map(([rot, href]) => [rot.toLowerCase(), href, rot]),
    central: [['recs', '/central.html#recs', 'Para você'], ['cegas', '/central.html#cegas', 'Encontro às cegas'], ['avisos', '/central.html#avisos', 'Notificações'], ['gosto', '/central.html#gosto', 'Meu gosto'], ['pedidos', '/central.html#pedidos', 'Pedidos de tradução'], ['planos', '/assinaturas.html', 'Meu plano']],
  }
  const sub = !noApp && document.body.dataset.sub && SUBS[document.body.dataset.sub] ? h('div', { class: 'fio-sub' }) : null

  const primeiroNome = () => eu ? ((eu.nome || eu.usuario || '').split(' ').find((p) => p && !/\.$/.test(p)) || eu.usuario || 'conta') : ''

  // um menu que abre ao passar o mouse (computador) e ao tocar/teclar (todos)
  function suspenso(chave, gatilho, painel, { direita = false } = {}) {
    const caixa = h('div', { class: `fio-susp${direita ? ' direita' : ''}${abertos === chave ? ' aberto' : ''}`, 'data-chave': chave })
    let fecharDepois = null
    const abrir = () => { clearTimeout(fecharDepois); if (abertos !== chave) { abertos = chave; marcarAbertos() } }
    const fechar = () => { fecharDepois = setTimeout(() => { if (abertos === chave) { abertos = null; marcarAbertos() } }, 180) }
    caixa.addEventListener('mouseenter', (e) => { if (e.pointerType !== 'touch' && matchMedia('(hover: hover)').matches && chave !== 'sino' && chave !== 'perfil') abrir() })
    caixa.addEventListener('mouseleave', () => { if (matchMedia('(hover: hover)').matches && chave !== 'sino' && chave !== 'perfil') fechar() })
    gatilho.setAttribute('aria-haspopup', 'true')
    gatilho.setAttribute('aria-expanded', String(abertos === chave))
    caixa.append(gatilho, h('div', { class: 'fio-painel', role: 'menu' }, painel))
    return caixa
  }
  function marcarAbertos() {
    for (const c of barra.querySelectorAll('.fio-susp')) {
      const aberto = c.dataset.chave === abertos
      c.classList.toggle('aberto', aberto)
      c.firstElementChild?.setAttribute('aria-expanded', String(aberto))
    }
    if (abertos === 'sino') carregarAvisos()
  }
  document.addEventListener('click', (e) => { if (abertos && !e.target.closest?.('.fio-susp')) { abertos = null; marcarAbertos() } })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abertos) { abertos = null; marcarAbertos() } })

  function menuArea(chave) {
    const m = MENUS[chave]
    const atual = areaAtual() === chave
    const gatilho = h('a', { class: 'm', href: m.href, 'aria-current': atual ? 'page' : null,
      onclick: (e) => {
        // no toque, o primeiro toque abre o menu; o segundo segue o link
        if (!matchMedia('(hover: hover)').matches && abertos !== chave) { e.preventDefault(); e.stopPropagation(); abertos = chave; marcarAbertos() }
      },
      onkeydown: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); abertos = chave; marcarAbertos(); barra.querySelector(`[data-chave="${chave}"] .fio-painel a`)?.focus() } },
    }, m.rotulo, icone('seta', 13))
    const lista = h('div', { class: 'fio-lista' }, m.itens.map(([rot, href, desc]) =>
      h('a', { href, role: 'menuitem' }, h('strong', {}, rot), h('span', {}, desc))))
    return suspenso(chave, gatilho, lista)
  }

  // ── o sino ──
  let listaAvisos = null, filtroAvisos = 'todas', carregandoAvisos = false
  const TIPO_ICONE = { seguranca: 'escudo', denuncia: 'bandeira', correcao: 'lapis', revisao: 'lapis', seguindo: 'gente', publicacao: 'gente', boasvindas: 'estrela', titulo: 'estrela', plano: 'estrela', presente: 'estrela', contato: 'gente' }
  function quando(s) {
    const d = new Date(String(s).replace(' ', 'T') + 'Z')
    const seg = (Date.now() - d) / 1000
    if (!(seg >= 0)) return ''
    if (seg < 60) return 'agora'
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`
    if (seg < 172800) return 'ontem'
    if (seg < 7 * 86400) return `há ${Math.floor(seg / 86400)} dias`
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
  }
  async function carregarAvisos() {
    if (carregandoAvisos || !eu) return
    carregandoAvisos = true
    try { const r = await fioApi.pedir('/avisos'); listaAvisos = r.avisos || []; avisos = r.naoLidos || 0 } catch { listaAvisos = listaAvisos || [] }
    carregandoAvisos = false
    desenharSino()
  }
  const caixaSino = h('div', { class: 'fio-sino-conteudo' })
  function desenharSino() {
    for (const cont of barra.querySelectorAll('.fio-sino .num')) { cont.textContent = avisos > 9 ? '9+' : String(avisos); cont.hidden = !avisos }
    const itens = (listaAvisos || []).filter((a) => filtroAvisos === 'todas' || !a.lido).slice(0, 20)
    caixaSino.replaceChildren(
      h('div', { class: 'topo' }, h('strong', {}, 'Notificações'),
        avisos ? h('button', { type: 'button', class: 'link', onclick: async (e) => {
          e.stopPropagation()
          try { await fioApi.pedir('/avisos/lido', {}) } catch {}
          for (const a of listaAvisos || []) a.lido = 1
          avisos = 0; desenharSino()
        } }, 'Marcar todas como lidas') : null),
      h('div', { class: 'filtros', role: 'tablist' },
        [['todas', 'Todas'], ['nao', `Não lidas${avisos ? ` (${avisos})` : ''}`]].map(([k, rot]) =>
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtroAvisos === k), onclick: (e) => { e.stopPropagation(); filtroAvisos = k; desenharSino() } }, rot))),
      listaAvisos == null ? h('p', { class: 'vazio' }, 'Carregando…')
        : !itens.length ? h('p', { class: 'vazio' }, filtroAvisos === 'nao' ? 'Nada novo. Você está em dia.' : 'Quando algo acontecer — um livro que você pediu ficar pronto, alguém responder, um aviso de segurança — aparece aqui.')
          : h('ul', { class: 'lista' }, itens.map((a) => h('li', { class: a.lido ? '' : 'novo' },
            h('a', { href: a.link || '/central.html#avisos', onclick: async (e) => {
              if (a.lido) return
              e.preventDefault()
              try { await fioApi.pedir('/avisos/lido', { id: a.id }) } catch {}
              a.lido = 1; avisos = Math.max(0, avisos - 1)
              location.href = a.link || '/central.html#avisos'
            } },
            h('span', { class: `ic ic-${TIPO_ICONE[a.tipo] ? a.tipo : 'livro'}` }, icone(TIPO_ICONE[a.tipo] || 'livro', 16)),
            h('span', { class: 'txt' }, h('b', {}, a.titulo), a.corpo ? h('span', {}, a.corpo) : null, h('time', {}, quando(a.criado_em))),
            a.lido ? null : h('span', { class: 'ponto', 'aria-label': 'não lida' }))))),
      h('a', { class: 'todas', href: '/central.html#avisos' }, 'Ver todas as notificações'))
  }
  function sino() {
    const gatilho = h('button', { type: 'button', class: 'ico fio-sino', 'aria-label': `Notificações${avisos ? ` (${avisos} novas)` : ''}`, title: 'Notificações',
      onclick: (e) => { e.stopPropagation(); abertos = abertos === 'sino' ? null : 'sino'; marcarAbertos() } },
    icone('sino', 19), h('span', { class: 'num', hidden: !avisos }, avisos > 9 ? '9+' : String(avisos)))
    desenharSino()
    return suspenso('sino', gatilho, caixaSino, { direita: true })
  }

  // ── o perfil ──
  function perfil() {
    const nomePlano = plano?.meu?.nome || 'Grátis'
    const pago = plano?.meu && plano.meu.plano !== 'leitor'
    const gatilho = h('button', { type: 'button', class: 'm perfil', onclick: (e) => { e.stopPropagation(); abertos = abertos === 'perfil' ? null : 'perfil'; marcarAbertos() } },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, primeiroNome().slice(0, 1).toUpperCase()), primeiroNome().toLowerCase(), icone('seta', 13))
    const sair = async () => { try { await fioApi.pedir('/sair', {}) } catch {} window.fioDono?.saiu(); esquecerQuem(); location.href = '/' }
    const lista = h('div', { class: 'fio-lista curta' },
      h('div', { class: 'quem' }, h('strong', {}, eu.nome || eu.usuario), h('span', {}, `@${eu.usuario}`),
        h('span', { class: `selo-plano${pago ? ' pago' : ''}` }, pago ? `Plano ${nomePlano} · presente da casa` : `Plano ${nomePlano}`)),
      h('a', { href: '/conta.html', role: 'menuitem' }, 'Minha conta'),
      h('a', { href: '/central.html#recs', role: 'menuitem' }, 'Recomendações para você'),
      h('a', { href: '/central.html#gosto', role: 'menuitem' }, 'Meu gosto'),
      h('a', { href: '/central.html#pedidos', role: 'menuitem' }, 'Pedidos de tradução'),
      h('a', { href: '/assinaturas.html', role: 'menuitem' }, pago ? 'Meu plano' : (plano?.meu?.quer ? 'Meu pedido de presente' : 'Pedir um plano de presente')),
      h('a', { href: '/conta.html#dados', role: 'menuitem' }, 'Privacidade e dados'),
      h('button', { type: 'button', role: 'menuitem', onclick: sair }, 'Sair'))
    return suspenso('perfil', gatilho, lista, { direita: true })
  }

  function cantos(largo) {
    return h('div', { class: 'cantos' },
      h('button', { type: 'button', class: 'ico', title: ESCUROS.has(temaAtual()) ? 'Tema claro' : 'Tema noturno', 'aria-label': ESCUROS.has(temaAtual()) ? 'Usar o tema claro' : 'Usar o tema noturno', onclick: trocarTema },
        icone(ESCUROS.has(temaAtual()) ? 'sol' : 'lua', 19)),
      eu?.papel === 'admin' ? h('a', { class: 'ico adm', href: '/admin.html', title: 'Painel de administração', 'aria-label': 'Painel de administração', 'aria-current': areaAtual() === 'painel' ? 'page' : null }, icone('painel', 19)) : null,
      eu ? sino() : null,
      largo ? (eu ? perfil() : sabemos ? [
        h('a', { class: 'm', href: '/#/entrar' }, 'Entrar'),
        h('a', { class: 'botao-conta', href: '/#/entrar' }, 'Criar conta grátis'),
      ] : h('span', { class: 'esperando', 'aria-hidden': 'true' })) : null)
  }

  function menuCelular() {
    const grupo = (titulo, itens) => h('div', { class: 'grupo' }, titulo ? h('p', {}, titulo) : null, itens)
    const link = (rot, href) => h('a', { href, onclick: () => { menuAberto = false } }, rot)
    return h('nav', { class: 'fio-menu', 'aria-label': 'Menu' },
      grupo(null, [h('button', { type: 'button', onclick: () => { menuAberto = false; desenhar(); buscar() } }, 'Buscar'), link('Estante', '/#/estante')]),
      grupo('Quadrinhos', MENUS.quadrinhos.itens.map(([r, u]) => link(r, u))),
      grupo('Comunidade', MENUS.comunidade.itens.map(([r, u]) => link(r, u))),
      eu ? grupo(`Conta · ${primeiroNome()}`, [link('Minha conta', '/conta.html'), link('Notificações', '/central.html#avisos'), link('Recomendações para você', '/central.html#recs'),
        link(plano?.meu?.plano && plano.meu.plano !== 'leitor' ? 'Meu plano' : 'Pedir um plano de presente', '/assinaturas.html'),
        eu.papel === 'admin' ? link('Painel de administração', '/admin.html') : null,
        h('button', { type: 'button', onclick: async () => { try { await fioApi.pedir('/sair', {}) } catch {} window.fioDono?.saiu(); esquecerQuem(); location.href = '/' } }, 'Sair')])
        : grupo('Conta', [link('Entrar', '/#/entrar'), link('Criar conta grátis', '/#/entrar')]),
      grupo(null, [h('button', { type: 'button', onclick: trocarTema }, ESCUROS.has(temaAtual()) ? 'Usar o tema claro' : 'Usar o tema noturno')]))
  }

  function desenhar() {
    const area = areaAtual()
    barra.hidden = noLeitor()
    barra.replaceChildren(
      h('div', { class: 'dentro' },
        h('a', { class: 'logo', href: '/#/', 'aria-label': 'Fiolib — início' }, h('img', { src: '/fio.svg', alt: '' }), h('span', {}, 'Fiolib')),
        h('nav', { class: 'largo', 'aria-label': 'Principal' },
          h('button', { class: 'm', type: 'button', title: 'Buscar ( / )', onclick: buscar }, icone('busca', 15), 'Buscar'),
          h('a', { class: 'm', href: '/#/estante', 'aria-current': area === 'estante' ? 'page' : null }, 'Estante'),
          menuArea('quadrinhos'),
          menuArea('comunidade')),
        h('div', { class: 'largo-cantos' }, cantos(true)),
        h('div', { class: 'curto' },
          h('button', { type: 'button', class: 'ico', 'aria-label': 'Buscar', onclick: buscar }, icone('busca', 20)),
          // no celular o sino leva à página das notificações (como no YouTube)
          eu ? h('a', { class: 'ico fio-sino', href: '/central.html#avisos', 'aria-label': `Notificações${avisos ? ` (${avisos} novas)` : ''}` },
            icone('sino', 20), h('span', { class: 'num', hidden: !avisos }, avisos > 9 ? '9+' : String(avisos))) : null,
          h('button', { type: 'button', class: 'ico', 'aria-label': menuAberto ? 'Fechar o menu' : 'Abrir o menu', 'aria-expanded': String(menuAberto),
            onclick: () => { menuAberto = !menuAberto; desenhar() } }, icone(menuAberto ? 'fechar' : 'menu', 22)))),
      ...(menuAberto ? [menuCelular()] : []))
    if (sub) {
      const atual = document.body.dataset.subAtual || ''
      sub.hidden = noLeitor()
      sub.replaceChildren(h('div', { class: 'dentro' }, SUBS[document.body.dataset.sub].map(([chave, href, rot]) =>
        h('a', { href, 'aria-current': chave === atual ? 'page' : null, 'data-chave': chave }, rot))))
    }
    rodape.hidden = noLeitor()
    faixa.hidden = noLeitor() || !faixa.childElementCount
  }

  // ── o rodapé ──
  const ANO = new Date().getFullYear()
  const col = (titulo, links) => h('div', { class: 'col' }, h('h2', {}, titulo), h('ul', {}, links.map(([rot, href]) => h('li', {}, h('a', { href }, rot)))))
  const rodape = h('footer', { class: 'fio-rodape' },
    h('div', { class: 'dentro' },
      h('div', { class: 'sobre' },
        h('a', { class: 'logo', href: '/#/' }, h('img', { src: '/fio.svg', alt: '' }), h('span', {}, 'Fiolib')),
        h('p', {}, 'Biblioteca online e gratuita de livros em português: clássicos em domínio público, leis brasileiras, quadrinhos livres e obras publicadas pelos próprios leitores.'),
        h('p', { class: 'selos-rodape' }, h('span', {}, 'Sem anúncios'), h('span', {}, 'Sem venda de dados'), h('span', {}, 'Lei 9.610/98 e LGPD')),
        h('p', { class: 'presente-rodape' }, 'A casa está começando: os planos ainda não são vendidos — são ', h('a', { href: '/assinaturas.html' }, 'dados de presente a quem pede'), '.')),
      col('Acervo', [['Todos os livros', '/livros'], ['Autores', '/autores'], ['Quadrinhos e mangá', '/quadrinhos.html'], ['Comunidade', '/publicacoes.html']]),
      col('Sua conta', [['Entrar ou criar conta', '/#/entrar'], ['Planos', '/assinaturas.html'], ['Notificações', '/central.html#avisos'], ['Privacidade e dados', '/conta.html#dados']]),
      col('A Fiolib', [['Direitos autorais e o acervo', '/direitos.html'], ['Termos de uso', '/termos.html'], ['Política de privacidade', '/privacidade.html'], ['Denunciar um conteúdo', '/direitos.html#avisar'], ['Fale com a gente', '/direitos.html#contato']])),
    h('div', { class: 'baixo' },
      h('p', {}, `© ${ANO} Fiolib. Os livros daqui estão em domínio público no Brasil ou foram publicados com licença livre ou pelos próprios autores. Obras protegidas não são hospedadas — dos quadrinhos comerciais mostramos só a ficha e o caminho para a edição oficial.`),
      h('p', {}, 'Achou algo que não deveria estar aqui? ', h('a', { href: '/direitos.html#avisar' }, 'Avise a gente'), ' — tiramos do ar enquanto verificamos.')))

  // ── os convites (faixa, lembrete e janela) ──
  const faixa = h('div', { class: 'fio-faixa', hidden: true })
  const DIA = 86_400_000
  const podeMostrar = (chave, dias) => { const t = lerGuardado(`fio:convite:${chave}`); return !t || Date.now() - t > dias * DIA }
  const lembrar = (chave) => guardar(`fio:convite:${chave}`, Date.now())
  const lugarSemConvite = () => noLeitor() || /\/(assinaturas|conta|entrar-google)\.html/.test(location.pathname) || /^#\/entrar/.test(location.hash)
  const dinheiro = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  function faixaSemConta() {
    if (eu || lugarSemConvite() || !podeMostrar('faixa-conta', 7)) return
    faixa.replaceChildren(h('div', { class: 'dentro' },
      h('p', {}, h('strong', {}, 'Crie sua conta grátis aqui. '), 'Leia 3 livros inteiros por mês — e, enquanto a Fiolib está começando, peça um plano de presente: chega em até 24 h, sem cartão.'),
      h('a', { class: 'botao-conta', href: '/#/entrar' }, 'Criar conta'),
      h('button', { type: 'button', class: 'ico', 'aria-label': 'Dispensar', onclick: () => { lembrar('faixa-conta'); faixa.replaceChildren(); faixa.hidden = true } }, icone('fechar', 16))))
    faixa.hidden = false
  }

  function lembrete(conteudo, chave) {
    const t = h('aside', { class: 'fio-lembrete', role: 'status' }, conteudo,
      h('button', { type: 'button', class: 'ico fechar', 'aria-label': 'Fechar', onclick: () => { lembrar(chave); t.remove() } }, icone('fechar', 15)))
    document.body.append(t)
    setTimeout(() => t.classList.add('visivel'), 50)
  }

  async function pedirPresente(botao, planoChave = 'novelo') {
    botao.disabled = true
    try {
      await fioApi.pedir('/planos/quero', { plano: planoChave })
      botao.textContent = 'Pedido feito: chega em até 24 h'
      if (plano?.meu) plano.meu.quer = { plano: planoChave }
      try { sessionStorage.removeItem('fio:barra') } catch {}
    } catch (e) { botao.disabled = false; botao.textContent = e.message }
  }
  function acaoDoPlano(p, grande = false) {
    if (plano?.disponivel) return h('a', { class: `botao-conta${grande ? ' grande' : ''}`, href: `/assinaturas.html?plano=${p}` }, 'Assinar')
    if (plano?.meu?.quer) return h('span', { class: 'ja' }, 'Pedido feito — chega em até 24 h')
    return h('button', { type: 'button', class: `botao-conta${grande ? ' grande' : ''}`, onclick: (e) => pedirPresente(e.currentTarget, p) }, 'Pedir de presente')
  }

  function janelaDosPlanos() {
    const pagos = (plano?.planos || []).filter((p) => p.preco)
    if (!pagos.length) return
    lembrar('janela')
    const fechar = () => fundo.remove()
    const fundo = h('div', { class: 'fio-modal-fundo', onclick: (e) => { if (e.target === fundo) fechar() } },
      h('div', { class: 'fio-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fio-modal-t' },
        h('button', { type: 'button', class: 'ico fechar', 'aria-label': 'Fechar', onclick: fechar }, icone('fechar', 18)),
        h('p', { class: 'olho' }, plano?.disponivel ? 'Planos da Fiolib' : 'Presente da casa'),
        h('h2', { id: 'fio-modal-t' }, 'Leia sem limite, ouça e leve para o Kindle'),
        h('p', { class: 'sub' }, plano?.disponivel ? 'Escolha o seu. Dá para cancelar quando quiser.'
          : 'A Fiolib está começando e ainda não cobra nada: os planos são de presente para quem pedir. O seu chega em até 24 horas, sem cartão e sem cobrança depois.'),
        h('div', { class: 'cartoes' }, pagos.map((p) => h('div', { class: `cartao${p.chave === 'novelo' ? ' destaque' : ''}` },
          p.chave === 'novelo' ? h('span', { class: 'fita' }, 'o mais escolhido') : null,
          h('strong', {}, p.nome), h('span', { class: 'preco' }, dinheiro(p.preco), h('small', {}, '/mês')),
          h('ul', {}, (p.destaques || []).slice(0, 3).map((d) => h('li', {}, d)))))),
        h('div', { class: 'acoes' }, acaoDoPlano('novelo', true), h('a', { class: 'link', href: '/assinaturas.html' }, 'Comparar os planos'),
          h('button', { type: 'button', class: 'link', onclick: fechar }, 'Agora não'))))
    document.body.append(fundo)
    addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fechar(); removeEventListener('keydown', esc) } })
  }

  function convites() {
    if (lugarSemConvite()) return
    if (!eu) { faixaSemConta(); desenhar(); return }
    const meu = plano?.meu
    if (!meu || meu.porAdmin || meu.plano !== 'leitor') return
    const livros = meu.uso?.livros
    // o contador, como nos jornais: aparece quando já se usou algo, uma vez por dia
    if (livros && livros.usados >= 1 && podeMostrar(`contador-${livros.usados}`, 1)) {
      const acabou = livros.usados >= livros.limite
      setTimeout(() => lembrete(h('div', {},
        h('strong', {}, acabou ? `Você abriu os ${livros.limite} livros grátis deste mês` : `Você abriu ${livros.usados} de ${livros.limite} livros grátis este mês`),
        h('p', {}, acabou && livros.renovaEm
          ? `O próximo libera em ${new Date(livros.renovaEm.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')} — mas o plano Novelo está sendo dado de presente enquanto a casa começa.`
          : 'Os que já abriu continuam abertos. E, enquanto a Fiolib está começando, o plano Novelo é de presente para quem pedir.'),
        h('a', { href: '/assinaturas.html' }, 'Pedir o meu presente')), `contador-${livros.usados}`), 2500)
      return
    }
    // a janela: no máximo a cada 14 dias, depois de um tempo navegando, e nunca
    // para quem já pediu para ser avisado
    if (!meu.quer && podeMostrar('janela', 14)) setTimeout(() => { if (!lugarSemConvite() && !document.querySelector('.fio-modal-fundo')) janelaDosPlanos() }, 45_000)
  }

  // ── montar ──
  const raiz = document.getElementById('raiz')
  document.body.prepend(...[barra, faixa, sub].filter(Boolean))
  if (!document.querySelector('.fio-rodape')) document.body.append(rodape)
  desenhar()
  if (noApp) addEventListener('hashchange', () => { menuAberto = false; abertos = null; desenhar() })

  // "/" abre a busca (no app, o próprio app cuida disso)
  addEventListener('keydown', (e) => {
    if (noApp) return
    const t = e.target
    if (t?.closest?.('input,textarea,select,[contenteditable]')) return
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) { e.preventDefault(); buscar() }
  })

  // Quem é, qual plano, quantos avisos: guardado 10 s nesta aba, para não
  // perguntar de novo a cada página que se abre em sequência.
  async function conhecer() {
    let lembrado = null
    try { lembrado = JSON.parse(sessionStorage.getItem('fio:barra') || 'null') } catch {}
    if (lembrado && Date.now() - lembrado.em < 10_000) ({ eu, avisos, plano } = lembrado)
    else {
      const antes = eu
      eu = await fioApi.eu().catch(() => null)
      if (eu) window.fioDono?.conferir(eu.id)
      const [x, p] = await Promise.all([
        eu ? fioApi.pedir('/avisos/contagem').catch(() => null) : null,
        fioApi.pedir('/planos').catch(() => null),
      ])
      avisos = x?.naoLidos || 0; plano = p
      try { sessionStorage.setItem('fio:barra', JSON.stringify({ eu, avisos, plano, em: Date.now() })) } catch {}
      // se a pessoa saiu (ou a sessão venceu), a lembrança tem de sumir junto
      if (!eu && antes) esquecerQuem()
    }
    sabemos = true
    if (eu) guardar(LEMBRANCA, { eu: { id: eu.id, usuario: eu.usuario, nome: eu.nome, papel: eu.papel }, plano, avisos, em: Date.now() })
    desenhar()
    convites()
  }
  conhecer()
  // o número do sino se atualiza sozinho enquanto a aba está à vista
  setInterval(async () => {
    if (!eu || document.hidden) return
    const x = await fioApi.pedir('/avisos/contagem').catch(() => null)
    if (x && x.naoLidos !== avisos) { avisos = x.naoLidos; listaAvisos = null; desenharSino() }
  }, 90_000)

  // para páginas que trocam a sub-seção sem recarregar (central)
  window.fioMarcarSub = (chave) => { document.body.dataset.subAtual = chave; desenhar() }
  void raiz
})()
