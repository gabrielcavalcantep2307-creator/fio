// A esteira vista do servidor: o pulso que ela manda, a fila e os pedidos.
//
// A esteira roda na máquina do dono e o painel roda aqui. Até 17/09 o painel
// só sabia o que a fila dizia — e a fila só mudava quando alguém rodava
// `puxar-fila.mjs`, então mostrava "29 na esteira" com a esteira parada havia
// dias. Agora:
//
//   1. a esteira manda um PULSO a cada ~20 s (`POST /api/esteira/pulso`, com a
//      chave FIO_ESTEIRA_CHAVE): o livro de agora, quantos trechos faltam, a
//      rodada inteira, e as últimas linhas do log;
//   2. o painel lê o pulso e a idade dele — pulso velho quer dizer esteira
//      parada (PC dormindo, prazo da rodada, erro), e o painel diz isso;
//   3. a fila se reconcilia sozinha a cada leitura do painel: o que já tem
//      tradução publicada vira "pronto", sem depender de script nenhum.
//
// A chave fica só no `.env` da VPS e num arquivo fora do git na máquina do
// dono. Sem a variável, a rota nem existe (404).

import { createHash, timingSafeEqual } from 'node:crypto'
import { Recusa } from './contas.mjs'
import { avisar } from './gosto.mjs'

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS esteira_pulso (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dados TEXT NOT NULL,
    recebido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
  // prioridade: pedido de assinante Tear passa na frente (ver fila-do-painel.mjs)
  try { banco.exec('ALTER TABLE fila_traducao ADD COLUMN prioridade INTEGER NOT NULL DEFAULT 0') } catch {}
}

const resumo = (s) => createHash('sha256').update(String(s)).digest()

export function chaveConfere(recebida) {
  const certa = process.env.FIO_ESTEIRA_CHAVE
  if (!certa || certa.length < 24) return false
  return timingSafeEqual(resumo(recebida ?? ''), resumo(certa))
}

const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n)
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

/** Guarda o pulso, só com os campos conhecidos e com tamanho limitado. */
export function receberPulso(banco, d) {
  const limpo = {
    estado: ['traduzindo', 'publicando', 'medindo', 'terminou', 'parada'].includes(d.estado) ? d.estado : 'traduzindo',
    rodada: { total: num(d.rodada?.total), feitos: num(d.rodada?.feitos), falhas: num(d.rodada?.falhas), inicio: txt(d.rodada?.inicio, 40) },
    plano: { total: num(d.plano?.total), traduzidos: num(d.plano?.traduzidos) },
    atual: d.atual ? {
      obra: num(d.atual.obra), titulo: txt(d.atual.titulo, 160), de: txt(d.atual.de, 8),
      feitas: num(d.atual.feitas), total: num(d.atual.total), minRestantes: num(d.atual.minRestantes), inicio: txt(d.atual.inicio, 40),
    } : null,
    ultimos: (Array.isArray(d.ultimos) ? d.ultimos : []).slice(0, 8).map((u) => ({ titulo: txt(u.titulo, 160), min: num(u.min), palavras: num(u.palavras), ok: !!u.ok })),
    log: (Array.isArray(d.log) ? d.log : []).slice(-12).map((l) => txt(l, 200)),
    enviado: txt(d.enviado, 40),
  }
  banco.prepare(`INSERT INTO esteira_pulso (id, dados, recebido_em) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, recebido_em = excluded.recebido_em`).run(JSON.stringify(limpo))
  return { ok: true }
}

/** O que o painel mostra da esteira, com a fila reconciliada. */
export function estado(banco) {
  banco.exec(`
    UPDATE fila_traducao SET estado = 'pronto', mexido_em = datetime('now')
     WHERE estado = 'na_esteira' AND obra_id IN (
       SELECT t.obra_id FROM texto t WHERE t.fonte = 'fio_traducao' AND t.normalizado = 1)`)
  // Quem pediu a tradução recebe o aviso (chave única: nunca repete).
  for (const f of banco.prepare("SELECT id, titulo, obra_id, pedido_por FROM fila_traducao WHERE estado = 'pronto' AND pedido_por IS NOT NULL AND obra_id IS NOT NULL").all()) {
    avisar(banco, f.pedido_por, { chave: `pedido-pronto-${f.id}`, tipo: 'pronto', titulo: `Pronto para ler: ${f.titulo}`,
      corpo: 'O livro que você pediu foi traduzido e já está no acervo.', link: `/#/obra/${f.obra_id}` })
  }
  const p = banco.prepare(`SELECT dados, recebido_em, CAST((julianday('now') - julianday(recebido_em)) * 86400 AS INTEGER) idade
      FROM esteira_pulso WHERE id = 1`).get()
  const fila = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM fila_traducao GROUP BY estado').all().map((l) => [l.estado, l.n]))
  const pulso = p ? { ...JSON.parse(p.dados), recebidoEm: p.recebido_em, idadeSegundos: p.idade } : null
  // Viva: pulso dos últimos 2 minutos e estado que não é de fim.
  const viva = !!pulso && pulso.idadeSegundos < 120 && !['terminou', 'parada'].includes(pulso.estado)
  return {
    viva, pulso,
    configurada: !!process.env.FIO_ESTEIRA_CHAVE,
    publicadas: banco.prepare("SELECT COUNT(*) n FROM texto WHERE fonte = 'fio_traducao'").get().n,
    fila: { espera: fila.espera ?? 0, na_esteira: fila.na_esteira ?? 0, pronto: fila.pronto ?? 0, erro: fila.erro ?? 0 },
  }
}

