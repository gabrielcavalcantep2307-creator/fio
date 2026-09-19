// O site estático: arquivos da pasta do site, com as poucas regras que o site
// tem (quadrinho que pede conta, capas e catálogo da curadoria, o endereço
// antigo do app).
//
// Um servidor de arquivos de trinta linhas, e a única linha que importa é a
// que resolve o caminho e confere se ele continua dentro da pasta. Sem ela,
// `GET /../../etc/passwd` funciona.

import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import * as acesso from '../acesso.mjs'
import * as curadoria from '../curadoria.mjs'

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

export function criarEstatico({ banco, estatico, quemE }) {
  function servirArquivo(req, res, caminho) {
    // `/ativos/index-a1b2.js` tem o resumo do conteúdo no nome: mudou o
    // conteúdo, muda o nome. Pode ficar no cache para sempre.
    // `index.html` NÃO pode: é ele que aponta para os nomes novos.
    const eterno = caminho.includes('/ativos/') || caminho.startsWith('/capas/')
    const arquivo = join(estatico, normalize(caminho).replace(/^(\.\.[/\\])+/, ''))

    if (!arquivo.startsWith(estatico)) { res.writeHead(403); res.end(); return true }
    if (!existsSync(arquivo) || !statSync(arquivo).isFile()) return false

    const info = statSync(arquivo)
    const etiqueta = `"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"`
    if (req.headers['if-none-match'] === etiqueta) { res.writeHead(304); res.end(); return true }

    res.writeHead(200, {
      'content-type': TIPOS[extname(arquivo).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': eterno ? 'public, max-age=31536000, immutable' : 'no-cache',
      etag: etiqueta,
    })
    createReadStream(arquivo).pipe(res)
    return true
  }

  // As imagens que servem de CAPA (da série e de cada volume, e as que a
  // curadoria escolheu) são públicas mesmo nos volumes que pedem conta: a
  // vitrine e a lista de volumes precisam mostrá-las. Só as páginas ficam
  // fechadas. Guardado até o quadrinhos.json ou a curadoria mudar.
  let capasGuardadas = { chave: '', lista: new Set() }
  function capasDeQuadrinho() {
    const arq = join(estatico, 'dados', 'quadrinhos.json')
    let chave = ''
    try { chave = `${statSync(arq).mtimeMs}` } catch { return capasGuardadas.lista }
    let escolhidas = []
    try { escolhidas = banco.prepare('SELECT campos FROM curadoria_serie').all().map((l) => JSON.parse(l.campos).capa).filter((c) => typeof c === 'string') } catch {}
    chave += `|${escolhidas.join(',')}`
    if (chave === capasGuardadas.chave) return capasGuardadas.lista
    const lista = new Set(escolhidas)
    try {
      for (const s of JSON.parse(readFileSync(arq, 'utf8')).series ?? []) {
        if (typeof s.capa === 'string') lista.add(s.capa)
        for (const c of s.capitulos ?? []) if (typeof c.capa === 'string') lista.add(c.capa)
      }
    } catch {}
    capasGuardadas = { chave, lista }
    return lista
  }

  /** Atende um pedido do site. Sempre responde (no pior caso, 404). */
  return function atender(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
    try {
      // Quadrinhos livres: sem conta, só o primeiro volume/episódio de cada
      // série. A imagem das outras pede conta (a página do leitor explica).
      // (as pastas são "01", "ep02", "vol03"…; a capa de cada volume é sempre livre)
      const quadro = caminho.match(/^\/quadrinhos\/[^/]+\/[a-z]*(\d+)\/([^/]+)$/)
      if (quadro && Number(quadro[1]) > 1 && !/^capa\./.test(quadro[2]) && !capasDeQuadrinho().has(caminho)
        && acesso.amostraLigada(banco) && !quemE(req)) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        return res.end('crie uma conta para continuar')
      }
      if (curadoria.servirCapa(req, res, caminho)) return
      if (curadoria.servirCatalogo(banco, estatico, req, res, caminho)) return
      if (servirArquivo(req, res, caminho)) return
      // O app navega por HASH (`/#/obra/12`). Um endereço de caminho —
      // `/obra/12`, de um link antigo ou compartilhado — vira o que o app
      // entende. O destino é sempre relativo à própria casa: não há
      // redirecionamento aberto. (`caminho` já veio decodificado; um acento no
      // cabeçalho cru derrubaria o writeHead, daí o encodeURI.)
      if (/^\/(obra|autor|ler|tema|estante|caderno|entrar)(\/[^?#]*)?$/.test(caminho)) {
        res.writeHead(302, { location: `/#${encodeURI(caminho)}` })
        return res.end()
      }
      // rota do app: devolve o index e deixa o navegador resolver
      if (servirArquivo(req, res, '/index.html')) return
    } catch (e) {
      console.error('[fio] estático', e)
      if (res.headersSent) return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('não achei')
  }
}
