// A esteira de tradução, do lado do banco: a fila, o pulso e os pedidos.
//
// A esteira roda na VPS, num container próprio (servidor/esteira-trabalhador.mjs),
// e a fila deste banco (`fila_traducao`) é a única lista de trabalho. Quem
// escreve nela: o painel (livros novos), os assinantes (pedidos) e o
// `--importar` do trabalhador (lotes prontos). Quem lê: o trabalhador, pelas
// funções de fila lá embaixo (promover, proximo, falhou…), e o painel.
//
// O PULSO é o que a esteira está fazendo agora — livro, trechos, últimas
// linhas do log. O trabalhador grava direto na tabela `esteira_pulso` a cada
// ~20 s; o painel lê e diz "parada" quando ele envelhece.
//
// Até 19/09/2026 o pulso também chegava por HTTP (`POST /api/esteira/pulso`,
// com uma chave), da época em que a esteira rodava no PC do dono. A rota saiu
// junto com a esteira do PC: uma porta a menos, e uma chave a menos para guardar.

import { Recusa } from './contas.mjs'
import { avisar } from './gosto.mjs'

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS esteira_pulso (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dados TEXT NOT NULL,
    recebido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
  // prioridade: pedido de assinante Tear passa na frente (ver proximo, abaixo)
  try { banco.exec('ALTER TABLE fila_traducao ADD COLUMN prioridade INTEGER NOT NULL DEFAULT 0') } catch {}
  // As colunas do trabalhador (18/09): o tamanho da fonte decide a ordem, e
  // as tentativas com hora marcada fazem a falha passageira esperar em vez de
  // girar em falso.
  for (const col of ['bytes INTEGER', 'em_trilha INTEGER NOT NULL DEFAULT 0',
    'tentativas INTEGER NOT NULL DEFAULT 0', 'tentar_depois TEXT']) {
    try { banco.exec(`ALTER TABLE fila_traducao ADD COLUMN ${col}`) } catch {}
  }
  banco.exec(`CREATE TABLE IF NOT EXISTS esteira_controle (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pausada INTEGER NOT NULL DEFAULT 0,
    mexido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
}

const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n)
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

// 'ociosa' = fila em dia, esperando livro novo; 'esperando' = o serviço de
// tradução não responde e ela aguarda; 'pausada' = o dono pausou no painel.
const ESTADOS = ['traduzindo', 'publicando', 'instalando', 'medindo', 'ociosa', 'esperando', 'pausada', 'terminou', 'parada']

/** Guarda o pulso, só com os campos conhecidos e com tamanho limitado. */
export function guardarPulso(banco, d) {
  const limpo = {
    estado: ESTADOS.includes(d.estado) ? d.estado : 'traduzindo',
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
  reconciliar(banco)
  const p = banco.prepare(`SELECT dados, recebido_em, CAST((julianday('now') - julianday(recebido_em)) * 86400 AS INTEGER) idade
      FROM esteira_pulso WHERE id = 1`).get()
  const fila = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM fila_traducao GROUP BY estado').all().map((l) => [l.estado, l.n]))
  const pulso = p ? { ...JSON.parse(p.dados), recebidoEm: p.recebido_em, idadeSegundos: p.idade } : null
  // Viva: pulso dos últimos 2 minutos e estado que não é de fim.
  const viva = !!pulso && pulso.idadeSegundos < 120 && !['terminou', 'parada'].includes(pulso.estado)
  return {
    viva, pulso,
    pausada: pausada(banco),
    // Com o trabalhador na VPS o pulso chega pelo banco, sem chave nenhuma;
    // a chave só importa para quem ainda manda pulso por HTTP.
    configurada: true,
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
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'

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

// ─────────────────────────────────────────────────────────────
// A fila, do ponto de vista de quem trabalha nela (esteira-trabalhador.mjs)
//
//   espera ──promover──▶ na_esteira ──(traduz, instala)──▶ pronto
//                            │  ▲
//                     falhou │  │ tentar_depois chegou
//                            ▼  │
//                  na_esteira com hora marcada ──(esgotou)──▶ erro
//
// 'espera' é o que o painel e os pedidos de assinante escrevem: ainda não tem
// obra. 'na_esteira' tem obra e é trabalho. 'erro' só sai daqui pelo painel
// ("tentar de novo"), para um livro com defeito não girar para sempre.
// ─────────────────────────────────────────────────────────────

/**
 * Quanto esperar depois de cada falha, em minutos. Serviço de tradução fora
 * do ar e Gutenberg sobrecarregado passam; a espera cresce para não martelar
 * quem caiu. Esgotada a lista (cerca de 4 dias), vira 'erro'.
 */
export const ESPERAS_MIN = [30, 120, 480, 1440, 4320]

/** Tudo que já tem tradução nossa publicada vira 'pronto', e quem pediu é avisado. */
export function reconciliar(banco) {
  banco.exec(`
    UPDATE fila_traducao SET estado = 'pronto', nota = NULL, tentar_depois = NULL, mexido_em = datetime('now')
     WHERE estado IN ('na_esteira', 'erro') AND obra_id IN (
       SELECT t.obra_id FROM texto t WHERE t.fonte = 'fio_traducao' AND t.normalizado = 1
          AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id))`)
  // Quem pediu a tradução recebe o aviso (chave única: nunca repete).
  for (const f of banco.prepare("SELECT id, titulo, obra_id, pedido_por FROM fila_traducao WHERE estado = 'pronto' AND pedido_por IS NOT NULL AND obra_id IS NOT NULL").all()) {
    avisar(banco, f.pedido_por, { chave: `pedido-pronto-${f.id}`, tipo: 'pronto', titulo: `Pronto para ler: ${f.titulo}`,
      corpo: 'O livro que você pediu foi traduzido e já está no acervo.', link: `/#/obra/${f.obra_id}` })
  }
}

