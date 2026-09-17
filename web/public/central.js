// A central do leitor: recomendações, avisos e o questionário de gosto.
//
// Página separada do app (cujo fonte se perdeu), como o painel. Não guarda
// segredo: tudo vem de rotas que exigem sessão e respondem só sobre QUEM pede.
// Todo texto entra por nó de texto — título de livro e corpo de aviso nunca
// viram HTML — e link de aviso só é seguido se for caminho da própria casa.

const pedir = (caminho, corpo) => fetch('/api' + caminho, {
  method: corpo ? 'POST' : 'GET',
  headers: corpo ? { 'content-type': 'application/json', 'x-fio': '1' } : {},
  body: corpo ? JSON.stringify(corpo) : undefined,
  credentials: 'include',
}).then(async (r) => {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.erro || `erro ${r.status}`); e.status = r.status; throw e }
  return j
})

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

const main = document.getElementById('main')
const estado = { catalogo: null, obras: new Map(), gosto: null, aba: 'recs' }

// ── capas: as mesmas três origens do site ──
const CORES = ['#2c3d4f', '#4a3328', '#3a4636', '#54303a', '#2f3a52', '#4d4126', '#39304a', '#1f3d3a']
function capa(o) {
  const c = el('div', { class: 'capa' })
  const url = o.capa ? `/capas/${encodeURIComponent(o.capa)}` : o.capaOL ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(o.capaOL)}-M.jpg` : null
  let h = 0; for (const ch of o.titulo + o.autor) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const desenhada = el('div', { class: 'desenhada', style: `background:${CORES[h % CORES.length]};color:#efe6d6` }, o.titulo)
  c.append(desenhada)
  if (url) {
    const img = el('img', { src: url, alt: `Capa de ${o.titulo}`, loading: 'lazy' })
    img.addEventListener('error', () => img.remove())
    c.append(img)
  }
  return c
}

function cartaoLivro(o, motivo) {
  return el('a', { class: 'livro', href: `/#/obra/${o.id}` },
    capa(o), el('div', { class: 'tit' }, o.titulo), el('div', { class: 'aut' }, o.autor),
    motivo ? el('div', { class: 'motivo' }, motivo) : null)
}

// ── início ──
async function iniciar() {
  let eu
  try { eu = (await pedir('/eu')).pessoa } catch { eu = null }
  if (!eu) {
    main.replaceChildren(el('h1', {}, 'Para você'),
      el('p', { class: 'sub' }, 'Recomendações e avisos são pessoais: entre na sua conta para vê-los.'),
      el('a', { class: 'botao', href: '/#/entrar', style: 'text-decoration:none;display:inline-block' }, 'Entrar'))
    return
  }
  // As seções moram na sub-barra do cabeçalho (fio-cabecalho.js), como links de âncora.
  addEventListener('hashchange', () => { const a = location.hash.slice(1); if (ABAS.includes(a)) ir(a) })

  const [cat, g] = await Promise.all([
    fetch('/dados/catalogo.json').then((r) => r.json()),
    pedir('/gosto'),
  ])
  estado.catalogo = cat
  estado.obras = new Map(cat.obras.map((o) => [o.id, o]))
  estado.gosto = g
  atualizarContagem()

  const bemvindo = new URLSearchParams(location.search).has('bemvindo')
  const pedida = location.hash.slice(1)
  ir(bemvindo || g.pedir ? 'gosto' : (ABAS.includes(pedida) ? pedida : 'recs'))
}

const ABAS = ['recs', 'avisos', 'gosto', 'pedidos']
function ir(aba) {
  estado.aba = aba
  window.fioMarcarSub?.(aba)
  if (location.hash.slice(1) !== aba) history.replaceState(null, '', `/central.html#${aba}`)
  if (aba === 'recs') mostrarRecs()
  else if (aba === 'avisos') mostrarAvisos()
  else if (aba === 'pedidos') mostrarPedidos()
  else mostrarGosto()
  window.scrollTo(0, 0)
}

// A contagem mora no cabeçalho, que pergunta sozinho a cada página.
function atualizarContagem() {}

// ── Para você ──
async function mostrarRecs(recado) {
  main.replaceChildren(el('p', { class: 'vazio' }, 'escolhendo…'))
  let r
  try { r = await pedir('/recomendacoes') } catch (e) { main.replaceChildren(el('p', { class: 'vazio' }, e.message)); return }
  const itens = r.obras.map((x) => ({ o: estado.obras.get(x.id), motivo: x.motivo })).filter((x) => x.o)

  if (!itens.length) {
    main.replaceChildren(
      el('h1', {}, 'Para você'),
      el('p', { class: 'sub' }, 'Ainda não sei do que você gosta. Conte em um minuto — ou leia um pouco, que eu aprendo pelo que você lê.'),
      el('button', { class: 'botao', onclick: () => ir('gosto') }, 'Contar do que eu gosto'))
    return
  }
  // replaceChildren escreve "null" como texto; só entra o que existe
  main.replaceChildren(...[
    recado ? el('div', { class: 'recado' }, recado) : null,
    el('h1', {}, 'Para você'),
    el('p', { class: 'sub' }, `Escolhidos ${r.resumo}. Isto muda conforme você lê: o que você lê pesa mais do que o que você disse.`),
    el('div', { class: 'grade' }, itens.map((x) => cartaoLivro(x.o, x.motivo)))].filter(Boolean))
}

