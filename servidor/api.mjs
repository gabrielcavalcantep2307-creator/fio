// O servidor do Fio: serve o site E a API, no mesmo processo.
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
// ─────────────────────────────────────────────────────────────
// COMO ESTÁ ORGANIZADO (19/09/2026)
//
//   http/pedido.mjs      corpo com teto, JSON, cookies, IP, origem
//   http/roteador.mjs    a ORDEM das travas, igual para toda rota
//   http/estatico.mjs    os arquivos do site
//   http/painel.mjs      o painel, num endereço secreto (FIO_PAINEL)
//   rotas/*.mjs          as rotas, por assunto; cada uma declara acesso
//                        ('livre' | 'conta' | 'admin'), freio e corpo
//   <assunto>.mjs        as regras (contas, planos, publicações…)
//   servicos/*.mjs       o que a esteira usa: traduzir, instalar, publicar
//
// Este arquivo só monta as peças. Até esta data ele tinha 1.300 linhas: o
// mapa de rotas mais quinze rotas escritas à parte, cada uma repetindo as
// travas de segurança à mão.
//
// Variáveis: veja .env.exemplo
// ─────────────────────────────────────────────────────────────

import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, RAIZ } from './banco/base.mjs'
import * as contas from './contas.mjs'
import { fluxoPassa } from './seguranca.mjs'
import * as gosto from './gosto.mjs'
import * as planos from './planos.mjs'
import * as publicacoes from './publicacoes.mjs'
import * as acesso from './acesso.mjs'
import * as esteira from './esteira.mjs'
import * as correcoes from './correcoes.mjs'
import * as curadoria from './curadoria.mjs'
import * as extras from './extras.mjs'
import * as google from './google.mjs'
import * as diario from './diario.mjs'
import * as mangaLista from './manga-lista.mjs'
import * as qualidade from './qualidade.mjs'
import * as contato from './contato.mjs'
import { criarRoteador } from './http/roteador.mjs'
import { criarEstatico } from './http/estatico.mjs'
import { criarPainel, caminhoDoPainel } from './http/painel.mjs'
import { criarVitrine } from './http/vitrine.mjs'
import * as manutencao from './manutencao.mjs'
import { cors, ipDe, ORIGENS, SEGURO } from './http/pedido.mjs'
import rotasDeConta from './rotas/contas.mjs'
import rotasDoGoogle from './rotas/google.mjs'
import rotasDeLeitura from './rotas/leitura.mjs'
import rotasDoLeitor from './rotas/leitor.mjs'
import rotasDePublicacoes from './rotas/publicacoes.mjs'
import rotasDeQuadrinhos from './rotas/quadrinhos.mjs'
import rotasDoPainel from './rotas/admin.mjs'

const PORTA = Number(process.env.FIO_PORTA || 8787)
const SITE = process.env.FIO_SITE || `http://localhost:${PORTA}`
const ESTATICO = process.env.FIO_ESTATICO || join(RAIZ, 'web', 'dist')

const banco = abrir()
for (const m of [gosto, planos, publicacoes, acesso, esteira, correcoes, curadoria, extras, google, diario, mangaLista, qualidade, contato]) m.garantirTabelas(banco)
// marca a fundação num banco que já tem dona (ver contas.casaFundada)
contas.casaFundada(banco)

// A faxina das imagens de publicação: na subida e de hora em hora.
const faxina = () => { try { publicacoes.faxina(banco) } catch (e) { console.error('[fio] faxina', e) } }
faxina()
setInterval(faxina, 3600_000).unref()

const roteador = criarRoteador({ banco })
const app = { rota: roteador.rota, quemE: roteador.quemE, banco, estatico: ESTATICO, site: SITE }
for (const rotas of [rotasDeConta, rotasDoGoogle, rotasDeLeitura, rotasDoLeitor, rotasDePublicacoes, rotasDeQuadrinhos, rotasDoPainel]) rotas(app)
const site = criarEstatico({ banco, estatico: ESTATICO, quemE: roteador.quemE })
// uma página de verdade por livro e por autor, para o Google (http/vitrine.mjs)
const vitrine = criarVitrine({ banco, estatico: ESTATICO, site: SITE })
// o painel num endereço secreto, só para admin (http/painel.mjs)
const painel = criarPainel({ quemE: roteador.quemE })
const PAINEL = caminhoDoPainel()

const servidor = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  // Controle de fluxo por IP, em memória (seguranca.mjs): um teto de pedidos
  // por minuto para a API e outro, mais largo, para os arquivos.
  const fluxo = fluxoPassa(ipDe(req) ?? 'sem-ip', (req.url ?? '').startsWith('/api/') ? 'api' : 'arquivos')
  if (!fluxo.passa) {
    res.writeHead(429, { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(fluxo.esperar), 'cache-control': 'no-store' })
    return res.end(JSON.stringify({ erro: 'Muitos pedidos seguidos. Espere um minuto.' }))
  }

  let caminho
  try { caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.writeHead(400); return res.end() }

  // "desligado" pelo painel: quem não é admin vê a página de manutenção
  if (manutencao.barrar(banco, req, res, caminho, { quemE: roteador.quemE, painel: PAINEL })) return
  if (await roteador.atender(req, res, caminho)) return
  if (painel(req, res, caminho)) return
  if (vitrine(req, res, caminho)) return
  site(req, res, caminho)
})

servidor.listen(PORTA, () => {
  console.log(`fio na porta ${PORTA}`)
  console.log(`  site ..... ${SITE}`)
  console.log(`  estático . ${ESTATICO}${existsSync(ESTATICO) ? '' : '  (não existe — rode o build)'}`)
  console.log(`  rotas .... ${roteador.rotas().length}`)
  if (ORIGENS.length) console.log(`  origens .. ${ORIGENS.join(', ')}`)
  console.log(`  painel ... ${PAINEL ? 'ligado (endereço secreto)' : 'DESLIGADO: falta FIO_PAINEL'}`)
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