/**
 * Cada 'espera' vira uma OBRA (ficha em trilho B, autor com ano de morte) e
 * passa a 'na_esteira'. Sem a obra a esteira traduziria um texto sem ter onde
 * instalá-lo. Era o `ingestao/fila-do-painel.mjs`, que a máquina do dono
 * rodava por SSH; agora é uma função que o trabalhador chama a cada volta.
 */
export function promover(banco) {
  const esperando = banco.prepare("SELECT * FROM fila_traducao WHERE estado = 'espera' ORDER BY criado_em").all()
  if (!esperando.length) return 0
  const achaPessoa = banco.prepare('SELECT id FROM pessoa WHERE nome = ?')
  const poePessoa = banco.prepare('INSERT INTO pessoa (nome, nome_ordem, morte) VALUES (?,?,?)')
  const poMorte = banco.prepare('UPDATE pessoa SET morte = COALESCE(morte, ?) WHERE id = ?')
  const achaObra = banco.prepare(`
    SELECT o.id FROM obra o JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      JOIN pessoa p ON p.id = op.pessoa_id
     WHERE o.titulo = ? COLLATE NOCASE AND p.nome = ?`)
  const poeObra = banco.prepare(
    "INSERT INTO obra (titulo, titulo_pt, idioma_original, trilho, publicada) VALUES (?,?,?, 'B', 1)")
  const liga = banco.prepare("INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,'autor')")
  const marcar = banco.prepare("UPDATE fila_traducao SET estado = 'na_esteira', obra_id = ?, em_trilha = 1, mexido_em = datetime('now') WHERE id = ?")
  banco.exec('BEGIN')
  try {
    for (const f of esperando) {
      let obraId = achaObra.get(f.titulo, f.autor)?.id
      if (!obraId) {
        const pessoa = achaPessoa.get(f.autor)
          ?? { id: Number(poePessoa.run(f.autor, f.autor, f.morte).lastInsertRowid) }
        if (f.morte) poMorte.run(f.morte, pessoa.id)
        obraId = Number(poeObra.run(f.titulo, f.titulo, f.idioma).lastInsertRowid)
        liga.run(obraId, pessoa.id)
      }
      marcar.run(obraId, f.id)
    }
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  return esperando.length
}

/**
 * O próximo livro: pedido de assinante primeiro, depois do MENOR para o maior
 * (vinte livros curtos prontos hoje valem mais que um Guerra e Paz a caminho,
 * e livro curto que falha revela o defeito cedo), e no empate o que está em
 * prateleira. Livro que falhou só volta quando a hora marcada chega.
 */
export function proximo(banco) {
  return banco.prepare(`
    SELECT * FROM fila_traducao
     WHERE estado = 'na_esteira' AND obra_id IS NOT NULL
       AND (tentar_depois IS NULL OR tentar_depois <= datetime('now'))
     ORDER BY prioridade DESC, COALESCE(bytes, 9000000000) ASC, em_trilha DESC, id
     LIMIT 1`).get() ?? null
}

/** Os que ainda não têm tamanho medido (o trabalhador pergunta com um HEAD). */
export const semTamanho = (banco, n = 40) => banco.prepare(
  "SELECT id, fonte FROM fila_traducao WHERE estado = 'na_esteira' AND bytes IS NULL LIMIT ?").all(n)

export function guardarTamanho(banco, id, bytes) {
  banco.prepare('UPDATE fila_traducao SET bytes = ? WHERE id = ?').run(bytes, id)
}

/**
 * Anota uma falha. `permanente` é para o que não melhora esperando — a fonte
 * que não é livro, o endereço que não existe —, que vai direto para 'erro'.
 * @returns o estado em que o item ficou e, se volta, quando
 */
export function falhou(banco, id, erro, { permanente = false } = {}) {
  const item = banco.prepare('SELECT tentativas FROM fila_traducao WHERE id = ?').get(id)
  if (!item) return null
  const tentativas = item.tentativas + 1
  const nota = String(erro ?? 'sem mensagem').slice(0, 300)
  if (permanente || tentativas > ESPERAS_MIN.length) {
    banco.prepare(`UPDATE fila_traducao SET estado = 'erro', tentativas = ?, nota = ?, tentar_depois = NULL,
        mexido_em = datetime('now') WHERE id = ?`).run(tentativas, nota, id)
    return { estado: 'erro', tentativas }
  }
  const espera = ESPERAS_MIN[tentativas - 1]
  banco.prepare(`UPDATE fila_traducao SET tentativas = ?, nota = ?, tentar_depois = datetime('now', ?),
      mexido_em = datetime('now') WHERE id = ?`).run(tentativas, nota, `+${espera} minutes`, id)
  return { estado: 'na_esteira', tentativas, esperaMin: espera }
}

export function marcarPronto(banco, id) {
  banco.prepare(`UPDATE fila_traducao SET estado = 'pronto', nota = NULL, tentar_depois = NULL,
      mexido_em = datetime('now') WHERE id = ?`).run(id)
}

/** "Tentar de novo", do painel: o 'erro' volta para a fila, do zero. */
export function retentar(banco, id) {
  return banco.prepare(`UPDATE fila_traducao
      SET estado = CASE WHEN obra_id IS NULL THEN 'espera' ELSE 'na_esteira' END,
          tentativas = 0, tentar_depois = NULL, nota = NULL, mexido_em = datetime('now')
    WHERE id = ? AND estado = 'erro'`).run(Number(id)).changes
}

export const pausada = (banco) =>
  banco.prepare('SELECT pausada FROM esteira_controle WHERE id = 1').get()?.pausada === 1

export function pausar(banco, sim) {
  banco.prepare(`INSERT INTO esteira_controle (id, pausada, mexido_em) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET pausada = excluded.pausada, mexido_em = excluded.mexido_em`).run(sim ? 1 : 0)
}

/** Quantos já foram e quantos faltam — o "plano inteiro" do painel. */
export function contagem(banco) {
  const n = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM fila_traducao GROUP BY estado').all()
    .map((l) => [l.estado, l.n]))
  const total = (n.espera ?? 0) + (n.na_esteira ?? 0) + (n.pronto ?? 0) + (n.erro ?? 0)
  return { total, traduzidos: n.pronto ?? 0, faltam: (n.espera ?? 0) + (n.na_esteira ?? 0), erro: n.erro ?? 0 }
}