// ── Avisos ──
async function mostrarAvisos() {
  main.replaceChildren(el('p', { class: 'vazio' }, 'abrindo…'))
  let r
  try { r = await pedir('/avisos') } catch (e) { main.replaceChildren(el('p', { class: 'vazio' }, e.message)); return }
  const lista = el('div', {})
  for (const a of r.avisos) {
    const link = typeof a.link === 'string' && a.link.startsWith('/') && !a.link.startsWith('//') ? a.link : null
    lista.append(el('div', {
      class: `aviso${a.lido ? '' : ' novo'}`, role: 'button', tabindex: '0',
      onclick: async () => {
        if (!a.lido) { try { await pedir('/avisos/lido', { id: a.id }) } catch { /* segue */ } }
        if (link) location.href = link
        else { atualizarContagem(); mostrarAvisos() }
      },
    }, el('i', { class: 'ponto' }),
    el('div', {}, el('b', {}, a.titulo), a.corpo ? el('span', {}, a.corpo) : null,
      el('time', {}, new Date(a.criado_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })))))
  }
  main.replaceChildren(...[
    el('h1', {}, 'Avisos'),
    el('p', { class: 'sub' }, 'Quando um livro da sua lista fica pronto, quando uma leitura ficou parada, e as recomendações de cada semana.'),
    r.naoLidos ? el('p', {}, el('button', { class: 'fraco', onclick: async () => { await pedir('/avisos/lido', {}); atualizarContagem(); mostrarAvisos() } }, 'Marcar todos como lidos')) : null,
    r.avisos.length ? lista : el('p', { class: 'vazio' }, 'Nada por aqui ainda.')].filter(Boolean))
  atualizarContagem()
}

// ── Meu gosto ──
function mostrarGosto() {
  const { opcoes, respostas: antes, pedir: primeiraVez } = estado.gosto
  const r = {
    humores: new Set(antes.humores ?? []), autores: new Set(antes.autores ?? []),
    favoritos: new Set(antes.favoritos ?? []), tempo: antes.tempo ?? 'tanto', evitar: new Set(antes.evitar ?? []),
  }
  const alterna = (conjunto, valor, botao) => {
    conjunto.has(valor) ? conjunto.delete(valor) : conjunto.add(valor)
    botao.setAttribute('aria-pressed', String(conjunto.has(valor)))
  }
  const chips = (itens, conjunto, rotulo = (x) => x, valor = (x) => x) => el('div', { class: 'chips' }, itens.map((x) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(conjunto.has(valor(x))) }, rotulo(x))
    b.addEventListener('click', () => alterna(conjunto, valor(x), b))
    return b
  }))

  const vitrine = el('div', { class: 'grade' }, opcoes.vitrine.map((id) => estado.obras.get(id)).filter(Boolean).map((o) => {
    const b = el('button', { class: 'escolha', type: 'button', 'aria-pressed': String(r.favoritos.has(o.id)) },
      capa(o), el('div', { class: 'tit' }, o.titulo), el('div', { class: 'aut' }, o.autor))
    b.addEventListener('click', () => alterna(r.favoritos, o.id, b))
    return b
  }))

  const tempos = el('div', { class: 'chips' })
  const pintarTempo = () => { for (const b of tempos.children) b.setAttribute('aria-pressed', String(b.dataset.chave === r.tempo)) }
  for (const t of opcoes.tempos) {
    const b = el('button', { class: 'chip', type: 'button', 'data-chave': t.chave }, t.rotulo)
    b.addEventListener('click', () => { r.tempo = t.chave; pintarTempo() })
    tempos.append(b)
  }
  pintarTempo()

  const enviar = el('button', { class: 'botao', type: 'button' }, primeiraVez ? 'Ver minhas recomendações' : 'Salvar e atualizar recomendações')
  enviar.addEventListener('click', async () => {
    enviar.disabled = true
    try {
      const resp = await pedir('/gosto', {
        humores: [...r.humores], autores: [...r.autores], favoritos: [...r.favoritos], tempo: r.tempo, evitar: [...r.evitar],
      })
      estado.gosto = { ...estado.gosto, respostas: resp.respostas, pedir: false }
      history.replaceState(null, '', '/central.html')
      atualizarContagem()
      ir('recs')
    } catch (e) { enviar.disabled = false; alert(e.message) }
  })

  main.replaceChildren(
    el('h1', {}, primeiraVez ? 'Bem-vindo ao Fio. Do que você gosta?' : 'Meu gosto'),
    el('p', { class: 'sub' }, 'Responda o que quiser — tudo é opcional. Com isso as recomendações já nascem certas, e depois elas aprendem com o que você lê.'),
    el('section', { class: 'passo' }, el('h2', {}, 'O que você quer sentir quando lê?'), el('p', {}, 'Escolha quantos quiser.'),
      chips(opcoes.humores, r.humores, (h) => h.rotulo, (h) => h.chave)),
    el('section', { class: 'passo' }, el('h2', {}, 'Quais destes você já leu e gostou — ou quer muito ler?'), el('p', {}, 'Toque nas capas.'), vitrine),
    el('section', { class: 'passo' }, el('h2', {}, 'Autores que você curte'), chips(opcoes.autores, r.autores)),
    el('section', { class: 'passo' }, el('h2', {}, 'Quanto tempo você costuma ter?'), tempos),
    el('section', { class: 'passo' }, el('h2', {}, 'Prefere deixar de fora'), el('p', {}, 'Opcional.'), chips(opcoes.evitar, r.evitar)),
    enviar)
}

