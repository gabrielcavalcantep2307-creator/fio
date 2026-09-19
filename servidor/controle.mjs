// A sala de controle: tudo que roda, num retrato só, para o painel.
//
// Pergunta que isto responde: "está tudo funcionando, e preciso abrir alguma
// coisa?". A resposta vem em `avisos` já decidida (ok / atencao / problema),
// para a tela só pintar.
//
// De onde vem cada pedaço:
//
//   o site ........ este próprio processo (se respondeu, está no ar)
//   a esteira ..... o pulso que ela grava no banco (esteira.estado)
//   a máquina ..... /proc/meminfo e o disco do volume — o container enxerga
//                   a memória e o disco da VPS inteira
//   backup, cópia   arquivos pequenos em /opt/fio/estado, montado aqui em
//   no PC, versão   /estado SÓ LEITURA. Quem escreve é o root da VPS
//                   (infra/backup.sh, infra/publicar-so-servidor.sh) e o PC
//                   (infra/copiar-do-ar.mjs).
//
// O que NÃO tem, de propósito: acesso ao Docker. Dar o socket do Docker ao
// site seria dar a VPS inteira a quem invadisse o site. O painel MOSTRA o
// estado e mexe só no que já é do banco (pausar a esteira, sessões).

import { readFileSync, statSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { loadavg, cpus } from 'node:os'
import * as esteira from './esteira.mjs'
import { minhasSessoes, adminSoPeloGoogle } from './contas.mjs'

const ESTADO = process.env.FIO_ESTADO || '/estado'
const INICIO = new Date()

const lerJson = (nome) => { try { return JSON.parse(readFileSync(join(ESTADO, nome), 'utf8')) } catch { return null } }
const horasDesde = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? (Date.now() - t) / 3600e3 : null }

function memoria() {
  try {
    const m = Object.fromEntries(readFileSync('/proc/meminfo', 'utf8').split('\n')
      .map((l) => l.match(/^(\w+):\s+(\d+)/)).filter(Boolean).map((x) => [x[1], Number(x[2]) * 1024]))
    return { total: m.MemTotal, livre: m.MemAvailable, swapTotal: m.SwapTotal ?? 0, swapLivre: m.SwapFree ?? 0 }
  } catch { return null }
}

function disco(caminho) {
  try { const s = statfsSync(caminho); return { total: s.blocks * s.bsize, livre: s.bavail * s.bsize } } catch { return null }
}

function tamanhoDoBanco() {
  const b = process.env.FIO_BANCO
  if (!b) return null
  let n = 0
  for (const f of [b, `${b}-wal`]) { try { n += statSync(f).size } catch {} }
  return n
}

/** Tentativas de senha nas últimas 24 h: na conta de administração e no total. */
function tentativas(banco) {
  try {
    const admins = banco.prepare("SELECT usuario_chave c FROM leitor WHERE papel = 'admin'").all().map((l) => `entrar:${l.c}`)
    const total = banco.prepare("SELECT COUNT(*) n FROM tentativa WHERE chave LIKE 'entrar:%' AND chave NOT LIKE 'entrar@ip:%'").get().n
    const admin = admins.length
      ? banco.prepare(`SELECT COUNT(*) n FROM tentativa WHERE chave IN (${admins.map(() => '?').join(',')})`).get(...admins).n : 0
    return { admin, total }
  } catch { return { admin: 0, total: 0 } }
}

function alertas(banco) {
  try { return banco.prepare('SELECT quando, tipo, detalhe FROM alerta_seguranca ORDER BY id DESC LIMIT 10').all() } catch { return [] }
}