const mesmoTitulo = (a, b) => {
  const s = (x) => String(x ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return s(a) !== '' && s(a) === s(b)
}

/**
 * Traz para a fila o plano antigo da máquina do dono (`esteira.json`).
 *
 * Cada linha já aponta para uma obra (`obra`). Ela só entra se essa obra
 * existir AQUI com o mesmo título: os ids do plano saíram de um banco, e uma
 * linha que apontasse para a obra errada instalaria um livro na ficha de
 * outro — em silêncio, que é o pior jeito.
 */
export function importarPlano(banco, plano) {
  const obra = banco.prepare('SELECT id, titulo, titulo_pt FROM obra WHERE id = ?')
  const jaNaFila = banco.prepare("SELECT 1 FROM fila_traducao WHERE obra_id = ? OR (fonte = ? AND estado <> 'erro')")
  const poe = banco.prepare(`INSERT INTO fila_traducao (titulo, autor, morte, fonte, idioma, estado, obra_id, prioridade, em_trilha)
      VALUES (?,?,?,?,?, 'na_esteira', ?,?,?)`)
  const soFonte = banco.prepare("SELECT 1 FROM fila_traducao WHERE fonte = ? AND estado <> 'erro'")
  const esperando = banco.prepare(`INSERT INTO fila_traducao (titulo, autor, morte, fonte, idioma, estado, prioridade)
      VALUES (?,?,?,?,?, 'espera', ?)`)
  const r = { entraram: 0, jaEstavam: 0, recusados: [] }
  banco.exec('BEGIN')
  try {
    for (const l of plano) {
      const fonteOk = /^https:\/\/(www\.)?gutenberg\.(org|net\.au)\//.test(String(l.fonte))
      // Linha SEM obra (o formato de lote-populares.mjs e do painel): entra
      // como 'espera', e a esteira cria a obra ao promover.
      if (l.obra == null) {
        const titulo = String(l.titulo ?? '').trim().slice(0, 300), autor = String(l.autor ?? '').trim().slice(0, 200)
        if (!titulo || !autor) { r.recusados.push({ titulo: l.titulo, porque: 'sem título ou autor' }); continue }
        if (!fonteOk) { r.recusados.push({ titulo, porque: 'fonte fora do Gutenberg' }); continue }
        if (soFonte.get(l.fonte)) { r.jaEstavam++; continue }
        esperando.run(titulo, autor, Number.isInteger(l.morte) ? l.morte : null, l.fonte,
          String(l.de ?? l.idioma ?? 'en').slice(0, 5), Number(l.prioridade) || 0)
        r.entraram++
        continue
      }
      const o = obra.get(Number(l.obra))
      if (!o) { r.recusados.push({ obra: l.obra, titulo: l.titulo, porque: 'obra não existe aqui' }); continue }
      if (!mesmoTitulo(o.titulo, l.titulo) && !mesmoTitulo(o.titulo_pt, l.titulo)) {
        r.recusados.push({ obra: l.obra, titulo: l.titulo, porque: `aqui a obra ${o.id} é "${o.titulo_pt ?? o.titulo}"` }); continue
      }
      if (!/^https:\/\/(www\.)?gutenberg\.(org|net\.au)\//.test(String(l.fonte))) {
        r.recusados.push({ obra: l.obra, titulo: l.titulo, porque: 'fonte fora do Gutenberg' }); continue
      }
      if (jaNaFila.get(o.id, l.fonte)) { r.jaEstavam++; continue }
      poe.run(String(l.titulo).slice(0, 300), String(l.autor ?? '?').slice(0, 200), Number.isInteger(l.morte) ? l.morte : null,
        l.fonte, String(l.de ?? 'en').slice(0, 5), o.id, Number(l.prioridade) || 0, Number(l.emTrilha) || 0)
      r.entraram++
    }
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  reconciliar(banco)
  return r
}
