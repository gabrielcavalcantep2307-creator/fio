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
import { montarEpub, nomeDeArquivo } from './epub.mjs'
import { ondeComecaOLivro } from './folha-de-rosto.mjs'
import { criarBuscaNoTexto } from './busca-no-texto.mjs'
import { ipDoPedido } from './seguranca.mjs'

const PORTA = Number(process.env.FIO_PORTA || 8787)
const SITE = process.env.FIO_SITE || `http://localhost:${PORTA}`
const ESTATICO = process.env.FIO_ESTATICO || join(RAIZ, 'web', 'dist')

// Só é preciso quando o site NÃO vem deste processo (desenvolvimento, com o
// Vite na 5181). Em produção fica vazia, e aí nenhuma origem de fora entra.
const ORIGENS = (process.env.FIO_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean)

const banco = abrir()
const buscarNoTexto = criarBuscaNoTexto(banco)

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

const ipDe = (req) => ipDoPedido(req.headers['x-forwarded-for'], req.socket.remoteAddress)

const exigirEntrada = (req) => {
  const pessoa = contas.deQuemE(banco, lerCookie(req))
  if (!pessoa) throw new Recusa('Não está entrado.', 401)
  return pessoa
}

// ─────────────────────────────────────────────────────────────
// As rotas
// ─────────────────────────────────────────────────────────────

const ROTAS = {
  'GET /api/saude': () => ({ ok: true, versao: 1, convite: contas.portaAberta() ? 'opcional' : 'obrigatorio' }),

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

  // ── esqueci a senha, sem e-mail ──
  //
  // O link por e-mail saiu. Ele amarrava a conta a uma caixa de mensagens que
  // não é nossa: quem perdia o e-mail perdia a conta, e quem tinha o e-mail
  // invadido perdia a conta junto — o link era a chave mestra.
  //
  // No lugar, o que a pessoa SABE. Duas rotas: uma diz quais são as perguntas
  // daquele endereço, a outra recebe as respostas e a senha nova de uma vez.
  // Não há passo intermediário e não há token guardado em lugar nenhum — o
  // "pode trocar" nunca existe como estado, então não há o que roubar.

  'POST /api/perguntas': (req, res, dado, ctx) => contas.perguntasParaRecuperar(banco, dado, ctx),

  'POST /api/responder': async (req, res, dado, ctx) => {
    await contas.recuperarComRespostas(banco, dado, ctx)
    semCookie(res)
    return { ok: true }
  },

  /** As sugestões para a tela de cadastro montar a escolha. */
  'GET /api/sugestoes': () => contas.perguntasSugeridas(),

  // ── a conta por dentro ──
  //
  // Trocar a senha derruba todas as sessões, inclusive esta. O servidor
  // devolve um cookie novo na mesma resposta: quem trocou continua dentro, e
  // todo o resto cai. Sem isso, trocar a senha deslogaria quem trocou — e a
  // pessoa concluiria que deu errado.
  'POST /api/minha-senha': async (req, res, dado, ctx) => {
    const pessoa = exigirEntrada(req)
    const { sessao } = await contas.trocarMinhaSenha(banco, pessoa.id, dado, ctx)
    porCookie(res, sessao.token, sessao.dias)
    return { ok: true }
  },

  'POST /api/meu-nome': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    return contas.mudarNome(banco, pessoa.id, dado)
  },

  /** As MINHAS perguntas: o texto delas, nunca as respostas. */
  'GET /api/minhas-perguntas': (req) => {
    const pessoa = exigirEntrada(req)
    return { perguntas: contas.minhasPerguntas(banco, pessoa.id) }
  },

  // Trocar as perguntas exige a senha atual, pelo mesmo motivo que trocar a
  // senha exige: trocar as perguntas é justamente como alguém sentado num
  // computador aberto tomaria a conta para sempre.
  'POST /api/minhas-perguntas': async (req, res, dado, ctx) => {
    const pessoa = exigirEntrada(req)
    return contas.trocarMinhasPerguntas(banco, pessoa.id, dado, ctx)
  },

  'GET /api/meus-aparelhos': (req) => {
    const pessoa = exigirEntrada(req)
    return contas.minhasSessoes(banco, pessoa.id, lerCookie(req))
  },

  'POST /api/sair-dos-outros': (req) => {
    const pessoa = exigirEntrada(req)
    return contas.sairDosOutros(banco, pessoa.id, lerCookie(req))
  },

  // LGPD, art. 18, V: levar tudo embora, em formato legível.
  'GET /api/exportar': (req) => {
    const pessoa = exigirEntrada(req)
    return contas.exportarTudo(banco, pessoa.id)
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

  // ── nota e resenha ──
  //
  // Ler é público: quem chega sem conta vê a média e as resenhas, porque é
  // isso que ajuda a escolher o livro. Escrever exige conta, porque resenha
  // sem dono é panfleto.

  'POST /api/avaliar': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    return contas.avaliar(banco, pessoa.id, Number(dado.obra), dado)
  },

  'POST /api/desavaliar': (req, res, dado) => {
    const pessoa = exigirEntrada(req)
    return contas.desavaliar(banco, pessoa.id, Number(dado.obra))
  },

  // ── o que está sendo lido, medido e anônimo ──
  // Buscar DENTRO dos livros. O índice FTS5 sobre 110 milhões de palavras
  // existia, populado, e nenhuma rota o consultava — a busca do site só via
  // título e autor. É a diferença entre catálogo e biblioteca.
  'GET /api/procurar': (req, res, dado, ctx) =>
    buscarNoTexto(ctx.busca?.get('q') ?? '', { jurisdicao: process.env.FIO_JURISDICAO || 'BR' }),

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