export function retrato(banco, { pessoa, token }) {
  const e = esteira.estado(banco)
  const mem = memoria()
  const hd = disco(process.env.FIO_BANCO ? join(process.env.FIO_BANCO, '..') : '/')
  const backup = lerJson('backup.json')
  const copiaPc = lerJson('copia-pc.json')
  const vps = lerJson('maquina.json')
  const versao = lerJson('versao.json')
  const tent = tentativas(banco)
  const soGoogle = adminSoPeloGoogle(banco, pessoa.id)
  const alertasRecentes = alertas(banco)

  const avisos = []
  const diz = (nivel, assunto, texto) => avisos.push({ nivel, assunto, texto })

  diz('ok', 'Site', `no ar desde ${INICIO.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)

  if (e.pausada) diz('atencao', 'Esteira', 'pausada pelo painel. Nada se traduz até você retomar.')
  else if (e.viva) diz('ok', 'Esteira', e.pulso?.estado === 'ociosa' ? 'em dia, esperando livros novos' : 'trabalhando')
  else diz('problema', 'Esteira', `sem sinal há ${Math.round((e.pulso?.idadeSegundos ?? 0) / 60)} min. O serviço reinicia sozinho; se passar de 15 min, veja o log na VPS.`)
  if (e.fila.erro) diz('atencao', 'Esteira', `${e.fila.erro} livro(s) com erro na fila (aba Esteira → tentar de novo).`)

  const hB = horasDesde(backup?.quando)
  if (hB == null) diz('atencao', 'Backup do banco', 'ainda não há registro do backup (ele grava o primeiro às 03:20).')
  else if (hB > 36) diz('problema', 'Backup do banco', `o último é de ${Math.round(hB)} h atrás. O backup diário falhou.`)
  else diz('ok', 'Backup do banco', `feito há ${Math.round(hB)} h`)

  const hP = horasDesde(copiaPc?.quando)
  if (hP == null) diz('atencao', 'Cópia no seu PC', 'nenhuma cópia registrada ainda.')
  else if (hP > 72) diz('atencao', 'Cópia no seu PC', `a última é de ${Math.round(hP / 24)} dias atrás. Ela roda quando o notebook está ligado.`)
  else diz('ok', 'Cópia no seu PC', `feita há ${hP < 1 ? 'menos de 1' : Math.round(hP)} h`)

  if (mem) {
    const pct = mem.livre / mem.total
    if (!mem.swapTotal) diz('atencao', 'Memória da VPS', 'sem memória de reserva (swap). Num pico, o sistema mata processos.')
    if (pct < 0.1) diz('problema', 'Memória da VPS', `só ${Math.round(mem.livre / 1e6)} MB livres.`)
  }
  if (hd && hd.livre / hd.total < 0.1) diz('problema', 'Disco da VPS', `só ${Math.round(hd.livre / 1e9)} GB livres.`)

  if (!soGoogle) diz('atencao', 'Segurança', 'a conta de administração ainda entra com senha. Ligue o Google nela para a senha deixar de ser porta.')
  const hAlerta = horasDesde(alertasRecentes[0]?.quando?.replace(' ', 'T') + 'Z')
  if (hAlerta != null && hAlerta < 24 * 7) diz('problema', 'Segurança', 'alguém digitou a senha CERTA da administração nos últimos 7 dias (e foi barrado). Troque a senha.')
  if (tent.admin >= 5) diz('atencao', 'Segurança', `${tent.admin} senhas erradas na conta de administração nas últimas 24 h.`)
  if (vps?.reiniciar) diz('atencao', 'VPS', 'o sistema pede um reinício para terminar uma atualização.')

  return {
    avisos,
    site: { desde: INICIO.toISOString(), versao, memoria: process.memoryUsage().rss },
    esteira: { viva: e.viva, pausada: e.pausada, estado: e.pulso?.estado ?? null, fila: e.fila },
    maquina: { memoria: mem, disco: hd, carga: loadavg(), nucleos: cpus().length, banco: tamanhoDoBanco() },
    backup, copiaPc, vps,
    seguranca: {
      soGoogle,
      tentativas: tent,
      alertas: alertasRecentes,
      sessoes: minhasSessoes(banco, pessoa.id, token).sessoes,
    },
  }
}