// ── Pedidos de tradução ──
//
// Assinante escolhe um clássico do Project Gutenberg; o servidor confere que é
// domínio público e põe na fila da esteira. O limite do mês vem do plano.
async function mostrarPedidos() {
  main.replaceChildren(el('p', { class: 'vazio' }, 'abrindo…'))
  let r
  try { r = await pedir('/pedidos-traducao') } catch (e) { main.replaceChildren(el('p', { class: 'vazio' }, e.message)); return }
  const ESTADOS = { espera: 'na fila', na_esteira: 'traduzindo', pronto: 'pronto', erro: 'não deu certo' }
  const saida = el('div', {})
  const resultados = el('div', {})
  const campo = el('input', { type: 'search', placeholder: 'Título, autor ou link do Gutenberg (ex.: Moby Dick)', style: 'flex:1;min-width:220px;padding:10px 14px;border:1px solid var(--linha);border-radius:999px;background:var(--papel);color:var(--tinta);font:inherit' })
  const procurar = async () => {
    resultados.replaceChildren(el('p', { class: 'vazio' }, 'procurando no Gutenberg…'))
    try {
      const b = await pedir(`/pedidos-traducao/buscar?q=${encodeURIComponent(campo.value)}`)
      resultados.replaceChildren(...(b.livros.length ? b.livros.map((l) => el('div', { class: 'aviso', style: 'cursor:default;align-items:center' },
        el('div', { style: 'flex:1' }, el('b', {}, l.titulo), el('span', {}, [l.autor, l.morte ? `morreu em ${l.morte}` : null, l.idiomaNome].filter(Boolean).join(' · ')),
          !l.pode ? el('time', {}, `não dá: ${l.problema}`) : null),
        l.pode && r.limite > r.usados ? el('button', { class: 'fraco', onclick: async (ev) => {
          ev.target.disabled = true
          try { const x = await pedir('/pedidos-traducao', { gutenberg: l.gutenberg }); mostrarPedidos().then(() => main.prepend(el('div', { class: 'recado' }, `Pedido feito: ${x.titulo}. Você recebe um aviso quando ficar pronto.`))) }
          catch (x) { ev.target.disabled = false; saida.replaceChildren(el('div', { class: 'recado' }, x.message)) }
        } }, 'Pedir') : null)) : [el('p', { class: 'vazio' }, 'Nada encontrado.')]))
    } catch (e) { resultados.replaceChildren(el('div', { class: 'recado' }, e.message)) }
  }
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') procurar() })

  main.replaceChildren(...[
    el('h1', {}, 'Pedidos de tradução'),
    el('p', { class: 'sub' }, 'Escolha um clássico em domínio público (autor morto até 1955) que ainda não existe em português. A esteira do Fio traduz, e ele entra no acervo para todo mundo.'),
    r.limite
      ? el('p', {}, el('b', {}, `${r.usados} de ${r.limite}`), ` pedidos usados nos últimos 30 dias (plano ${r.plano}).`)
      : el('div', { class: 'recado' }, 'Pedir tradução faz parte dos planos Novelo, Trama e Tear. ', el('a', { href: '/assinaturas.html' }, 'Ver os planos')),
    r.limite ? el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:18px 0' }, campo, el('button', { class: 'botao', onclick: procurar }, 'Procurar')) : null,
    saida, resultados,
    r.pedidos.length ? el('h2', { style: 'margin-top:34px;font-family:Literata,Georgia,serif;font-weight:500' }, 'Seus pedidos') : null,
    r.pedidos.length ? el('div', {}, r.pedidos.map((p) => el('div', { class: 'aviso', style: 'cursor:default' },
      el('div', {}, el('b', {}, p.titulo ?? 'pedido'), el('span', {}, [p.autor, ESTADOS[p.estado] ?? p.estado].filter(Boolean).join(' · ')),
        p.estado === 'pronto' && p.obra_id ? el('a', { href: `/#/obra/${p.obra_id}` }, ' ler agora →') : null)))) : null,
  ].filter(Boolean))
}

iniciar().catch((e) => main.replaceChildren(el('p', { class: 'vazio' }, `Não consegui abrir a central: ${e.message}`)))
