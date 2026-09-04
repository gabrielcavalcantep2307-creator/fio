// O servidor do Fio: serve o site E as contas, no mesmo processo.
//
//   node servidor/api.mjs
//
// **Por que juntos.** A alternativa era site num lugar e API em outro. Isso
// obriga a CORS, e obriga o cookie de sessão a atravessar origens — que é
// exatamente o que `SameSite` foi feito para impedir. Servindo os dois da
// mesma origem, o cookie funciona sem exceção nenhuma, o CSRF fica trancado
// pelo próprio navegador, e some uma classe inteira de bug de configuração.
//
// O Caddy fica na frente cuidando do TLS e da compressão. Este processo não
// precisa saber que ele existe.
//
// Variáveis: veja .env.exemplo

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import { abrir, RAIZ } from './banco/base.mjs'
import * as contas from './contas.mjs'
import { Recusa } from './contas.mjs'
import { enviar } from './email.mjs'
import { montarEpub, nomeDeArquivo } from './epub.mjs'

const PORTA = Number(process.env.FIO_PORTA || 8787)
const SITE = process.env.FIO_SITE || `http://localhost:${PORTA}`
const ESTATICO = process.env.FIO_ESTATICO || join(RAIZ, 'web', 'dist')

// Só é preciso quando o site NÃO vem deste processo (desenvolvimento, com o
// Vite na 5181). Em produção fica vazia, e aí nenhuma origem de fora entra.
const ORIGENS = (process.env.FIO_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean)

const banco = abrir()

// ─────────────────────────────────────────────────────────────
// CSRF
//
// Mesma origem + `SameSite=Lax` já impede que outro site faça o navegador
// mandar o cookie num POST. Sobre isso, duas travas a mais:
//
//   1. cabeçalho `x-fio` obrigatório em toda escrita — um <form> comum não
//      consegue mandar cabeçalho personalizado sem antes pedir permissão;
//   2. quando vier `Origin`, ela tem que ser a nossa (ou estar na lista).
// ─────────────────────────────────────────────────────────────

function origemOk(req) {
  const origem = req.headers.origin
  if (!origem) return true // pedido de mesma origem costuma vir sem Origin
  if (ORIGENS.includes(origem)) return true
  try { return new URL(origem).host === req.headers.host } catch { return false }
}

function cors(req, res) {
  const origem = req.headers.origin
  if (origem && ORIGENS.includes(origem)) {
    res.setHeader('access-control-allow-origin', origem)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type,x-fio')
    res.setHeader('access-control-max-age', '600')
  }
}

const SEGURO = process.env.FIO_INSEGURO !== '1' // só desligue em localhost

// `__Host-` não é enfeite: o navegador só aceita gravar um cookie com esse
// prefixo se ele vier por HTTPS, com `Path=/` e SEM `Domain`. Isso fecha o
// ataque em que um subdomínio qualquer (ou alguém em HTTP na mesma rede)
// grava um cookie de sessão que o site principal aceitaria.
//
// Em localhost sem HTTPS o prefixo é impossível, então lá o nome é o simples.
const NOME = SEGURO ? '__Host-fio' : 'fio'

function porCookie(res, token, dias) {
  const pedacos = [`${NOME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${dias * 24 * 3600}`]
  if (SEGURO) pedacos.push('Secure')
  res.setHeader('set-cookie', pedacos.join('; '))
}

const semCookie = (res) =>
  res.setHeader('set-cookie', `${NOME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SEGURO ? '; Secure' : ''}`)

const lerCookie = (req) =>
  (req.headers.cookie ?? '').split(';').map(s => s.trim())
    .find(s => s.startsWith(`${NOME}=`))?.slice(NOME.length + 1) || null

async function corpo(req) {
  const pedacos = []
  let tamanho = 0
  for await (const p of req) {
    tamanho += p.length
    if (tamanho > 64 * 1024) throw new Recusa('Pedido grande demais.', 413)
    pedacos.push(p)
  }
  if (!pedacos.length) return {}
  try { return JSON.parse(Buffer.concat(pedacos).toString('utf8')) }
  catch { throw new Recusa('Não entendi o pedido.', 400) }
}

const responder = (res, status, dado) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(dado))
}

/** O título do Gutenberg às vezes traz o subtítulo depois de uma quebra. */
const primeiraLinha = (s) => String(s ?? '').split(/[\r\n]/)[0].replace(/\s+/g, ' ').trim()

