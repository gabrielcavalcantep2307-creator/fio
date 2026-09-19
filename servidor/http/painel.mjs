// O painel de administração, num endereço que só o dono conhece.
//
// Até 19/09/2026 ele era /admin.html, na pasta pública: qualquer um digitava o
// endereço e via a tela de entrar do painel. A tranca de verdade sempre foi o
// servidor (as rotas /api/admin/* respondem 404 a quem não é admin), mas o
// dono pediu, com razão, que o painel nem se ANUNCIE. Agora:
//
//   FIO_PAINEL=/algo-longo-e-sorteado   (no .env da VPS; nunca no git)
//
//   admin entrado ........ o painel
//   ninguém entrado ...... vai para "Entrar com o Google" e volta aqui
//   leitor comum ......... o mesmo que qualquer endereço inexistente (o app)
//   /admin.html .......... admin vai para o endereço secreto; o resto, o app
//
// Os arquivos moram em servidor/painel/, fora da pasta do site: não há
// caminho público que os entregue. Sem FIO_PAINEL o painel fica DESLIGADO
// (falha fechada) — menos em localhost (FIO_INSEGURO=1), onde é /painel-local.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'painel')

export function caminhoDoPainel() {
  const p = String(process.env.FIO_PAINEL ?? '').trim()
  if (/^\/[A-Za-z0-9-]{16,80}$/.test(p)) return p
  if (process.env.FIO_INSEGURO === '1') return '/painel-local'
  return null
}

const googleLigado = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.FIO_GOOGLE === 'ligado')

export function criarPainel({ quemE }) {
  const PAINEL = caminhoDoPainel()

  function entregar(res, arquivo) {
    let corpo = readFileSync(join(PASTA, arquivo), 'utf8')
    if (arquivo.endsWith('.html')) corpo = corpo.replaceAll('{{PAINEL}}', PAINEL)
    res.writeHead(200, {
      'content-type': arquivo.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    })
    res.end(corpo)
    return true
  }

  /** Atende o painel; devolve false para o pedido seguir o caminho normal. */
  return function painel(req, res, caminho) {
    if (!PAINEL || (req.method !== 'GET' && req.method !== 'HEAD')) return false
    const eu = () => quemE(req)

    if (caminho === '/admin.html' || caminho === '/admin') {
      if (eu()?.papel !== 'admin') return false
      res.writeHead(302, { location: PAINEL, 'cache-control': 'no-store' })
      res.end()
      return true
    }

    if (caminho !== PAINEL && caminho !== `${PAINEL}/` && caminho !== `${PAINEL}/painel.js`) return false
    const quem = eu()
    const script = caminho.endsWith('.js')
    if (quem?.papel === 'admin') return entregar(res, script ? 'painel.js' : 'painel.html')
    if (quem) return false // leitor comum: é um endereço qualquer
    if (!googleLigado()) return entregar(res, script ? 'painel.js' : 'painel.html') // só localhost/sem Google: a senha
    if (script) return false
    res.writeHead(302, { location: `/api/google/entrar?volta=${encodeURIComponent(PAINEL)}`, 'cache-control': 'no-store' })
    res.end()
    return true
  }
}