// ─────────────────────────────────────────────────────────────
// Pedidos de tradução de assinantes
//
// A pessoa escolhe um livro do Project Gutenberg. O servidor confere no
// catálogo do próprio Gutenberg que o autor morreu até 1955 e que o
// livro não está em português — é a mesma regra de domínio público do resto
// da casa — e põe na fila do painel com o nome de quem pediu.
// ─────────────────────────────────────────────────────────────

const ANO_LIMITE = new Date().getFullYear() - 71 // 2026 → morto até 1955
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.duckdns.org)'

// Consulta direto no catálogo do Project Gutenberg (17/09): a busca OPDS e a
// ficha RDF de cada livro respondem em menos de um segundo. O Gutendex, que
// se usava antes, chegou a levar mais de um minuto por página.
async function buscarTexto(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  if (r.status === 404) return null
  if (!r.ok) throw new Recusa('O catálogo do Gutenberg não respondeu. Tente de novo em instantes.', 502)
  return r.text()
}

const tirarEntidades = (t) => String(t ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")

/** A ficha RDF de um livro, reduzida ao que decide o pedido. */
async function fichaGutenberg(id) {
  const rdf = await buscarTexto(`https://www.gutenberg.org/ebooks/${id}.rdf`)
  if (!rdf) return null
  const um = (re) => tirarEntidades(rdf.match(re)?.[1] ?? '').trim()
  const idioma = um(/<dcterms:language>[\s\S]*?<rdf:value[^>]*>([a-z]{2,3})</)
  // TODAS as pessoas que têm direito sobre o texto: cada autor (livro com dois
  // autores só entra se os dois morreram a tempo — "Washington Confidential"
  // tem um de 1954 e outro de 1963) e cada tradutor/adaptador, porque traduzir
  // uma tradução de 1990 é traduzir uma obra de 1990.
  const agentes = new Map()
  for (const m of rdf.matchAll(/<pgterms:agent rdf:about="([^"]+)">([\s\S]*?)<\/pgterms:agent>/g)) {
    agentes.set(m[1], {
      name: tirarEntidades(m[2].match(/<pgterms:name>([^<]*)</)?.[1] ?? '').trim(),
      death_year: Number(m[2].match(/<pgterms:deathdate[^>]*>(-?\d{1,4})</)?.[1]) || null,
    })
  }
  const pessoas = (papel) => [...rdf.matchAll(new RegExp(`<${papel}(?:\\s+rdf:resource="([^"]+)"\\s*/>|>([\\s\\S]*?)</${papel}>)`, 'g'))]
    .map((m) => agentes.get(m[1] ?? m[2].match(/rdf:about="([^"]+)"/)?.[1]))
    .filter((a) => a?.name)
  return {
    id: Number(id),
    title: um(/<dcterms:title>([^<]*)</),
    authors: pessoas('dcterms:creator'),
    translators: [...pessoas('marcrel:trl'), ...pessoas('marcrel:adp')],
    languages: idioma ? [idioma] : [],
    livreEUA: /public domain in the usa/i.test(um(/<dcterms:rights>([^<]*)</)),
  }
}

const IDIOMAS = { en: 'inglês', fr: 'francês', de: 'alemão', es: 'espanhol', it: 'italiano', ru: 'russo', la: 'latim', nl: 'holandês', fi: 'finlandês', sv: 'sueco', da: 'dinamarquês', el: 'grego', ja: 'japonês', zh: 'chinês' }

export function avaliar(livro) {
  const autores = livro.authors ?? []
  const autor = autores[0]
  // a data que decide é a da ÚLTIMA morte entre os autores
  const morte = autores.some((a) => a.death_year == null) ? null : Math.max(...autores.map((a) => a.death_year))
  const idioma = livro.languages?.[0] ?? null
  const tradutor = (livro.translators ?? []).find((t) => t.death_year == null || t.death_year > ANO_LIMITE)
  const nomeDe = (a) => a.name.split(', ').reverse().join(' ')
  let problema = null
  if (!autor) problema = 'sem autor identificado'
  else if (morte == null) problema = autores.length > 1 ? 'não se sabe quando um dos autores morreu' : 'não se sabe quando o autor morreu'
  else if (morte > ANO_LIMITE) problema = `${autores.length > 1 ? 'um dos autores' : 'o autor'} morreu em ${morte}; só entra quem morreu até ${ANO_LIMITE}`
  else if (tradutor) problema = tradutor.death_year == null
    ? `esta edição é uma tradução de ${nomeDe(tradutor)}, e não se sabe quando morreu`
    : `esta edição é uma tradução de ${nomeDe(tradutor)}, que morreu em ${tradutor.death_year}`
  else if (livro.livreEUA === false) problema = 'o Gutenberg não marca como domínio público'
  else if (idioma === 'pt') problema = 'já está em português'
  else if (!IDIOMAS[idioma]) problema = 'língua que a esteira ainda não traduz'
  return {
    gutenberg: livro.id,
    titulo: String(livro.title ?? '').split(/[\r\n;]/)[0].slice(0, 200),
    autor: autor ? autores.map(nomeDe).join(' e ').slice(0, 120) : null,
    morte, idioma, idiomaNome: IDIOMAS[idioma] ?? idioma,
    pode: !problema, problema,
  }
}

export async function buscarLivro(q) {
  const termo = String(q ?? '').trim().slice(0, 80)
  if (termo.length < 3) throw new Recusa('Digite ao menos 3 letras.')
  const id = termo.match(/(?:ebooks\/)?(\d{1,6})\b/)?.[1]
  if (id && /^\s*(https?:\/\/\S*gutenberg\S*|\d+)\s*$/.test(termo)) {
    const l = await fichaGutenberg(id)
    return { livros: l ? [avaliar(l)] : [] }
  }
  const opds = await buscarTexto(`https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(termo)}`)
  const ids = [...new Set([...String(opds ?? '').matchAll(/<id>https?:\/\/www\.gutenberg\.org\/ebooks\/(\d+)\.opds<\/id>/g)].map((m) => m[1]))].slice(0, 8)
  const fichas = await Promise.all(ids.map((i) => fichaGutenberg(i).catch(() => null)))
  return { livros: fichas.filter(Boolean).map(avaliar) }
}

export async function pedir(banco, pessoa, plano, { gutenberg }) {
  if (!plano.pedidosMes) throw new Recusa('Pedir tradução faz parte dos planos Novelo, Trama e Tear.', 403)
  const usados = banco.prepare(`SELECT COUNT(*) n FROM pedido_traducao WHERE leitor_id = ? AND criado_em > datetime('now', '-30 days')`).get(pessoa.id).n
  if (usados >= plano.pedidosMes) throw new Recusa(`Você já fez os ${plano.pedidosMes} pedidos deste mês.`, 403)
  const id = Number(gutenberg)
  if (!Number.isInteger(id) || id <= 0) throw new Recusa('Escolha um livro da busca.')
  const l = await fichaGutenberg(id)
  if (!l) throw new Recusa('Não achei esse livro no Gutenberg.', 404)
  const a = avaliar(l)
  if (!a.pode) throw new Recusa(`Não dá para pedir este: ${a.problema}.`)
  const fonte = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`
  if (banco.prepare("SELECT 1 FROM fila_traducao WHERE fonte = ? AND estado <> 'erro'").get(fonte)) {
    throw new Recusa('Esse livro já está na fila. Ele aparece no site quando ficar pronto.')
  }
  const r = banco.prepare(`INSERT INTO fila_traducao (titulo, autor, morte, fonte, idioma, pedido_por, prioridade)
      VALUES (?,?,?,?,?,?,?)`).run(a.titulo, a.autor, a.morte, fonte, a.idioma, pessoa.id, plano.prioridade ? 1 : 0)
  banco.prepare('INSERT INTO pedido_traducao (leitor_id, fila_id) VALUES (?, ?)').run(pessoa.id, Number(r.lastInsertRowid))
  return { ok: true, titulo: a.titulo, restam: plano.pedidosMes - usados - 1 }
}

export function meusPedidos(banco, pessoa) {
  return banco.prepare(`SELECT f.titulo, f.autor, f.estado, f.obra_id, p.criado_em
      FROM pedido_traducao p LEFT JOIN fila_traducao f ON f.id = p.fila_id
     WHERE p.leitor_id = ? ORDER BY p.criado_em DESC LIMIT 50`).all(pessoa.id)
}