const ipDe = (req) =>
  (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress

const exigirEntrada = (req) => {
  const pessoa = contas.deQuemE(banco, lerCookie(req))
  if (!pessoa) throw new Recusa('Não está entrado.', 401)
  return pessoa
}

// ─────────────────────────────────────────────────────────────
// As rotas
// ─────────────────────────────────────────────────────────────

const ROTAS = {
  'GET /api/saude': () => ({ ok: true, versao: 1 }),

  'GET /api/eu': (req) => ({ pessoa: exigirEntrada(req) }),

  'POST /api/criar': async (req, res, dado, ctx) => {
    const { pessoa, sessao } = await contas.criar(banco, dado, ctx)
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  },

  'POST /api/entrar': async (req, res, dado, ctx) => {
    const { pessoa, sessao } = await contas.entrar(banco, dado, ctx)
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  },

  'POST /api/sair': (req, res) => {
    contas.sair(banco, lerCookie(req))
    semCookie(res)
    return { ok: true }
  },

  'POST /api/esqueci': async (req, res, dado, ctx) => {
    const { aviso } = contas.pedirTroca(banco, dado, ctx)
    if (aviso) {
      const link = `${SITE}/#/trocar-senha?t=${encodeURIComponent(aviso.token)}`
      await enviar({
        para: aviso.email,
        assunto: 'Trocar a senha do Fio',
        titulo: `Olá, ${aviso.nome}`,
        texto: `Alguém pediu para trocar a senha desta conta. Se não foi você, ignore este e-mail — nada muda. O link vale por ${aviso.minutos} minutos e só funciona uma vez.`,
        botao: { rotulo: 'Escolher outra senha', url: link },
      })
    }
    // A resposta é a mesma exista ou não a conta. É de propósito.
    return { ok: true }
  },

  'POST /api/trocar-senha': async (req, res, dado) => {
    await contas.trocarSenha(banco, dado)
    semCookie(res)
    return { ok: true }
  },

  // ── o que o leitor guardou, entre aparelhos ──
  'GET /api/meus-dados': (req) => {
    const pessoa = exigirEntrada(req)
    return contas.lerGuardado(banco, pessoa.id)
  },

  'POST /api/meus-dados': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    return contas.guardar(banco, pessoa.id, dado)
  },

  // ── o que está sendo lido, medido e anônimo ──
  'GET /api/populares': () => ({
    semana: contas.maisLidos(banco, { dias: 7, quantos: 10 }),
    mes: contas.maisLidos(banco, { dias: 30, quantos: 10 }),
  }),

  // ── LGPD: levar embora, e apagar ──
  //
  // Sem estas duas rotas, o "apagar tudo" do caderno seria mentira: o
  // navegador esqueceria, a sincronia rodaria dois minutos depois e o
  // servidor devolveria tudo.
  'POST /api/apagar-dados': (req) => {
    const pessoa = exigirEntrada(req)
    return contas.apagarGuardado(banco, pessoa.id)
  },

  'POST /api/apagar-conta': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    // Exige o e-mail digitado. Apagar conta é irreversível, e um clique
    // sozinho não é consentimento suficiente para o que não volta.
    if (String(dado.email ?? '').trim().toLowerCase() !== pessoa.email) {
      throw new Recusa('Digite o e-mail da conta para confirmar.')
    }
    contas.apagarConta(banco, pessoa.id)
    semCookie(res)
    return { ok: true }
  },

  // ── administração ──
  'POST /api/convite': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    if (pessoa.papel !== 'admin') throw new Recusa('Não pode.', 403)
    return contas.criarConvite(banco, { criadoPor: pessoa.id, nota: dado.nota })
  },
}

// ─────────────────────────────────────────────────────────────
// Baixar o livro
//
// Rota com número no meio, então não cabe no mapa de rotas exatas. Fica aqui,
// à parte, e responde antes dele.
//
// A checagem de direito acontece AQUI de novo, e não confia no que o catálogo
// disse: `obra.trilho` é rótulo de tela, `direito` é a regra. Servir um
// arquivo é mais sério que mostrar um botão.
// ─────────────────────────────────────────────────────────────

