// A vitrine para o Google (19/09/2026): uma página de verdade por livro e por
// autor, que se lê sem JavaScript.
//
// O app mora em endereços com "#" (/#/obra/612). O Google trata tudo depois
// do "#" como a MESMA página — para ele o site inteiro era uma página só,
// chamada "Fio — biblioteca", sem robots.txt nem sitemap. Quem procurava
// "O Cortiço ler online" nunca ia cair aqui.
//
//   /livro/612-o-cortico      título, autor, por que ler, o começo do livro,
//                             e o botão que abre no app (/#/ler/612)
//   /autor/369-aluisio-azevedo  quem foi, e os livros dele que se leem aqui
//   /livros, /autores         as listas, para o robô achar tudo andando
//   /sitemap.xml, /robots.txt o mapa, e o que não é para indexar
//
// Só entra livro que se LÊ aqui (domínio público ou licença livre na
// jurisdição da casa, não oculto pela curadoria). Página de livro sem texto é
// promessa quebrada para quem chega do Google — essas respondem noindex.
//
// Os dados vêm dos mesmos arquivos que o app usa (dados/catalogo.json e
// dados/fichas/), relidos quando a esteira os republica.

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ondeComecaOLivro } from '../folha-de-rosto.mjs'
import { diagramar } from '../diagramar.mjs'
import { notas, LIMIAR_GOOGLE } from '../qualidade.mjs'

const CASA = process.env.FIO_JURISDICAO || 'BR'
const POR_PAGINA = 240
const BARRA = String.fromCharCode(92)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const jsonLd = (o) => JSON.stringify(o).replace(/</g, `${BARRA}u003c`)
export const lesma = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'livro'
const primeiraLinha = (s) => String(s ?? '').split(/[\r\n]/)[0].replace(/\s+/g, ' ').trim()
const semTags = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const corta = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1) > n * 0.6 ? s.lastIndexOf(' ', n - 1) : n - 1) + '…')

