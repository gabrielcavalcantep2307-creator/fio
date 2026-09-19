// A barra superior do Fio nas páginas que não são do app (quadrinhos,
// comunidade, publicar, planos, para você, painel). É a MESMA do app — mesmos
// itens, mesma ordem, mesmo tema — para quem navega não sentir que mudou de site.
//
//   <body data-area="quadrinhos" data-sub="comunidade" data-sub-atual="explorar">
//
// `data-area` acende o item da barra; `data-sub` desenha a sub-barra da área.
// Tudo por nó de texto; nenhum HTML vindo de fora.

(function () {
  const h = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v)
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f.nodeType ? f : document.createTextNode(String(f)))
    return e
  }

  // ── tema: o mesmo guardado do app ──
  const CHAVE = 'fio.estante.v1'
  const lerGuardado = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') } catch { return {} } }
  const temaAtual = () => lerGuardado()?.prefs?.tema || 'claro'
  const ESCUROS = new Set(['noturno', 'carvao', 'penumbra', 'musgo', 'tinta', 'ambar'])
  function trocarTema() {
    const g = lerGuardado()
    g.prefs = { ...(g.prefs || {}), tema: temaAtual() === 'noturno' ? 'claro' : 'noturno' }
    g.prefsMudouEm = Date.now()
    try { localStorage.setItem(CHAVE, JSON.stringify(g)) } catch {}
    document.documentElement.dataset.tema = g.prefs.tema
    desenhar()
  }
  document.documentElement.dataset.tema = temaAtual()

  // A busca mora no app: marca o pedido e vai para lá; o app abre a busca.
  const buscar = () => { try { sessionStorage.setItem('fio:abrir-busca', '1') } catch {} location.href = '/#/' }

  const area = document.body.dataset.area || ''
  let eu = null, avisos = 0, menuAberto = false

  const SUBS = {
    comunidade: [['explorar', '/publicacoes.html', 'Explorar'], ['publicar', '/publicar.html', 'Publicar'], ['planos', '/assinaturas.html', 'Planos']],
    central: [['recs', '/central.html#recs', 'Para você'], ['cegas', '/central.html#cegas', 'Encontro às cegas'], ['avisos', '/central.html#avisos', 'Avisos'], ['gosto', '/central.html#gosto', 'Meu gosto'], ['pedidos', '/central.html#pedidos', 'Pedidos de tradução'], ['planos', '/assinaturas.html', 'Meu plano']],
  }

  const barra = h('header', { class: 'fio-barra' })
  const sub = document.body.dataset.sub && SUBS[document.body.dataset.sub] ? h('div', { class: 'fio-sub' }) : null

  function itens(largo) {
    const cls = largo ? 'm' : ''
    const atual = (a) => (a === area ? 'page' : null)
    const nome = eu ? ((eu.nome || eu.usuario || '').split(' ').find((p) => p && !/\.$/.test(p)) || eu.usuario || 'conta').toLowerCase() : 'entrar'
    return [
      h('button', { class: cls, type: 'button', title: 'Buscar ( / )', onclick: buscar }, 'buscar', largo ? h('kbd', {}, '/') : null),
      h('a', { class: cls, href: '/#/estante' }, 'estante'),
      h('a', { class: cls, href: '/#/caderno' }, 'caderno'),
      h('button', { class: cls, type: 'button', title: 'claro / noturno', onclick: trocarTema }, ESCUROS.has(temaAtual()) ? 'claro' : 'noturno'),
      h('a', { class: cls, href: '/quadrinhos.html', 'aria-current': atual('quadrinhos') }, largo ? 'quadrinhos' : 'quadrinhos e mangá'),
      h('a', { class: cls, href: '/publicacoes.html', 'aria-current': atual('comunidade') }, 'comunidade'),
      eu ? h('a', { class: cls, href: '/central.html', 'aria-current': atual('central') }, 'para você', avisos > 0 ? h('span', { class: 'num' }, String(avisos)) : null) : null,
      eu?.papel === 'admin' ? h('a', { class: `${cls} adm`, href: '/admin.html', 'aria-current': atual('painel') }, largo ? 'painel' : 'painel de administração') : null,
      h('a', { class: cls, href: eu ? '/conta.html' : '/#/entrar', 'aria-current': atual('conta') }, nome),
    ]
  }

  function desenhar() {
    const icone = menuAberto
      ? h('span', { 'aria-hidden': 'true', style: 'font-size:22px;line-height:1' }, '×')
      : h('span', { 'aria-hidden': 'true', style: 'font-size:20px;line-height:1' }, '☰')
    barra.replaceChildren(
      h('div', { class: 'dentro' },
        h('a', { class: 'logo', href: '/#/', 'aria-label': 'Fio — início' }, h('img', { src: '/fio.svg', alt: '' }), h('span', {}, 'Fio')),
        h('nav', { class: 'largo', 'aria-label': 'Principal' }, itens(true)),
        h('div', { class: 'curto' },
          h('button', { type: 'button', 'aria-label': 'Buscar', onclick: buscar }, h('span', { 'aria-hidden': 'true' }, '⌕')),
          h('button', { type: 'button', 'aria-label': menuAberto ? 'Fechar o menu' : 'Abrir o menu', 'aria-expanded': String(menuAberto),
            onclick: () => { menuAberto = !menuAberto; desenhar() } }, icone))),
      ...(menuAberto ? [h('nav', { class: 'menu', 'aria-label': 'Menu' }, itens(false))] : []))
    if (sub) {
      const atual = document.body.dataset.subAtual || ''
      sub.replaceChildren(h('div', { class: 'dentro' }, SUBS[document.body.dataset.sub].map(([chave, href, rot]) =>
        h('a', { href, 'aria-current': chave === atual ? 'page' : null, 'data-chave': chave }, rot))))
    }
  }

  document.body.prepend(...[barra, sub].filter(Boolean))
  desenhar()

  // "/" abre a busca, como no app
  addEventListener('keydown', (e) => {
    const t = e.target
    if (t?.closest?.('input,textarea,select,[contenteditable]')) return
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) { e.preventDefault(); buscar() }
  })

  // Quem é e quantos avisos: guardado 10 s nesta aba, para não perguntar de
  // novo a cada página que se abre em sequência.
  let lembrado = null
  try { lembrado = JSON.parse(sessionStorage.getItem('fio:barra') || 'null') } catch {}
  if (lembrado && Date.now() - lembrado.em < 10_000) {
    eu = lembrado.eu; avisos = lembrado.avisos; desenhar()
  } else {
    fioApi.eu().then((p) => (p ? { pessoa: p } : null)).then(async (r) => {
      eu = r?.pessoa ?? null
      if (eu) window.fioDono?.conferir(eu.id)
      desenhar()
      if (eu) {
        const x = await fioApi.pedir('/avisos/contagem').catch(() => null)
        avisos = x?.naoLidos || 0; desenhar()
      }
      try { sessionStorage.setItem('fio:barra', JSON.stringify({ eu, avisos, em: Date.now() })) } catch {}
    }).catch(() => {})
  }

  // para páginas que trocam a sub-seção sem recarregar (central)
  window.fioMarcarSub = (chave) => { document.body.dataset.subAtual = chave; desenhar() }
})()
