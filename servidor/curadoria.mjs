// A curadoria do acervo: o dono corrige e arruma o que o site mostra, sem
// reconstruir catálogo nenhum.
//
// O catálogo que o app lê (`/dados/catalogo.json`, `/dados/fichas/N.json`) e o
// dos quadrinhos (`/dados/quadrinhos.json` e o resumo) são arquivos gerados
// pela ingestão. Editar esses arquivos à mão seria perder a edição na próxima
// publicação. Então a edição mora no BANCO, e o servidor a aplica POR CIMA do
// arquivo na hora de entregá-lo — com cache pela data do arquivo e por uma
// versão que sobe a cada edição.
//
// O que se edita:
//   livro     título, autor exibido, temas, capa, chamada, subtítulo,
//             "por que ler", "o que observar", ocultar.
//   quadrinho título, resumo, etiquetas, capa (uma página da série ou imagem
//             enviada), destaque (vai para o começo), ocultar.
//
// Ocultar tira do catálogo, da ficha e da leitura (`/api/livro` responde 404).
// Capa enviada passa por `imagem.mjs` e fica em /dados/curadoria, servida como
// `/capas/cur-<hex>.<ext>` — o mesmo caminho que o app já usa para capas.

import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync, unlinkSync, createReadStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { RAIZ } from './banco/base.mjs'
import { Recusa } from './contas.mjs'
import { limparImagem, ImagemRecusada } from './imagem.mjs'

export const PASTA = process.env.FIO_CURADORIA
  || join(dirname(process.env.FIO_BANCO || join(RAIZ, 'dados', 'catalogo.db')), 'curadoria')