const doLivro = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, t.id texto_id, t.fonte, t.fonte_url, t.normalizado,
         d.estado, d.motivo,
         (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
           WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
    FROM obra o
    JOIN texto t ON t.obra_id = o.id AND t.dono_id IS NULL
    LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
   WHERE o.id = ? AND o.publicada = 1`)

const capitulosDo = banco.prepare(
  'SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')

const paraLeitura = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, o.minutos_leitura, o.capa, o.capa_externa, o.trilho,
         t.id texto_id, d.estado,
         p.id autor_id, p.nome autor
    FROM obra o
    JOIN texto t ON t.obra_id = o.id AND t.dono_id IS NULL
    LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
    LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    LEFT JOIN pessoa p ON p.id = op.pessoa_id
   WHERE o.id = ? AND o.publicada = 1 AND t.normalizado = 1
   GROUP BY o.id`)

/**
 * O livro inteiro, para o leitor.
 *
 * Já foi arquivo estático. Parou de ser quando o acervo legível chegou a 527
 * obras: 127 MB de texto copiados inteiros a cada publicação e versionados no
 * git. O banco já vai para a máquina de qualquer jeito.
 *
 * O direito é conferido AQUI de novo. `obra.trilho` é rótulo de tela; a regra
 * é a tabela `direito`.
 */
function servirLivro(res, id) {
  const casa = process.env.FIO_JURISDICAO || 'BR'
  const o = paraLeitura.get(casa, id)
  if (!o) throw new Recusa('Não temos o texto desta obra.', 404)
  if (o.estado !== 'dominio_publico' && o.estado !== 'licenca_livre') {
    throw new Recusa('Esta obra não pode ser lida aqui.', 403)
  }
  const capitulos = capitulosDo.all(o.texto_id)
  if (!capitulos.length) throw new Recusa('Não temos o texto desta obra.', 404)

  responder(res, 200, {
    id: o.id,
    titulo: primeiraLinha(o.titulo_pt || o.titulo),
    autor: o.autor ?? 'autoria não identificada',
    autorId: o.autor_id,
    ano: null,
    trilho: 'A',
    minutos: o.minutos_leitura,
    temas: [],
    capa: o.capa, capaOL: o.capa_externa,
    textoId: o.texto_id,
    capitulos,
  })
}

function baixar(req, res, id) {
  const casa = process.env.FIO_JURISDICAO || 'BR'
  const o = doLivro.get(casa, id)

  if (!o || o.normalizado !== 1) throw new Recusa('Não temos o texto desta obra.', 404)
  if (o.estado !== 'dominio_publico' && o.estado !== 'licenca_livre') {
    throw new Recusa('Esta obra não pode ser distribuída daqui.', 403)
  }

  const livro = {
    id: o.id,
    titulo: primeiraLinha(o.titulo_pt || o.titulo),
    autor: o.autor ?? 'autoria não identificada',
    direito: o.motivo,
    fonteUrl: o.fonte_url,
    capitulos: capitulosDo.all(o.texto_id),
  }
  if (!livro.capitulos.length) throw new Recusa('Não temos o texto desta obra.', 404)

  const epub = montarEpub(livro)
  res.writeHead(200, {
    'content-type': 'application/epub+zip',
    'content-length': epub.length,
    // `filename*` com UTF-8 para o acento não virar lixo no nome do arquivo
    'content-disposition': `attachment; filename="${nomeDeArquivo(livro)}"; `
      + `filename*=UTF-8''${encodeURIComponent(nomeDeArquivo(livro))}`,
    'cache-control': 'public, max-age=3600',
  })
  res.end(epub)
}

// ─────────────────────────────────────────────────────────────
// O site estático
//
// Um servidor de arquivos de trinta linhas, e a única linha que importa é a
// que resolve o caminho e confere se ele continua dentro da pasta. Sem ela,
// `GET /../../etc/passwd` funciona.
// ─────────────────────────────────────────────────────────────

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}