export function criarVitrine({ banco, estatico, site }) {
  const SITE = String(site).replace(/\/$/, '')

  // ── o catálogo, relido quando muda ──
  let cat = { chave: '', obras: [], porId: new Map(), autores: new Map(), gerado: '' }
  function catalogo() {
    const arq = join(estatico, 'dados', 'catalogo.json')
    let chave = ''
    try { chave = String(statSync(arq).mtimeMs) } catch { return cat }
    if (chave === cat.chave) return cat
    try {
      const c = JSON.parse(readFileSync(arq, 'utf8'))
      const obras = c.obras ?? []
      cat = {
        chave, obras, gerado: String(c.geradoEm ?? '').slice(0, 10),
        porId: new Map(obras.map((o) => [o.id, o])),
        autores: new Map((c.autores ?? []).map((a) => [a.id, a])),
      }
    } catch (e) { console.error('[vitrine] catálogo ilegível', e.message) }
    return cat
  }

  // ── o que se lê aqui (o mesmo critério da busca e do /api/livro) ──
  const legiveisSql = banco.prepare(`
    SELECT o.id, t.id texto_id, t.fonte FROM obra o
      JOIN texto t ON t.id = (SELECT id FROM texto WHERE obra_id = o.id AND dono_id IS NULL
                               ORDER BY (idioma = 'pt') DESC, normalizado DESC, id LIMIT 1)
      JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ? AND d.estado IN ('dominio_publico','licenca_livre')
     WHERE o.publicada = 1 AND t.normalizado = 1
       AND o.id NOT IN (SELECT obra_id FROM curadoria_obra WHERE oculta = 1)`)
  let leg = { em: 0, mapa: new Map() }
  function legiveis() {
    if (Date.now() - leg.em > 10 * 60_000) {
      // fora do Google também o livro cujo OCR saiu ilegível (qualidade.mjs):
      // quem chega de uma busca e cai num texto embaralhado não volta
      try {
        const n = notas(banco)
        leg = { em: Date.now(), mapa: new Map(legiveisSql.all(CASA).map((l) => [l.id, { ...l, ruim: n.get(l.id) < LIMIAR_GOOGLE }])) }
      } catch (e) { console.error('[vitrine]', e.message) }
    }
    return leg.mapa
  }
  /** Legível E com texto bom o bastante para quem chega do Google. */
  const vitrinavel = (id) => { const l = legiveis().get(id); return !!l && !l.ruim }

  const fichas = new Map()
  function ficha(id) {
    if (fichas.has(id)) return fichas.get(id)
    let f = null
    try { f = JSON.parse(readFileSync(join(estatico, 'dados', 'fichas', `${id}.json`), 'utf8')) } catch {}
    fichas.set(id, f)
    if (fichas.size > 400) fichas.delete(fichas.keys().next().value)
    return f
  }
  // ao republicar o catálogo, as fichas também mudam
  let chaveDasFichas = ''
  const conferirFichas = () => { if (cat.chave !== chaveDasFichas) { fichas.clear(); chaveDasFichas = cat.chave } }

  const capitulosDo = banco.prepare('SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')
  /** Os primeiros parágrafos de verdade do livro (depois da folha de rosto). */
  // guardado: o robô do Google percorre milhares de páginas, e cada começo
  // leria o livro inteiro do banco
  const comecos = new Map()
  function comeco(l) {
    const g = comecos.get(l.texto_id)
    if (g) return g
    const r = lerComeco(l)
    comecos.set(l.texto_id, r)
    if (comecos.size > 1500) comecos.delete(comecos.keys().next().value)
    return r
  }
  function lerComeco(l) {
    try {
      const caps = capitulosDo.all(l.texto_id)
      const i = Math.max(0, caps.findIndex((c) => c.ordem === ondeComecaOLivro(caps)))
      const [cap] = diagramar([caps[i]], { fonte: l.fonte, titulo: false })
      const pars = [...cap.corpo.matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)]
        .filter((m) => !m[1] || m[1] === 'estrofe').map((m) => semTags(m[2].replace(/<br>/g, ' / '))).filter(Boolean)
      // folha de rosto que sobrou no capítulo (nome, cidade, editora): linhas
      // curtas no começo ficam de fora, se depois vier texto de verdade
      const k = pars.findIndex((p) => p.length >= 80)
      if (k > 0 && k < 12) pars.splice(0, k)
      const saida = []
      let total = 0
      for (const p of pars) { if (total > 900) break; saida.push(corta(p, 700)); total += p.length }
      return { titulo: primeiraLinha(caps[i]?.titulo), pars: saida }
    } catch { return { titulo: '', pars: [] } }
  }

  const capaDe = (o) => o.capa ? `${SITE}/capas/${encodeURIComponent(o.capa)}`
    : o.capaOL ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(o.capaOL)}-L.jpg` : null
  const urlLivro = (o) => `/livro/${o.id}-${lesma(primeiraLinha(o.titulo))}`
  const urlAutor = (a) => `/autor/${a.id}-${lesma(a.nome)}`

  // ── a moldura de toda página ──
  function pagina({ titulo, descricao, canonico, imagem, ld, corpo, indexar = true }) {
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(SITE + canonico)}">
${indexar ? '' : '<meta name="robots" content="noindex, follow">\n'}<meta property="og:site_name" content="Fiolib">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(SITE + canonico)}">
${imagem ? `<meta property="og:image" content="${esc(imagem)}">\n<meta name="twitter:card" content="summary_large_image">\n` : ''}<meta name="theme-color" content="#7a2e2e">
<link rel="icon" type="image/svg+xml" href="/fio.svg">
<link rel="stylesheet" href="/fio-paginas.css">
<link rel="stylesheet" href="/fio-temas.css">
<link rel="stylesheet" href="/fio-cabecalho.css">
<script src="/fio-dono.js"></script>
<script src="/fio-api.js"></script>
<script src="/fio-tema.js"></script>
<style>
.topo-v{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1120px;margin:0 auto;padding:14px 16px;border-bottom:1px solid var(--linha)}
.topo-v a{text-decoration:none}.marca{font-family:Literata,Georgia,serif;font-size:20px}
.migalhas{font-size:12.5px;color:var(--tinta2);margin:0 0 18px}.migalhas a{color:var(--tinta2)}
.livro-v{display:grid;grid-template-columns:minmax(0,220px) 1fr;gap:28px;align-items:start}
.livro-v img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px;box-shadow:0 12px 26px -14px rgba(0,0,0,.65);background:var(--papel2)}
.autor-l{font-size:17px;color:var(--tinta2);margin:0 0 14px}
.chamada{font-family:Literata,Georgia,serif;font-size:19px;line-height:1.5;margin:0 0 18px}
.acoes{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 26px}
.trecho{font-family:Literata,Georgia,serif;font-size:17px;line-height:1.75;text-align:justify;hyphens:auto;max-width:34rem}
.trecho p{margin:0;text-indent:1.4em}.trecho p:first-of-type{text-indent:0}
.lista-v{columns:2 18rem;column-gap:28px;padding:0;list-style:none}.lista-v li{break-inside:avoid;margin:0 0 8px}
.lista-v small{color:var(--tinta2)}
.paginas-v{display:flex;flex-wrap:wrap;gap:6px;margin:24px 0}
@media (max-width:640px){.livro-v{grid-template-columns:1fr}.livro-v img{max-width:180px}}
</style>
${ld ? `<script type="application/ld+json">${jsonLd(ld)}</script>\n` : ''}</head>
<body>
<main>
${corpo}
</main>
<script src="/fio-cabecalho.js"></script>
</body>
</html>`
  }

  function responder(req, res, status, html, extra = {}) {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      // curto: o catálogo muda quando a esteira termina um livro
      'cache-control': 'public, max-age=600',
      ...extra,
    })
    res.end(req.method === 'HEAD' ? undefined : html)
    return true
  }
  const redirecionar = (res, para) => { res.writeHead(301, { location: para, 'cache-control': 'public, max-age=86400' }); res.end(); return true }
  const naoAchei = (req, res) => responder(req, res, 404, pagina({
    titulo: 'Não achei esta página — Fiolib', descricao: 'Esta página não existe na Fiolib.', canonico: '/livros', indexar: false,
    corpo: '<h1>Não achei esta página</h1><p class="sub">Talvez o livro tenha mudado de endereço. <a href="/livros">Veja todos os livros</a>.</p>',
  }))

  // ── /livro/:id ──
  function livro(req, res, id, lesmaPedida) {
    const c = catalogo(); conferirFichas()
    const o = c.porId.get(id)
    if (!o) return naoAchei(req, res)
    const certo = urlLivro(o)
    if (`/livro/${id}-${lesmaPedida}` !== certo) return redirecionar(res, certo)
    const f = ficha(id) ?? o
    const l = legiveis().get(id)
    const titulo = primeiraLinha(o.titulo)
    const autor = c.autores.get(o.autorId)
    const inicio = l ? comeco(l) : { titulo: '', pars: [] }
    const descricao = corta(semTags(o.chamada || f.porque || inicio.pars.join(' ') || `${titulo}, de ${o.autor}.`), 158)
    const capa = capaDe(o)
    const nomeAutor = o.autor ?? 'autoria não identificada'
    const vida = f.autorNasc || f.autorMorte ? ` (${f.autorNasc ?? '?'}–${f.autorMorte ?? '?'})` : ''
    const doMesmo = autor ? c.obras.filter((x) => x.autorId === o.autorId && x.id !== id && vitrinavel(x.id)).slice(0, 12) : []
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Book', '@id': `${SITE}${certo}#livro`, name: titulo, url: SITE + certo, inLanguage: 'pt-BR',
          author: { '@type': 'Person', name: nomeAutor, ...(autor ? { url: SITE + urlAutor(autor) } : {}) },
          ...(capa ? { image: capa } : {}), description: descricao,
          ...(f.paginas ? { numberOfPages: f.paginas } : {}),
          ...(o.temas?.length ? { genre: o.temas } : {}),
          isAccessibleForFree: !!l,
          ...(l ? { potentialAction: { '@type': 'ReadAction', target: `${SITE}/#/ler/${id}` } } : {}),
        },
        {
          '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Livros', item: `${SITE}/livros` },
            ...(autor ? [{ '@type': 'ListItem', position: 2, name: autor.nome, item: SITE + urlAutor(autor) }] : []),
            { '@type': 'ListItem', position: autor ? 3 : 2, name: titulo, item: SITE + certo },
          ],
        },
      ],
    }
    const corpo = `<p class="migalhas"><a href="/livros">Livros</a>${autor ? ` › <a href="${esc(urlAutor(autor))}">${esc(autor.nome)}</a>` : ''} › ${esc(titulo)}</p>
<article class="livro-v">
  <div>${capa ? `<img src="${esc(capa)}" alt="Capa de ${esc(titulo)}" width="220" height="330">` : ''}</div>
  <div>
    <h1>${esc(titulo)}</h1>
    <p class="autor-l">${autor ? `<a href="${esc(urlAutor(autor))}">${esc(nomeAutor)}</a>` : esc(nomeAutor)}${esc(vida)}</p>
    ${o.chamada ? `<p class="chamada">${esc(o.chamada)}</p>` : ''}
    <div class="selos">${(o.temas ?? []).map((t) => `<span class="selo">${esc(t)}</span>`).join('')}${o.minutos ? `<span class="selo">${Math.max(1, Math.round(o.minutos / 60))} h de leitura</span>` : ''}${f.paginas ? `<span class="selo">${f.paginas} páginas</span>` : ''}</div>
    <div class="acoes">${l
      ? `<a class="botao" href="/#/ler/${id}">Ler agora, grátis</a><a class="botao fraco" href="/#/obra/${id}">Ver no app</a>`
      : `<a class="botao fraco" href="/#/obra/${id}">Ver no app</a>`}<button type="button" class="botao fraco" data-compartilhar data-titulo="${esc(titulo)}, de ${esc(nomeAutor)}" data-texto="Achei este livro para ler de graça na Fiolib.">Compartilhar</button></div>
    ${l ? '' : '<p class="recado ruim">Este livro está no catálogo, mas o texto ainda não pode ser lido aqui.</p>'}
    ${f.porque ? `<h2>Por que ler</h2><p>${esc(f.porque)}</p>` : ''}
    ${f.observar ? `<h2>Para observar</h2><p>${esc(f.observar)}</p>` : ''}
    ${inicio.pars.length ? `<h2>O começo${inicio.titulo ? ` — ${esc(inicio.titulo)}` : ''}</h2><div class="trecho">${inicio.pars.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    <div class="acoes"><a class="botao" href="/#/ler/${id}">Continuar lendo</a></div>` : ''}
    ${f.direito ? `<p class="rodape">${esc(f.direito)}</p>` : ''}
  </div>
</article>
${doMesmo.length ? `<h2>Mais de ${esc(autor.nome)}</h2><ul class="lista-v">${doMesmo.map((x) => `<li><a href="${esc(urlLivro(x))}">${esc(primeiraLinha(x.titulo))}</a></li>`).join('')}</ul>` : ''}`
    return responder(req, res, 200, pagina({
      titulo: `${titulo} — ${nomeAutor} | Ler online grátis na Fiolib`,
      descricao, canonico: certo, imagem: capa, ld, corpo, indexar: vitrinavel(id),
    }))
  }

  // ── /autor/:id ──
  function autor(req, res, id, lesmaPedida) {
    const c = catalogo()
    const a = c.autores.get(id)
    if (!a) return naoAchei(req, res)
    const certo = urlAutor(a)
    if (`/autor/${id}-${lesmaPedida}` !== certo) return redirecionar(res, certo)
    const obras = c.obras.filter((o) => o.autorId === id && vitrinavel(o.id))
      .sort((x, y) => primeiraLinha(x.titulo).localeCompare(primeiraLinha(y.titulo), 'pt'))
    const vida = a.nascimento || a.morte ? ` (${a.nascimento ?? '?'}–${a.morte ?? '?'})` : ''
    const descricao = `${obras.length} ${obras.length === 1 ? 'livro' : 'livros'} de ${a.nome}${vida} para ler online, grátis, na Fiolib.`
    const ld = {
      '@context': 'https://schema.org', '@type': 'Person', name: a.nome, url: SITE + certo,
      ...(a.nascimento ? { birthDate: String(a.nascimento) } : {}), ...(a.morte ? { deathDate: String(a.morte) } : {}),
    }
    const corpo = `<p class="migalhas"><a href="/autores">Autores</a> › ${esc(a.nome)}</p>
<h1>${esc(a.nome)}</h1><p class="sub">${esc(vida.trim())} ${obras.length} ${obras.length === 1 ? 'livro' : 'livros'} para ler aqui, de graça.</p>
<ul class="lista-v">${obras.map((o) => `<li><a href="${esc(urlLivro(o))}">${esc(primeiraLinha(o.titulo))}</a>${o.chamada ? `<br><small>${esc(corta(o.chamada, 110))}</small>` : ''}</li>`).join('')}</ul>`
    return responder(req, res, 200, pagina({
      titulo: `${a.nome} — livros para ler online grátis | Fiolib`, descricao, canonico: certo, ld, corpo, indexar: obras.length > 0,
    }))
  }

  // ── /livros e /autores (paginados) ──
  function lista(req, res, tipo, busca) {
    const c = catalogo()
    const itens = tipo === 'livros'
      ? c.obras.filter((o) => vitrinavel(o.id)).map((o) => ({ nome: primeiraLinha(o.titulo), url: urlLivro(o), extra: o.autor }))
      : [...c.autores.values()].filter((a) => c.obras.some((o) => o.autorId === a.id && vitrinavel(o.id))).map((a) => ({ nome: a.nome, url: urlAutor(a), extra: '' }))
    itens.sort((x, y) => x.nome.localeCompare(y.nome, 'pt'))
    const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA))
    const p = Math.min(paginas, Math.max(1, Number(busca.get('p')) || 1))
    const canonico = `/${tipo}${p > 1 ? `?p=${p}` : ''}`
    const nome = tipo === 'livros' ? 'Livros' : 'Autores'
    const titulo = tipo === 'livros'
      ? `Livros para ler online grátis em português${p > 1 ? ` — página ${p}` : ''} | Fiolib`
      : `Autores de livros em domínio público${p > 1 ? ` — página ${p}` : ''} | Fiolib`
    const corpo = `<h1>${nome}</h1><p class="sub">${tipo === 'livros' ? `${itens.length} livros em português para ler de graça, no celular ou no computador.` : `${itens.length} autores com livros para ler de graça.`}</p>
<ul class="lista-v">${itens.slice((p - 1) * POR_PAGINA, p * POR_PAGINA).map((i) => `<li><a href="${esc(i.url)}">${esc(i.nome)}</a>${i.extra ? ` <small>${esc(i.extra)}</small>` : ''}</li>`).join('')}</ul>
${paginas > 1 ? `<nav class="paginas-v">${Array.from({ length: paginas }, (_, k) => k + 1).map((k) => k === p ? `<span class="filtro" aria-current="page">${k}</span>` : `<a class="filtro" href="/${tipo}${k > 1 ? `?p=${k}` : ''}">${k}</a>`).join('')}</nav>` : ''}`
    return responder(req, res, 200, pagina({ titulo, descricao: corta(`${nome} da Fiolib, biblioteca online gratuita em português.`, 158), canonico, corpo }))
  }

  function robots(req, res) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' })
    res.end([
      'User-agent: *', 'Allow: /',
      'Disallow: /api/', 'Disallow: /conta.html', 'Disallow: /entrar-google.html', 'Disallow: /central.html',
      'Disallow: /meus-livros.html', 'Disallow: /publicar.html',
      '', `Sitemap: ${SITE}/sitemap.xml`, '',
    ].join('\n'))
    return true
  }

  function sitemap(req, res) {
    const c = catalogo()
    const quando = c.gerado || new Date().toISOString().slice(0, 10)
    const urls = ['/', '/livros', '/autores', '/quadrinhos.html', '/assinaturas.html']
    for (const o of c.obras) if (vitrinavel(o.id)) urls.push(urlLivro(o))
    for (const a of c.autores.values()) if (c.obras.some((o) => o.autorId === a.id && vitrinavel(o.id))) urls.push(urlAutor(a))
    const paginas = Math.ceil(c.obras.filter((o) => vitrinavel(o.id)).length / POR_PAGINA)
    for (let k = 2; k <= paginas; k++) urls.push(`/livros?p=${k}`)
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' })
    res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(SITE + u)}</loc><lastmod>${quando}</lastmod></url>`).join('\n')}\n</urlset>\n`)
    return true
  }

  return (req, res, caminho) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    if (caminho === '/robots.txt') return robots(req, res)
    if (caminho === '/sitemap.xml') return sitemap(req, res)
    const busca = new URL(req.url, 'http://x').searchParams
    if (caminho === '/livros' || caminho === '/autores') return lista(req, res, caminho.slice(1), busca)
    const m = caminho.match(/^\/(livro|autor)\/(\d{1,7})(?:-([a-z0-9-]*))?\/?$/)
    if (!m) return false
    return m[1] === 'livro' ? livro(req, res, Number(m[2]), m[3] ?? '') : autor(req, res, Number(m[2]), m[3] ?? '')
  }
}