let versao = 1
const cache = new Map()

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS curadoria_obra (
      obra_id   INTEGER PRIMARY KEY,
      campos    TEXT NOT NULL DEFAULT '{}',
      oculta    INTEGER NOT NULL DEFAULT 0,
      nota      TEXT,
      mudou_em  TEXT NOT NULL DEFAULT (datetime('now')),
      mudou_por INTEGER
    );
    CREATE TABLE IF NOT EXISTS curadoria_serie (
      serie_id  TEXT PRIMARY KEY,
      campos    TEXT NOT NULL DEFAULT '{}',
      oculta    INTEGER NOT NULL DEFAULT 0,
      destaque  INTEGER NOT NULL DEFAULT 0,
      nota      TEXT,
      mudou_em  TEXT NOT NULL DEFAULT (datetime('now')),
      mudou_por INTEGER
    );`)
  mkdirSync(PASTA, { recursive: true })
}

const limpar = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n)
const linha = (v, n) => limpar(v, n).replace(/\s+/g, ' ')

// ── lendo as edições ──

function edicoesObras(banco) {
  const m = new Map()
  for (const l of banco.prepare('SELECT obra_id, campos, oculta FROM curadoria_obra').all()) {
    m.set(l.obra_id, { ...JSON.parse(l.campos), oculta: !!l.oculta })
  }
  return m
}

function edicoesSeries(banco) {
  const m = new Map()
  for (const l of banco.prepare('SELECT serie_id, campos, oculta, destaque FROM curadoria_serie').all()) {
    m.set(l.serie_id, { ...JSON.parse(l.campos), oculta: !!l.oculta, destaque: !!l.destaque })
  }
  return m
}

export const obraOculta = (banco, id) => !!banco.prepare('SELECT 1 FROM curadoria_obra WHERE obra_id = ? AND oculta = 1').get(Number(id))

const CAMPOS_CATALOGO = ['titulo', 'autor', 'temas', 'capa']
const CAMPOS_FICHA = ['titulo', 'autor', 'temas', 'capa', 'chamada', 'subtitulo', 'porque', 'observar']

/**
 * Entrega um dos arquivos de catálogo com as edições por cima.
 * Devolve `true` se respondeu, `false` se o caminho não é dele.
 */
export function servirCatalogo(banco, estatico, req, res, caminho) {
  const ficha = caminho.match(/^\/dados\/fichas\/(\d{1,7})\.json$/)
  const alvo = caminho === '/dados/catalogo.json' ? 'catalogo'
    : caminho === '/dados/quadrinhos.json' ? 'quadrinhos'
      : caminho === '/dados/quadrinhos-resumo.json' ? 'resumo'
        : ficha ? 'ficha' : null
  if (!alvo) return false
  const arquivo = join(estatico, caminho)
  if (!existsSync(arquivo)) return false
  const mtime = statSync(arquivo).mtimeMs
  const chave = `${caminho}|${mtime}|${versao}`
  let pronto = cache.get(chave)
  if (!pronto) {
    const dado = JSON.parse(readFileSync(arquivo, 'utf8'))
    let saida = dado
    if (alvo === 'catalogo') saida = aplicarCatalogo(dado, edicoesObras(banco))
    else if (alvo === 'ficha') {
      const ed = edicoesObras(banco).get(Number(ficha[1]))
      if (ed?.oculta) saida = null
      else if (ed) { saida = { ...dado }; for (const k of CAMPOS_FICHA) if (ed[k] !== undefined) saida[k] = ed[k] }
    } else saida = aplicarQuadrinhos(dado, edicoesSeries(banco))
    const corpo = saida === null ? null : Buffer.from(JSON.stringify(saida))
    pronto = { corpo, etag: corpo ? `"c${createHash('sha1').update(corpo).digest('base64url').slice(0, 16)}"` : null }
    // o catálogo tem ~1 MB; guardar poucas versões basta
    if (cache.size > 40) cache.clear()
    cache.set(chave, pronto)
  }
  if (!pronto.corpo) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('não achei'); return true }
  if (req.headers['if-none-match'] === pronto.etag) { res.writeHead(304, { etag: pronto.etag, 'cache-control': 'no-cache' }); res.end(); return true }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', etag: pronto.etag, 'content-length': pronto.corpo.length })
  res.end(req.method === 'HEAD' ? undefined : pronto.corpo)
  return true
}

function aplicarCatalogo(dado, eds) {
  if (!eds.size) return dado
  const ocultas = new Set([...eds].filter(([, e]) => e.oculta).map(([id]) => id))
  const obras = dado.obras.filter((o) => !ocultas.has(o.id)).map((o) => {
    const e = eds.get(o.id)
    if (!e) return o
    const n = { ...o }
    for (const k of CAMPOS_CATALOGO) if (e[k] !== undefined) n[k] = e[k]
    return n
  })
  const colecoes = (dado.colecoes ?? []).map((c) => ({ ...c, obras: (c.obras ?? []).filter((id) => !ocultas.has(id)) }))
  return { ...dado, obras, colecoes }
}

function aplicarQuadrinhos(dado, eds) {
  if (!eds.size) return dado
  const series = dado.series
    .filter((s) => !eds.get(s.id)?.oculta)
    .map((s) => {
      const e = eds.get(s.id)
      if (!e) return s
      const n = { ...s }
      for (const k of ['titulo', 'resumo', 'tags', 'capa']) if (e[k] !== undefined) n[k] = e[k]
      if (e.destaque) n.destaque = true
      return n
    })
  // destaque primeiro, o resto na ordem de sempre
  series.sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0))
  return { ...dado, series }
}

// ── escrevendo ──

function temasValidos(estatico) {
  try { return new Set(JSON.parse(readFileSync(join(estatico, 'dados', 'catalogo.json'), 'utf8')).temas.map((t) => t.nome)) } catch { return new Set() }
}

export function salvarObra(banco, admin, estatico, dado) {
  const id = Number(dado.id)
  if (!Number.isInteger(id) || id <= 0) throw new Recusa('Obra inválida.')
  if (!existsSync(join(estatico, 'dados', 'fichas', `${id}.json`))) throw new Recusa('Obra não encontrada no catálogo.', 404)
  const antes = banco.prepare('SELECT campos FROM curadoria_obra WHERE obra_id = ?').get(id)
  const campos = antes ? JSON.parse(antes.campos) : {}
  // campo vazio = volta ao original (sai da edição)
  const poe = (k, v) => { if (v === null || v === '') delete campos[k]; else campos[k] = v }
  if ('titulo' in dado) poe('titulo', linha(dado.titulo, 200))
  if ('autor' in dado) poe('autor', linha(dado.autor, 160))
  if ('chamada' in dado) poe('chamada', linha(dado.chamada, 240))
  if ('subtitulo' in dado) poe('subtitulo', linha(dado.subtitulo, 200))
  if ('porque' in dado) poe('porque', limpar(dado.porque, 2000))
  if ('observar' in dado) poe('observar', limpar(dado.observar, 2000))
  if ('temas' in dado) {
    if (dado.temas === null) delete campos.temas
    else {
      const validos = temasValidos(estatico)
      const t = [...new Set((Array.isArray(dado.temas) ? dado.temas : []).map(String))].filter((x) => validos.has(x)).slice(0, 6)
      campos.temas = t
    }
  }
  if ('capa' in dado && dado.capa === null) delete campos.capa
  const oculta = dado.oculta === undefined ? undefined : dado.oculta ? 1 : 0
  banco.prepare(`INSERT INTO curadoria_obra (obra_id, campos, oculta, nota, mudou_em, mudou_por) VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(obra_id) DO UPDATE SET campos = excluded.campos, oculta = COALESCE(?, oculta), nota = COALESCE(excluded.nota, nota),
      mudou_em = datetime('now'), mudou_por = excluded.mudou_por`)
    .run(id, JSON.stringify(campos), oculta ?? 0, dado.nota === undefined ? null : linha(dado.nota, 300), admin.id, oculta ?? null)
  versao++
  return lerObra(banco, id)
}

export function salvarSerie(banco, admin, estatico, dado) {
  const id = String(dado.id ?? '')
  if (!/^[a-z0-9-]{2,80}$/.test(id)) throw new Recusa('Série inválida.')
  const serie = JSON.parse(readFileSync(join(estatico, 'dados', 'quadrinhos.json'), 'utf8')).series.find((s) => s.id === id)
  if (!serie) throw new Recusa('Série não encontrada.', 404)
  const antes = banco.prepare('SELECT campos FROM curadoria_serie WHERE serie_id = ?').get(id)
  const campos = antes ? JSON.parse(antes.campos) : {}
  const poe = (k, v) => { if (v === null || v === '' || (Array.isArray(v) && !v.length)) delete campos[k]; else campos[k] = v }
  if ('titulo' in dado) poe('titulo', linha(dado.titulo, 160))
  if ('resumo' in dado) poe('resumo', limpar(dado.resumo, 1500))
  if ('tags' in dado) poe('tags', (Array.isArray(dado.tags) ? dado.tags : []).map((t) => linha(t, 30)).filter(Boolean).slice(0, 10))
  if ('capa' in dado) {
    // capa escolhida entre as páginas da própria série, ou volta ao original
    if (dado.capa === null) delete campos.capa
    else if (serie.capitulos.some((c) => c.paginas.includes(dado.capa))) campos.capa = dado.capa
    else throw new Recusa('Escolha uma página da própria série para capa.')
  }
  const oculta = dado.oculta === undefined ? null : dado.oculta ? 1 : 0
  const destaque = dado.destaque === undefined ? null : dado.destaque ? 1 : 0
  banco.prepare(`INSERT INTO curadoria_serie (serie_id, campos, oculta, destaque, mudou_em, mudou_por) VALUES (?, ?, COALESCE(?, 0), COALESCE(?, 0), datetime('now'), ?)
    ON CONFLICT(serie_id) DO UPDATE SET campos = excluded.campos, oculta = COALESCE(?, oculta), destaque = COALESCE(?, destaque),
      mudou_em = datetime('now'), mudou_por = excluded.mudou_por`)
    .run(id, JSON.stringify(campos), oculta, destaque, admin.id, oculta, destaque)
  versao++
  return lerSerie(banco, id)
}

export function lerObra(banco, id) {
  const l = banco.prepare('SELECT campos, oculta, nota, mudou_em FROM curadoria_obra WHERE obra_id = ?').get(Number(id))
  return l ? { id: Number(id), campos: JSON.parse(l.campos), oculta: !!l.oculta, nota: l.nota, mudouEm: l.mudou_em } : { id: Number(id), campos: {}, oculta: false }
}

export function lerSerie(banco, id) {
  const l = banco.prepare('SELECT campos, oculta, destaque, mudou_em FROM curadoria_serie WHERE serie_id = ?').get(String(id))
  return l ? { id, campos: JSON.parse(l.campos), oculta: !!l.oculta, destaque: !!l.destaque, mudouEm: l.mudou_em } : { id, campos: {}, oculta: false, destaque: false }
}

export function listaEditados(banco) {
  return {
    obras: banco.prepare('SELECT obra_id id, oculta, mudou_em FROM curadoria_obra ORDER BY mudou_em DESC').all(),
    series: banco.prepare('SELECT serie_id id, oculta, destaque, mudou_em FROM curadoria_serie ORDER BY mudou_em DESC').all(),
  }
}

/** Capa enviada: limpa, guardada fora do site, ligada à obra ou à série. */
export function receberCapa(banco, admin, estatico, { tipo, id }, bytes) {
  let img
  try { img = limparImagem(bytes, { teto: 4 * 1024 * 1024 }) } catch (e) { if (e instanceof ImagemRecusada) throw new Recusa(e.message, 415); throw e }
  if (img.altura < img.largura) throw new Recusa('A capa precisa ser em pé.')
  const nome = `cur-${randomBytes(12).toString('hex')}.${img.extensao}`
  writeFileSync(join(PASTA, nome), img.bytes, { flag: 'wx', mode: 0o640 })
  const tabela = tipo === 'serie' ? 'curadoria_serie' : 'curadoria_obra'
  const coluna = tipo === 'serie' ? 'serie_id' : 'obra_id'
  const chave = tipo === 'serie' ? String(id) : Number(id)
  if (tipo === 'serie') { if (!/^[a-z0-9-]{2,80}$/.test(chave)) throw new Recusa('Série inválida.') }
  else if (!existsSync(join(estatico, 'dados', 'fichas', `${chave}.json`))) throw new Recusa('Obra não encontrada.', 404)
  const antes = banco.prepare(`SELECT campos FROM ${tabela} WHERE ${coluna} = ?`).get(chave)
  const campos = antes ? JSON.parse(antes.campos) : {}
  // a capa de livro é um nome em /capas; a de série é um caminho completo
  const velha = tipo === 'serie' ? campos.capa?.replace(/^\/capas\//, '') : campos.capa
  campos.capa = tipo === 'serie' ? `/capas/${nome}` : nome
  banco.prepare(`INSERT INTO ${tabela} (${coluna}, campos, mudou_em, mudou_por) VALUES (?, ?, datetime('now'), ?)
    ON CONFLICT(${coluna}) DO UPDATE SET campos = excluded.campos, mudou_em = datetime('now'), mudou_por = excluded.mudou_por`)
    .run(chave, JSON.stringify(campos), admin.id)
  if (velha && /^cur-[0-9a-f]{24}\.(jpg|png|webp)$/.test(velha)) { try { unlinkSync(join(PASTA, velha)) } catch {} }
  versao++
  return { ok: true, capa: campos.capa }
}

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** `/capas/cur-<hex>.<ext>`: só nome sorteado, só as três extensões. */
export function servirCapa(req, res, caminho) {
  const m = caminho.match(/^\/capas\/(cur-[0-9a-f]{24}\.(jpg|png|webp))$/)
  if (!m) return false
  const arquivo = join(PASTA, m[1])
  if (!existsSync(arquivo)) { res.writeHead(404); res.end(); return true }
  res.writeHead(200, {
    'content-type': MIME[m[2]], 'content-length': statSync(arquivo).size,
    'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  })
  createReadStream(arquivo).pipe(res)
  return true
}

// ── o que o painel precisa ver: o catálogo ORIGINAL (com os ocultos) ──

const baseCache = new Map()
function lerJsonCache(arquivo) {
  const mtime = statSync(arquivo).mtimeMs
  const c = baseCache.get(arquivo)
  if (c && c.mtime === mtime) return c.dado
  const dado = JSON.parse(readFileSync(arquivo, 'utf8'))
  baseCache.set(arquivo, { mtime, dado })
  return dado
}

export function baseParaPainel(banco, estatico, tipo) {
  if (tipo === 'quadrinhos') {
    const q = lerJsonCache(join(estatico, 'dados', 'quadrinhos.json'))
    const eds = edicoesSeries(banco)
    return {
      series: q.series.map((s) => ({
        id: s.id, titulo: s.titulo, autor: s.autor, resumo: s.resumo, tags: s.tags, capa: s.capa, idioma: s.idioma,
        volumes: s.capitulos.map((c) => ({ n: c.n, titulo: c.titulo, capa: c.capa, paginas: c.paginas.slice(0, 30), total: c.paginas.length })),
        edicao: eds.get(s.id) ?? null,
      })),
    }
  }
  const cat = lerJsonCache(join(estatico, 'dados', 'catalogo.json'))
  const eds = edicoesObras(banco)
  return {
    temas: cat.temas.map((t) => t.nome),
    obras: cat.obras.map((o) => ({ id: o.id, titulo: o.titulo, autor: o.autor, capa: o.capa, capaOL: o.capaOL, trilho: o.trilho, minutos: o.minutos, temas: o.temas,
      edicao: eds.get(o.id) ?? null })),
  }
}

export function fichaOriginal(banco, estatico, id) {
  const n = Number(id)
  const arquivo = join(estatico, 'dados', 'fichas', `${n}.json`)
  if (!Number.isInteger(n) || !existsSync(arquivo)) throw new Recusa('Obra não encontrada.', 404)
  const f = JSON.parse(readFileSync(arquivo, 'utf8'))
  const { capitulos, ...resto } = f
  return { original: { ...resto, capitulos: capitulos?.length ?? 0 }, edicao: lerObra(banco, n) }
}