function servirArquivo(req, res, caminho) {
  // `/ativos/index-a1b2.js` tem o resumo do conteúdo no nome: mudou o
  // conteúdo, muda o nome. Pode ficar no cache para sempre.
  // `index.html` NÃO pode: é ele que aponta para os nomes novos.
  const eterno = caminho.includes('/ativos/') || caminho.startsWith('/capas/')
  const arquivo = join(ESTATICO, normalize(caminho).replace(/^(\.\.[/\\])+/, ''))

  if (!arquivo.startsWith(ESTATICO)) { res.writeHead(403); return res.end() }
  if (!existsSync(arquivo) || !statSync(arquivo).isFile()) return null

  const info = statSync(arquivo)
  const etiqueta = `"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"`
  if (req.headers['if-none-match'] === etiqueta) { res.writeHead(304); return res.end() }

  res.writeHead(200, {
    'content-type': TIPOS[extname(arquivo).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': eterno ? 'public, max-age=31536000, immutable' : 'no-cache',
    etag: etiqueta,
  })
  createReadStream(arquivo).pipe(res)
  return true
}

// ─────────────────────────────────────────────────────────────

const servidor = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  let caminho
  try { caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname) }
  catch { res.writeHead(400); return res.end() }

  // ── "abri este livro": conta anônima, e por isso fica fora do mapa ──
  const abrindo = caminho.match(/^\/api\/abri\/(\d+)$/)
  if (abrindo && req.method === 'POST') {
    try {
      if (req.headers['x-fio'] !== '1') throw new Recusa('Pedido sem identificação.', 403)
      return responder(res, 200, contas.registrarAbertura(banco, Number(abrindo[1]), { ip: ipDe(req) }))
    } catch (e) {
      const r = e instanceof Recusa ? e : null
      return responder(res, r?.status ?? 500, { erro: r?.message ?? 'erro' })
    }
  }

  // ── o livro: texto para ler, e arquivo para levar ──
  const pedindoLivro = caminho.match(/^\/api\/livro\/(\d+)$/)
  if (pedindoLivro) {
    try {
      if (req.method !== 'GET') throw new Recusa('Só GET.', 405)
      // O texto de domínio público não muda; o navegador pode guardar.
      res.setHeader('cache-control', 'public, max-age=3600')
      return servirLivro(res, Number(pedindoLivro[1]))
    } catch (e) {
      if (e instanceof Recusa) return responder(res, e.status, { erro: e.message })
      console.error('[fio] livro', e)
      return responder(res, 500, { erro: 'Não consegui abrir o livro.' })
    }
  }

  const baixando = caminho.match(/^\/api\/livro\/(\d+)\/epub$/)
  if (baixando) {
    try {
      if (req.method !== 'GET') throw new Recusa('Só GET.', 405)
      return baixar(req, res, Number(baixando[1]))
    } catch (e) {
      if (e instanceof Recusa) return responder(res, e.status, { erro: e.message })
      console.error('[fio] epub', e)
      return responder(res, 500, { erro: 'Não consegui montar o arquivo.' })
    }
  }

  // ── API ──
  if (caminho.startsWith('/api/')) {
    const chave = `${req.method} ${caminho.replace(/\/+$/, '')}`
    const rota = ROTAS[chave]
    try {
      if (!rota) throw new Recusa('Não existe.', 404)
      if (!origemOk(req)) throw new Recusa('Origem não autorizada.', 403)
      if (req.method === 'POST' && req.headers['x-fio'] !== '1') {
        throw new Recusa('Pedido sem identificação.', 403)
      }
      const dado = req.method === 'POST' ? await corpo(req) : {}
      const ctx = { ip: ipDe(req), agente: req.headers['user-agent'] }
      return responder(res, 200, await rota(req, res, dado, ctx))
    } catch (e) {
      if (e instanceof Recusa) return responder(res, e.status, { erro: e.message })
      // Nunca devolva a mensagem interna: ela conta como o sistema é por dentro.
      console.error(`[fio] ${chave}`, e)
      return responder(res, 500, { erro: 'Deu alguma coisa errada aqui. Tente de novo.' })
    }
  }

  // ── site ──
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
  try {
    if (servirArquivo(req, res, caminho)) return
    // rota do app: devolve o index e deixa o navegador resolver
    if (servirArquivo(req, res, '/index.html')) return
  } catch (e) {
    console.error('[fio] estático', e)
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('não achei')
})

servidor.listen(PORTA, () => {
  console.log(`fio na porta ${PORTA}`)
  console.log(`  site ..... ${SITE}`)
  console.log(`  estático . ${ESTATICO}${existsSync(ESTATICO) ? '' : '  (não existe — rode o build)'}`)
  if (ORIGENS.length) console.log(`  origens .. ${ORIGENS.join(', ')}`)
  if (!SEGURO) console.log('  ATENÇÃO: cookie sem Secure (FIO_INSEGURO=1). Só em localhost.')
})

// Encerrar direito importa: o SQLite em WAL precisa fechar para o checkpoint.
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`\n[fio] ${sinal}, encerrando`)
    servidor.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