// Uma obra traduzida por nós tem DOIS textos: a nossa tradução em português
// e o original de que ela partiu, guardado para conferência. O que se entrega
// é sempre o português — a subconsulta escolhe, e não o acaso do JOIN.
const O_TEXTO_QUE_VALE = `t.id = (
    SELECT id FROM texto WHERE obra_id = o.id AND dono_id IS NULL
     ORDER BY (idioma = 'pt') DESC, normalizado DESC, id LIMIT 1)`

const doLivro = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, t.id texto_id, t.fonte, t.fonte_url, t.normalizado,
         t.revisao, tr.nome tradutor,
         d.estado, d.motivo,
         (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
           WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
    FROM obra o
    JOIN texto t ON ${O_TEXTO_QUE_VALE}
    LEFT JOIN pessoa tr ON tr.id = t.tradutor_id
    LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
   WHERE o.id = ? AND o.publicada = 1`)

const capitulosDo = banco.prepare(
  'SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')

const paraLeitura = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, o.minutos_leitura, o.capa, o.capa_externa, o.trilho,
         t.id texto_id, t.revisao, t.aviso, t.fonte_url base_url, tr.nome tradutor, d.estado,
         p.id autor_id, p.nome autor
    FROM obra o
    JOIN texto t ON ${O_TEXTO_QUE_VALE}
    LEFT JOIN pessoa tr ON tr.id = t.tradutor_id
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
    // Em que capítulo entrar quando não há marca de onde parou. Sem isto o
    // leitor abre na folha de rosto do editor em 582 obras.
    comecaEm: ondeComecaOLivro(capitulos),
    // O defeito DESTA digitalização, dito antes de o leitor estranhar o
    // texto: hoje é sempre o "s" longo das edições anteriores ao século XIX.
    aviso: o.aviso ?? null,
    // O rótulo viaja com o TEXTO, e não como enfeite da ficha: quem abre o
    // livro direto pelo endereço tem que ver o aviso do mesmo jeito.
    traducao: o.revisao ? { revisao: o.revisao, tradutor: o.tradutor, original: o.base_url } : null,
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
    // O arquivo sai da nossa casa e vai viver no aparelho de alguém. O aviso
    // tem que ir junto, senão daqui a um ano ele é só "um epub que eu tenho".
    direito: o.revisao === 'automatica'
      ? `Tradução automática do Fio, sem revisão humana. ${o.motivo ?? ''}`
      : o.motivo,
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

  // ── as avaliações de uma obra: leitura pública ──
  const pedindoAvaliacoes = caminho.match(/^\/api\/obra\/(\d+)\/avaliacoes$/)
  if (pedindoAvaliacoes && req.method === 'GET') {
    try {
      const quem = contas.deQuemE(banco, lerCookie(req))
      return responder(res, 200, contas.avaliacoesDa(banco, Number(pedindoAvaliacoes[1]), quem?.id ?? null))
    } catch (e) {
      console.error('[fio] avaliacoes', e)
      return responder(res, 500, { erro: 'não consegui ler as avaliações' })
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
      const ctx = {
        ip: ipDe(req),
        agente: req.headers['user-agent'],
        // a parte depois do , para as rotas que recebem parâmetro por GET
        busca: new URL(req.url, 'http://x').searchParams,
      }
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
