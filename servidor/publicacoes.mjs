// Publicações: livros e quadrinhos escritos e desenhados por quem tem conta.
//
// ─────────────────────────────────────────────────────────────
// AS REGRAS, EM ORDEM DE IMPORTÂNCIA
//
// 1. **Só publica quem tem plano Trama ou Tear** (`planos.mjs`), e dentro dos
//    limites do plano: obras, capítulos, páginas, caracteres e espaço. O
//    limite é conferido AQUI, no servidor, a cada escrita.
//
// 2. **Nada aparece sem passar pela administração.** Obra nova, capítulo novo,
//    capítulo editado e capa trocada entram em revisão. Enquanto isso só o
//    autor e a administração enxergam — inclusive os arquivos de imagem, que
//    também conferem permissão (ver `podeVerArquivo`). Conta de admin publica
//    direto.
//
// 3. **A obra tem que ser do autor.** Ao enviar, a pessoa declara que é autora
//    ou tem autorização. Publicação de mangá alheio é pirataria, e com
//    assinatura paga seria pirataria com fim de lucro (Código Penal, art. 184,
//    §1º). A revisão prévia, a denúncia e a suspensão automática existem por
//    isso.
//
// 4. **Nada sai do ar sozinho** (decisão do dono, 17/09). Denúncia vai para a
//    fila do painel, edição de capítulo publicado espera aprovação com a versão
//    antiga no ar, e só a administração suspende.
//
// 5. **Imagem só passa limpa** (`imagem.mjs`) e é guardada FORA do site, com
//    nome sorteado — nunca o nome que veio do navegador.
// ─────────────────────────────────────────────────────────────

import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync, createReadStream, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { RAIZ } from './banco/base.mjs'
import { Recusa } from './contas.mjs'
import { planoDe } from './planos.mjs'
import { limparImagem, ImagemRecusada } from './imagem.mjs'
import { avisar } from './gosto.mjs'

export const PASTA = process.env.FIO_PUBLICACOES
  || join(dirname(process.env.FIO_BANCO || join(RAIZ, 'dados', 'catalogo.db')), 'publicacoes')

// ── as listas fechadas: é delas que os filtros saem ──

export const TIPOS = { livro: 'Livro', quadrinho: 'Quadrinho' }

export const FORMATOS = {
  livro: { romance: 'Romance', novela: 'Novela', contos: 'Contos', poesia: 'Poesia', cronicas: 'Crônicas',
    ensaio: 'Ensaio', light_novel: 'Light novel', web_novel: 'Web novel', nao_ficcao: 'Não ficção' },
  quadrinho: { manga: 'Mangá', manhwa: 'Manhwa', manhua: 'Manhua', hq: 'HQ', webtoon: 'Webtoon', tirinha: 'Tirinha' },
}

export const GENEROS = {
  acao: 'Ação', aventura: 'Aventura', comedia: 'Comédia', drama: 'Drama', fantasia: 'Fantasia',
  ficcao_cientifica: 'Ficção científica', terror: 'Terror', misterio: 'Mistério', suspense: 'Suspense',
  romance: 'Romance', psicologico: 'Psicológico', sobrenatural: 'Sobrenatural', cotidiano: 'Cotidiano',
  esporte: 'Esporte', historico: 'Histórico', distopia: 'Distopia', isekai: 'Isekai',
  progressao: 'Progressão / RPG', artes_marciais: 'Artes marciais', mecha: 'Mecha', policial: 'Policial',
  politica: 'Política e poder', filosofia: 'Filosofia', direito: 'Direito', biografia: 'Biografia',
  infantojuvenil: 'Infantojuvenil', humor: 'Humor', poesia: 'Poesia',
}

export const CLASSIFICACOES = { livre: 'Livre', 10: '10+', 12: '12+', 14: '14+', 16: '16+', 18: '18+' }
const ORDEM_CLASS = ['livre', '10', '12', '14', '16', '18']

export const MOTIVOS_DENUNCIA = {
  direitos: 'Não é do autor (direitos autorais)',
  sexual: 'Conteúdo sexual',
  odio: 'Ódio ou assédio',
  violencia: 'Violência extrema',
  menor: 'Classificação errada',
  spam: 'Spam ou propaganda',
  outro: 'Outro',
}

const TETO_CAPA = 3 * 1024 * 1024
const TETO_PAGINA = 5 * 1024 * 1024
export const TETO_UPLOAD = TETO_PAGINA
const POR_PAGINA = 24

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS publicacao (
      id            INTEGER PRIMARY KEY,
      autor_id      INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      tipo          TEXT NOT NULL CHECK (tipo IN ('livro','quadrinho')),
      formato       TEXT NOT NULL,
      titulo        TEXT NOT NULL,
      sinopse       TEXT NOT NULL DEFAULT '',
      generos       TEXT NOT NULL DEFAULT '[]',
      classificacao TEXT NOT NULL DEFAULT 'livre',
      cor           TEXT CHECK (cor IN ('colorido','pb')),
      sentido       TEXT NOT NULL DEFAULT 'ltr' CHECK (sentido IN ('ltr','rtl')),
      status_obra   TEXT NOT NULL DEFAULT 'andamento' CHECK (status_obra IN ('andamento','completa','hiato')),
      estado        TEXT NOT NULL DEFAULT 'rascunho'
                    CHECK (estado IN ('rascunho','revisao','publicada','recusada','suspensa')),
      motivo        TEXT,
      capa          TEXT,
      capa_pendente TEXT,
      declarou_autoria TEXT,
      leituras      INTEGER NOT NULL DEFAULT 0,
      criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
      atualizada_em TEXT NOT NULL DEFAULT (datetime('now')),
      publicada_em  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pub_estado ON publicacao(estado, atualizada_em DESC);
    CREATE INDEX IF NOT EXISTS idx_pub_autor ON publicacao(autor_id);

    CREATE TABLE IF NOT EXISTS publicacao_parte (
      id             INTEGER PRIMARY KEY,
      publicacao_id  INTEGER NOT NULL REFERENCES publicacao(id) ON DELETE CASCADE,
      ordem          INTEGER NOT NULL,
      titulo         TEXT NOT NULL,
      texto          TEXT,
      paginas        TEXT NOT NULL DEFAULT '[]',
      palavras       INTEGER NOT NULL DEFAULT 0,
      estado         TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','revisao','publicada','recusada')),
      motivo         TEXT,
      leituras       INTEGER NOT NULL DEFAULT 0,
      criada_em      TEXT NOT NULL DEFAULT (datetime('now')),
      atualizada_em  TEXT NOT NULL DEFAULT (datetime('now')),
      publicada_em   TEXT,
      UNIQUE (publicacao_id, ordem)
    );

    CREATE TABLE IF NOT EXISTS publicacao_arquivo (
      id            TEXT PRIMARY KEY,
      dono_id       INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
      publicacao_id INTEGER NOT NULL REFERENCES publicacao(id) ON DELETE CASCADE,
      parte_id      INTEGER REFERENCES publicacao_parte(id) ON DELETE CASCADE,
      uso           TEXT NOT NULL CHECK (uso IN ('capa','pagina')),
      mime          TEXT NOT NULL,
      extensao      TEXT NOT NULL,
      bytes         INTEGER NOT NULL,
      largura       INTEGER NOT NULL,
      altura        INTEGER NOT NULL,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pubarq_dono ON publicacao_arquivo(dono_id);

    CREATE TABLE IF NOT EXISTS publicacao_denuncia (
      id            INTEGER PRIMARY KEY,
      publicacao_id INTEGER NOT NULL REFERENCES publicacao(id) ON DELETE CASCADE,
      leitor_id     INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
      motivo        TEXT NOT NULL,
      detalhe       TEXT,
      criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
      resolvida_em  TEXT,
      UNIQUE (publicacao_id, leitor_id)
    );`)
  // 17/09: edição de capítulo já publicado não tira o capítulo do ar. A versão
  // nova espera aqui ('rascunho' salvo, 'revisao' enviado) e a publicada segue.
  for (const col of ['titulo_pendente TEXT', 'texto_pendente TEXT', 'paginas_pendente TEXT', 'pendente TEXT']) {
    try { banco.exec(`ALTER TABLE publicacao_parte ADD COLUMN ${col}`) } catch {}
  }
  mkdirSync(PASTA, { recursive: true })
}

// ─────────────────────────────────────────────────────────────
// utilidades
// ─────────────────────────────────────────────────────────────

const texto = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
const linha = (v, max) => texto(v, max).replace(/\s+/g, ' ')
const urlArquivo = (a) => (a ? `/api/pub-arquivo/${a}` : null)
const nomeArquivo = (row) => `${row.id}.${row.extensao}`
const caminhoArquivo = (nome) => join(PASTA, nome)
const ehAdmin = (p) => p?.papel === 'admin'
const contar = (s) => (s.match(/\S+/g) ?? []).length

function limitesDe(banco, pessoa) {
  const plano = planoDe(banco, pessoa)
  if (!plano.publicar) {
    throw new Recusa(`Publicar faz parte dos planos Trama e Tear. O seu plano hoje é ${plano.nome}.`, 403)
  }
  return plano.publicar
}

function minhaObra(banco, pessoa, id) {
  const o = banco.prepare('SELECT * FROM publicacao WHERE id = ?').get(Number(id))
  if (!o || (o.autor_id !== pessoa.id && !ehAdmin(pessoa))) throw new Recusa('Publicação não encontrada.', 404)
  return o
}

function apagarArquivos(banco, where, ...args) {
  const linhas = banco.prepare(`SELECT id, extensao FROM publicacao_arquivo WHERE ${where}`).all(...args)
  for (const l of linhas) { try { unlinkSync(caminhoArquivo(nomeArquivo(l))) } catch {} }
  banco.prepare(`DELETE FROM publicacao_arquivo WHERE ${where}`).run(...args)
  return linhas.length
}

const usoDe = (banco, donoId) =>
  banco.prepare('SELECT COALESCE(SUM(bytes),0) n FROM publicacao_arquivo WHERE dono_id = ?').get(donoId).n

/** Arquivo de capa pelo nome gravado em `publicacao.capa` ("<hex>.<ext>"). */
const idDoNome = (nome) => String(nome ?? '').split('.')[0]

// ─────────────────────────────────────────────────────────────
// o estúdio do autor
// ─────────────────────────────────────────────────────────────

export function minhas(banco, pessoa) {
  const plano = planoDe(banco, pessoa)
  const obras = banco.prepare(`
    SELECT p.id, p.tipo, p.formato, p.titulo, p.estado, p.motivo, p.capa, p.capa_pendente, p.leituras,
           p.atualizada_em, p.publicada_em,
           (SELECT COUNT(*) FROM publicacao_parte x WHERE x.publicacao_id = p.id) partes,
           (SELECT COUNT(*) FROM publicacao_parte x WHERE x.publicacao_id = p.id AND x.estado = 'publicada') partes_publicadas,
           (SELECT COUNT(*) FROM publicacao_denuncia d WHERE d.publicacao_id = p.id AND d.resolvida_em IS NULL) denuncias
      FROM publicacao p WHERE p.autor_id = ? ORDER BY p.atualizada_em DESC`).all(pessoa.id)
  return {
    plano: { chave: plano.chave, nome: plano.nome, limites: plano.publicar },
    uso: { obras: obras.length, bytes: usoDe(banco, pessoa.id) },
    obras: obras.map((o) => ({ ...o, capa: urlArquivo(o.capa), capa_pendente: urlArquivo(o.capa_pendente) })),
    opcoes: opcoes(),
  }
}

export const opcoes = () => ({ tipos: TIPOS, formatos: FORMATOS, generos: GENEROS, classificacoes: CLASSIFICACOES, motivos: MOTIVOS_DENUNCIA })

/** Criar ou editar os dados de uma obra (não os capítulos, não a capa). */
export function salvarObra(banco, pessoa, dado) {
  const lim = limitesDe(banco, pessoa)
  const tipo = dado.tipo === 'quadrinho' ? 'quadrinho' : dado.tipo === 'livro' ? 'livro' : null
  const existente = dado.id ? minhaObra(banco, pessoa, dado.id) : null
  const t = existente?.tipo ?? tipo
  if (!t) throw new Recusa('Escolha se é livro ou quadrinho.')
  const titulo = linha(dado.titulo, 120)
  if (titulo.length < 2) throw new Recusa('Dê um título à obra.')
  const formato = String(dado.formato ?? '')
  if (!FORMATOS[t][formato]) throw new Recusa('Escolha o formato.')
  const generos = [...new Set((Array.isArray(dado.generos) ? dado.generos : []).map(String))].filter((g) => GENEROS[g])
  if (!generos.length) throw new Recusa('Escolha ao menos um gênero — é por eles que a obra aparece nos filtros.')
  if (generos.length > 4) throw new Recusa('No máximo 4 gêneros.')
  const classificacao = String(dado.classificacao ?? '')
  if (!CLASSIFICACOES[classificacao]) throw new Recusa('Escolha a classificação indicativa.')
  const sinopse = texto(dado.sinopse, 2000)
  if (sinopse.length < 20) throw new Recusa('Escreva uma sinopse (ao menos uma frase).')
  const cor = t === 'quadrinho' ? (dado.cor === 'pb' ? 'pb' : 'colorido') : null
  const sentido = t === 'quadrinho' && dado.sentido === 'rtl' ? 'rtl' : 'ltr'
  const statusObra = ['andamento', 'completa', 'hiato'].includes(dado.status_obra) ? dado.status_obra : 'andamento'
  if (dado.autoria !== true) {
    throw new Recusa('Confirme que a obra é sua (ou que você tem autorização por escrito do autor para publicá-la).')
  }
  const declaracao = `${new Date().toISOString()} · ${pessoa.usuario}`

  if (existente) {
    if (existente.estado === 'suspensa' && !ehAdmin(pessoa)) throw new Recusa('Esta obra está suspensa. Fale com a administração.', 403)
    banco.prepare(`UPDATE publicacao SET formato=?, titulo=?, sinopse=?, generos=?, classificacao=?, cor=?, sentido=?,
        status_obra=?, declarou_autoria=?, atualizada_em=datetime('now') WHERE id = ?`)
      .run(formato, titulo, sinopse, JSON.stringify(generos), classificacao, cor, sentido, statusObra, declaracao, existente.id)
    return { ok: true, id: existente.id }
  }
  const n = banco.prepare('SELECT COUNT(*) n FROM publicacao WHERE autor_id = ?').get(pessoa.id).n
  if (n >= lim.obras) throw new Recusa(`O seu plano permite ${lim.obras} obras. Apague uma ou mude de plano.`, 403)
  const r = banco.prepare(`INSERT INTO publicacao (autor_id, tipo, formato, titulo, sinopse, generos, classificacao, cor, sentido, status_obra, declarou_autoria)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(pessoa.id, t, formato, titulo, sinopse, JSON.stringify(generos), classificacao, cor, sentido, statusObra, declaracao)
  return { ok: true, id: Number(r.lastInsertRowid) }
}

export function apagarObra(banco, pessoa, id) {
  const o = minhaObra(banco, pessoa, id)
  apagarArquivos(banco, 'publicacao_id = ?', o.id)
  banco.prepare('DELETE FROM publicacao WHERE id = ?').run(o.id)
  return { ok: true }
}

/**
 * Recebe uma imagem (capa ou página). A página nasce solta e só se prende a
 * um capítulo quando o capítulo é salvo; solta por mais de 6 horas, a faxina
 * leva.
 */
export function receberImagem(banco, pessoa, { id, uso }, bytes) {
  const lim = limitesDe(banco, pessoa)
  const o = minhaObra(banco, pessoa, id)
  if (o.estado === 'suspensa' && !ehAdmin(pessoa)) throw new Recusa('Esta obra está suspensa.', 403)
  if (uso !== 'capa' && uso !== 'pagina') throw new Recusa('Uso da imagem desconhecido.')
  if (uso === 'pagina' && o.tipo !== 'quadrinho') throw new Recusa('Livro não tem página de imagem.')

  let img
  try { img = limparImagem(bytes, { teto: uso === 'capa' ? TETO_CAPA : TETO_PAGINA }) }
  catch (e) { if (e instanceof ImagemRecusada) throw new Recusa(e.message, 415); throw e }

  if (usoDe(banco, pessoa.id) + img.bytes.length > lim.armazenamento) {
    throw new Recusa(`O espaço do seu plano (${Math.round(lim.armazenamento / 1024 / 1024)} MB) acabou.`, 403)
  }
  if (uso === 'capa') {
    const prop = img.altura / img.largura
    if (img.largura < 300 || prop < 1.1 || prop > 1.8) {
      throw new Recusa('A capa precisa ser em pé (proporção perto de 2:3) e ter ao menos 300 px de largura.')
    }
  }

  const arquivo = randomBytes(16).toString('hex')
  const nome = `${arquivo}.${img.extensao}`
  // `wx`: nunca escreve por cima de nada (colisão de 128 bits não acontece,
  // mas se acontecer, falha em vez de trocar a imagem de outra pessoa).
  writeFileSync(caminhoArquivo(nome), img.bytes, { flag: 'wx', mode: 0o640 })
  banco.prepare(`INSERT INTO publicacao_arquivo (id, dono_id, publicacao_id, uso, mime, extensao, bytes, largura, altura)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(arquivo, o.autor_id, o.id, uso, img.mime, img.extensao, img.bytes.length, img.largura, img.altura)

  if (uso === 'capa') {
    // Obra ainda não publicada (ou quem troca é admin): a capa vale já.
    // Obra publicada: a capa nova espera a revisão, e a antiga continua.
    const direto = o.estado !== 'publicada' || ehAdmin(pessoa)
    const campo = direto ? 'capa' : 'capa_pendente'
    const velho = o[campo]
    if (velho) apagarArquivos(banco, 'id = ?', idDoNome(velho))
    if (direto && o.capa_pendente) { apagarArquivos(banco, 'id = ?', idDoNome(o.capa_pendente)); banco.prepare('UPDATE publicacao SET capa_pendente = NULL WHERE id = ?').run(o.id) }
    banco.prepare(`UPDATE publicacao SET ${campo} = ?, atualizada_em = datetime('now') WHERE id = ?`).run(nome, o.id)
    return { ok: true, arquivo: nome, url: urlArquivo(nome), pendente: !direto, largura: img.largura, altura: img.altura }
  }
  return { ok: true, arquivo: nome, url: urlArquivo(nome), largura: img.largura, altura: img.altura }
}

/** Criar ou editar um capítulo. Toda escrita devolve o capítulo a rascunho. */
export function salvarParte(banco, pessoa, dado) {
  const lim = limitesDe(banco, pessoa)
  const o = minhaObra(banco, pessoa, dado.publicacao)
  if (o.estado === 'suspensa' && !ehAdmin(pessoa)) throw new Recusa('Esta obra está suspensa.', 403)
  const titulo = linha(dado.titulo, 120)
  if (!titulo) throw new Recusa('Dê um título ao capítulo.')
  const existente = dado.id
    ? banco.prepare('SELECT * FROM publicacao_parte WHERE id = ? AND publicacao_id = ?').get(Number(dado.id), o.id)
    : null
  if (dado.id && !existente) throw new Recusa('Capítulo não encontrado.', 404)

  let corpo = null, paginas = [], palavras = 0
  if (o.tipo === 'livro') {
    corpo = texto(dado.texto, lim.caracteresPorParte + 1)
    if (corpo.length > lim.caracteresPorParte) throw new Recusa(`Capítulo longo demais: até ${lim.caracteresPorParte.toLocaleString('pt-BR')} caracteres. Divida em dois.`)
    if (corpo.length < 50) throw new Recusa('O capítulo está vazio (ou curto demais).')
    palavras = contar(corpo)
  } else {
    const pedidas = Array.isArray(dado.paginas) ? dado.paginas.map(String) : []
    if (!pedidas.length) throw new Recusa('Envie ao menos uma página.')
    if (pedidas.length > lim.paginasPorParte) throw new Recusa(`Até ${lim.paginasPorParte} páginas por capítulo no seu plano.`)
    if (new Set(pedidas).size !== pedidas.length) throw new Recusa('Página repetida no capítulo.')
    const conf = banco.prepare(`SELECT id, extensao FROM publicacao_arquivo
        WHERE id = ? AND publicacao_id = ? AND uso = 'pagina' AND (parte_id IS NULL OR parte_id = ?)`)
    for (const nome of pedidas) {
      const a = /^[0-9a-f]{32}\.(jpg|png|webp)$/.test(nome) ? conf.get(idDoNome(nome), o.id, existente?.id ?? -1) : null
      if (!a || nomeArquivo(a) !== nome) throw new Recusa('Uma das páginas não pertence a esta obra. Envie de novo.')
    }
    paginas = pedidas
  }

  let parteId
  if (existente && existente.estado === 'publicada' && !ehAdmin(pessoa)) {
    // Capítulo no ar: a edição fica pendente e o leitor continua vendo a
    // versão aprovada até a administração decidir.
    banco.prepare(`UPDATE publicacao_parte SET titulo_pendente=?, texto_pendente=?, paginas_pendente=?, pendente='rascunho',
        motivo=NULL, atualizada_em=datetime('now') WHERE id = ?`).run(titulo, corpo, JSON.stringify(paginas), existente.id)
    if (o.tipo === 'quadrinho') {
      const prende = banco.prepare('UPDATE publicacao_arquivo SET parte_id = ? WHERE id = ?')
      for (const nome of paginas) prende.run(existente.id, idDoNome(nome))
    }
    banco.prepare("UPDATE publicacao SET atualizada_em = datetime('now') WHERE id = ?").run(o.id)
    return { ok: true, id: existente.id, pendente: true }
  }
  if (existente) {
    banco.prepare(`UPDATE publicacao_parte SET titulo=?, texto=?, paginas=?, palavras=?, estado=CASE WHEN estado='publicada' THEN 'publicada' ELSE 'rascunho' END,
        motivo=NULL, atualizada_em=datetime('now') WHERE id = ?`).run(titulo, corpo, JSON.stringify(paginas), palavras, existente.id)
    parteId = existente.id
  } else {
    const n = banco.prepare('SELECT COUNT(*) n, COALESCE(MAX(ordem),0) m FROM publicacao_parte WHERE publicacao_id = ?').get(o.id)
    if (n.n >= lim.partesPorObra) throw new Recusa(`O seu plano permite ${lim.partesPorObra} capítulos por obra.`, 403)
    const r = banco.prepare(`INSERT INTO publicacao_parte (publicacao_id, ordem, titulo, texto, paginas, palavras) VALUES (?,?,?,?,?,?)`)
      .run(o.id, n.m + 1, titulo, corpo, JSON.stringify(paginas), palavras)
    parteId = Number(r.lastInsertRowid)
  }
  if (o.tipo === 'quadrinho') {
    const ids = paginas.map(idDoNome)
    // as páginas que saíram do capítulo vão embora de vez
    const antigas = banco.prepare('SELECT id FROM publicacao_arquivo WHERE parte_id = ?').all(parteId).map((a) => a.id)
    for (const velho of antigas.filter((a) => !ids.includes(a))) apagarArquivos(banco, 'id = ?', velho)
    const prende = banco.prepare('UPDATE publicacao_arquivo SET parte_id = ? WHERE id = ?')
    for (const id of ids) prende.run(parteId, id)
  }
  banco.prepare("UPDATE publicacao SET atualizada_em = datetime('now') WHERE id = ?").run(o.id)
  return { ok: true, id: parteId }
}

export function apagarParte(banco, pessoa, { publicacao, id }) {
  const o = minhaObra(banco, pessoa, publicacao)
  const p = banco.prepare('SELECT id FROM publicacao_parte WHERE id = ? AND publicacao_id = ?').get(Number(id), o.id)
  if (!p) throw new Recusa('Capítulo não encontrado.', 404)
  apagarArquivos(banco, 'parte_id = ?', p.id)
  banco.prepare('DELETE FROM publicacao_parte WHERE id = ?').run(p.id)
  // refaz a numeração para não ficar buraco (1, 2, 4…)
  const resto = banco.prepare('SELECT id FROM publicacao_parte WHERE publicacao_id = ? ORDER BY ordem').all(o.id)
  const mover = banco.prepare('UPDATE publicacao_parte SET ordem = ? WHERE id = ?')
  resto.forEach((r, i) => mover.run(-(i + 1), r.id))
  resto.forEach((r, i) => mover.run(i + 1, r.id))
  return { ok: true }
}

/** Mandar para a revisão: a obra (se ainda não publicada) e os capítulos em rascunho. */
export function enviar(banco, pessoa, { id }) {
  limitesDe(banco, pessoa)
  const o = minhaObra(banco, pessoa, id)
  if (o.estado === 'suspensa' && !ehAdmin(pessoa)) throw new Recusa('Esta obra está suspensa.', 403)
  if (!o.capa) throw new Recusa('Envie a capa antes.')
  const partes = banco.prepare("SELECT COUNT(*) n FROM publicacao_parte WHERE publicacao_id = ? AND (estado IN ('rascunho','recusada') OR pendente = 'rascunho')").get(o.id).n
  if (o.estado === 'publicada' && !partes && !o.capa_pendente) throw new Recusa('Não há nada novo para enviar.')
  if (o.estado !== 'publicada' && !banco.prepare('SELECT 1 FROM publicacao_parte WHERE publicacao_id = ?').get(o.id)) {
    throw new Recusa('Escreva ao menos um capítulo antes de enviar.')
  }

  if (ehAdmin(pessoa)) {
    for (const x of banco.prepare("SELECT id FROM publicacao_parte WHERE publicacao_id = ? AND pendente IS NOT NULL").all(o.id)) aplicarPendente(banco, x.id)
    for (const x of banco.prepare("SELECT ordem, titulo FROM publicacao_parte WHERE publicacao_id = ? AND estado <> 'publicada'").all(o.id)) avisarSeguidores(banco, o.id, x.ordem, x.titulo, o.titulo)
    banco.prepare(`UPDATE publicacao_parte SET estado='publicada', motivo=NULL, publicada_em=COALESCE(publicada_em, datetime('now'))
        WHERE publicacao_id = ? AND estado <> 'publicada'`).run(o.id)
    banco.prepare(`UPDATE publicacao SET estado='publicada', motivo=NULL, publicada_em=COALESCE(publicada_em, datetime('now')),
        atualizada_em=datetime('now') WHERE id = ?`).run(o.id)
    return { ok: true, estado: 'publicada' }
  }
  banco.prepare("UPDATE publicacao_parte SET estado='revisao', motivo=NULL WHERE publicacao_id = ? AND estado IN ('rascunho','recusada')").run(o.id)
  banco.prepare("UPDATE publicacao_parte SET pendente='revisao' WHERE publicacao_id = ? AND pendente = 'rascunho'").run(o.id)
  if (o.estado !== 'publicada') banco.prepare("UPDATE publicacao SET estado='revisao', motivo=NULL, atualizada_em=datetime('now') WHERE id = ?").run(o.id)
  for (const adm of banco.prepare("SELECT id FROM leitor WHERE papel = 'admin' AND desativado = 0").all()) {
    avisar(banco, adm.id, { chave: `revisar-${o.id}-${Date.now()}`, tipo: 'revisao', titulo: `Publicação para revisar: ${o.titulo}`,
      corpo: `Enviada por ${pessoa.usuario}.`, link: '/admin.html' })
  }
  return { ok: true, estado: o.estado === 'publicada' ? 'publicada' : 'revisao' }
}

// ─────────────────────────────────────────────────────────────
// ler: a vitrine pública
// ─────────────────────────────────────────────────────────────

const cartao = (o) => ({
  id: o.id, tipo: o.tipo, formato: o.formato, formatoNome: FORMATOS[o.tipo]?.[o.formato] ?? o.formato,
  titulo: o.titulo, sinopse: o.sinopse, autor: { usuario: o.usuario, nome: o.nome },
  generos: JSON.parse(o.generos).map((g) => ({ chave: g, nome: GENEROS[g] ?? g })),
  classificacao: o.classificacao, cor: o.cor, sentido: o.sentido, status: o.status_obra,
  capa: urlArquivo(o.capa), partes: o.partes, leituras: o.leituras,
  publicadaEm: o.publicada_em, atualizadaEm: o.ultima ?? o.atualizada_em,
})

export function listar(banco, pessoa, busca) {
  const onde = ["p.estado = 'publicada'", "EXISTS (SELECT 1 FROM publicacao_parte x WHERE x.publicacao_id = p.id AND x.estado = 'publicada')"]
  const args = []
  const tipo = busca.get('tipo')
  if (TIPOS[tipo]) { onde.push('p.tipo = ?'); args.push(tipo) }
  const formato = busca.get('formato')
  if (formato && (FORMATOS.livro[formato] || FORMATOS.quadrinho[formato])) { onde.push('p.formato = ?'); args.push(formato) }
  const genero = busca.get('genero')
  if (GENEROS[genero]) { onde.push('EXISTS (SELECT 1 FROM json_each(p.generos) g WHERE g.value = ?)'); args.push(genero) }
  const cor = busca.get('cor')
  if (cor === 'colorido' || cor === 'pb') { onde.push('p.cor = ?'); args.push(cor) }
  const status = busca.get('status')
  if (['andamento', 'completa', 'hiato'].includes(status)) { onde.push('p.status_obra = ?'); args.push(status) }
  // Classificação: "até" a escolhida. Sem conta, nunca passa de 16.
  let ate = ORDEM_CLASS.indexOf(busca.get('classificacao') ?? '18')
  if (ate < 0) ate = ORDEM_CLASS.length - 1
  if (!pessoa) ate = Math.min(ate, ORDEM_CLASS.indexOf('16'))
  onde.push(`p.classificacao IN (${ORDEM_CLASS.slice(0, ate + 1).map(() => '?').join(',')})`)
  args.push(...ORDEM_CLASS.slice(0, ate + 1))
  if (busca.get('seguindo') === '1' && pessoa) {
    onde.push('EXISTS (SELECT 1 FROM publicacao_seguidor f WHERE f.publicacao_id = p.id AND f.leitor_id = ?)'); args.push(pessoa.id)
  }
  const q = linha(busca.get('q'), 60)
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    onde.push("(p.titulo LIKE ? ESCAPE '\\' OR p.sinopse LIKE ? ESCAPE '\\' OR l.usuario LIKE ? ESCAPE '\\')")
    args.push(like, like, like)
  }
  const ordens = {
    recentes: 'ultima DESC', populares: 'p.leituras DESC, ultima DESC', novas: 'p.publicada_em DESC', az: 'p.titulo COLLATE NOCASE',
  }
  const ordem = ordens[busca.get('ordem')] ?? ordens.recentes
  const pagina = Math.min(200, Math.max(1, Math.floor(Number(busca.get('pagina')) || 1)))

  const linhas = banco.prepare(`
    SELECT p.*, l.usuario, l.nome,
      (SELECT COUNT(*) FROM publicacao_parte x WHERE x.publicacao_id = p.id AND x.estado = 'publicada') partes,
      (SELECT MAX(x.publicada_em) FROM publicacao_parte x WHERE x.publicacao_id = p.id AND x.estado = 'publicada') ultima
      FROM publicacao p JOIN leitor l ON l.id = p.autor_id
     WHERE ${onde.join(' AND ')}
     ORDER BY ${ordem}
     LIMIT ? OFFSET ?`).all(...args, POR_PAGINA + 1, (pagina - 1) * POR_PAGINA)
  return {
    obras: linhas.slice(0, POR_PAGINA).map(cartao),
    proximaPagina: linhas.length > POR_PAGINA ? pagina + 1 : null,
    opcoes: opcoes(),
  }
}

function obraVisivel(banco, pessoa, id) {
  const o = banco.prepare(`SELECT p.*, l.usuario, l.nome FROM publicacao p JOIN leitor l ON l.id = p.autor_id WHERE p.id = ?`).get(Number(id))
  if (!o) throw new Recusa('Publicação não encontrada.', 404)
  const dono = pessoa && (o.autor_id === pessoa.id || ehAdmin(pessoa))
  if (!dono) {
    if (o.estado !== 'publicada') throw new Recusa('Publicação não encontrada.', 404)
    if (o.classificacao === '18' && !pessoa) throw new Recusa('Esta obra é para maiores de 18. Entre com a sua conta para abrir.', 401)
  }
  return { o, dono }
}

export function ficha(banco, pessoa, id) {
  const { o, dono } = obraVisivel(banco, pessoa, id)
  const partes = banco.prepare(`SELECT id, ordem, titulo, palavras, json_array_length(paginas) paginas, estado, motivo, leituras, publicada_em, atualizada_em, pendente
      FROM publicacao_parte WHERE publicacao_id = ? ${dono ? '' : "AND estado = 'publicada'"} ORDER BY ordem`).all(o.id)
  const base = cartao({ ...o, partes: partes.filter((p) => p.estado === 'publicada').length })
  return {
    ...base,
    partes: partes.map((p) => ({
      id: p.id, ordem: p.ordem, titulo: p.titulo, palavras: p.palavras, paginas: p.paginas, publicadaEm: p.publicada_em,
      ...(dono ? { estado: p.estado, motivo: p.motivo, leituras: p.leituras, pendente: p.pendente } : {}),
    })),
    souDono: !!dono,
    seguidores: contarSeguidores(banco, o.id),
    seguindo: pessoa ? !!banco.prepare('SELECT 1 FROM publicacao_seguidor WHERE leitor_id = ? AND publicacao_id = ?').get(pessoa.id, o.id) : false,
    ...(dono ? {
      estado: o.estado, motivo: o.motivo, capaPendente: urlArquivo(o.capa_pendente), statusObra: o.status_obra,
      generosChaves: JSON.parse(o.generos),
    } : {}),
  }
}

export function lerParte(banco, pessoa, id, ordem) {
  const { o, dono } = obraVisivel(banco, pessoa, id)
  const p = banco.prepare(`SELECT * FROM publicacao_parte WHERE publicacao_id = ? AND ordem = ? ${dono ? '' : "AND estado = 'publicada'"}`)
    .get(o.id, Number(ordem))
  if (!p) throw new Recusa('Capítulo não encontrado.', 404)
  const vizinhos = banco.prepare(`SELECT ordem FROM publicacao_parte WHERE publicacao_id = ? ${dono ? '' : "AND estado = 'publicada'"} ORDER BY ordem`)
    .all(o.id).map((x) => x.ordem)
  const i = vizinhos.indexOf(p.ordem)
  if (!dono) {
    banco.prepare('UPDATE publicacao SET leituras = leituras + 1 WHERE id = ?').run(o.id)
    banco.prepare('UPDATE publicacao_parte SET leituras = leituras + 1 WHERE id = ?').run(p.id)
  }
  return {
    obra: { id: o.id, titulo: o.titulo, tipo: o.tipo, sentido: o.sentido, autor: { usuario: o.usuario, nome: o.nome } },
    // quem é dono vê a edição que espera revisão (é o que ele vai continuar editando)
    parte: { id: p.id, ordem: p.ordem, titulo: dono && p.titulo_pendente ? p.titulo_pendente : p.titulo, estado: dono ? p.estado : undefined, pendente: dono ? p.pendente : undefined },
    texto: o.tipo === 'livro' ? (dono && p.texto_pendente != null ? p.texto_pendente : p.texto) : null,
    paginas: o.tipo === 'quadrinho' ? JSON.parse(dono && p.paginas_pendente ? p.paginas_pendente : p.paginas).map(urlArquivo) : null,
    anterior: i > 0 ? vizinhos[i - 1] : null,
    proxima: i >= 0 && i < vizinhos.length - 1 ? vizinhos[i + 1] : null,
  }
}

export function denunciar(banco, pessoa, { id, motivo, detalhe }) {
  const o = banco.prepare("SELECT id, titulo, autor_id, estado FROM publicacao WHERE id = ? AND estado = 'publicada'").get(Number(id))
  if (!o) throw new Recusa('Publicação não encontrada.', 404)
  if (!MOTIVOS_DENUNCIA[motivo]) throw new Recusa('Escolha o motivo.')
  if (o.autor_id === pessoa.id) throw new Recusa('Você não pode denunciar a própria obra.')
  const r = banco.prepare('INSERT OR IGNORE INTO publicacao_denuncia (publicacao_id, leitor_id, motivo, detalhe) VALUES (?,?,?,?)')
    .run(o.id, pessoa.id, motivo, texto(detalhe, 1000) || null)
  if (!r.changes) return { ok: true, jaTinha: true }
  // A denúncia vai para a revisão; quem decide se a obra sai é a administração.
  for (const adm of banco.prepare("SELECT id FROM leitor WHERE papel = 'admin' AND desativado = 0").all()) {
    avisar(banco, adm.id, { chave: `denuncia-${o.id}-${Date.now()}`, tipo: 'denuncia',
      titulo: `Denúncia para revisar: ${o.titulo}`, corpo: MOTIVOS_DENUNCIA[motivo], link: '/admin.html' })
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────
// os arquivos de imagem
// ─────────────────────────────────────────────────────────────

export function podeVerArquivo(banco, pessoa, arquivoId) {
  const a = banco.prepare(`
    SELECT a.*, p.autor_id, p.estado obra_estado, p.capa, p.classificacao, x.estado parte_estado, x.paginas parte_paginas
      FROM publicacao_arquivo a JOIN publicacao p ON p.id = a.publicacao_id
      LEFT JOIN publicacao_parte x ON x.id = a.parte_id
     WHERE a.id = ?`).get(arquivoId)
  if (!a) return null
  const dono = pessoa && (pessoa.id === a.autor_id || ehAdmin(pessoa))
  if (dono) return { a, publico: false }
  if (a.obra_estado !== 'publicada') return null
  if (a.classificacao === '18' && !pessoa) return null
  if (a.uso === 'capa') return a.capa === nomeArquivo(a) ? { a, publico: true } : null
  // página só é pública se estiver na versão NO AR do capítulo (não na edição pendente)
  const noAr = a.parte_estado === 'publicada' && JSON.parse(a.parte_paginas ?? '[]').includes(nomeArquivo(a))
  return noAr ? { a, publico: a.classificacao !== '18' } : null
}

/**
 * Serve uma imagem de publicação. O tipo vem do banco (decidido por
 * `imagem.mjs` na entrada), e os cabeçalhos tiram do navegador qualquer
 * vontade de tratá-la como outra coisa: `nosniff`, CSP que proíbe tudo e
 * `sandbox`, e `inline` sem nome de arquivo.
 */
export function servirArquivo(banco, pessoa, req, res, nome) {
  const m = /^([0-9a-f]{32})\.(jpg|png|webp)$/.exec(nome)
  const ver = m && podeVerArquivo(banco, pessoa, m[1])
  if (!ver || ver.a.extensao !== m[2]) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('não achei') }
  const caminho = caminhoArquivo(nome)
  if (!existsSync(caminho)) { res.writeHead(404); return res.end() }
  const etiqueta = `"${m[1]}"`
  const comuns = {
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cross-origin-resource-policy': 'same-origin',
    'cache-control': ver.publico ? 'public, max-age=86400' : 'private, no-store',
  }
  if (req.headers['if-none-match'] === etiqueta && ver.publico) { res.writeHead(304, comuns); return res.end() }
  res.writeHead(200, { ...comuns, 'content-type': ver.a.mime, 'content-length': statSync(caminho).size, 'content-disposition': 'inline', etag: etiqueta })
  createReadStream(caminho).pipe(res)
}

/**
 * A faxina: página enviada e nunca presa a capítulo (mais de 6 h), e arquivo
 * no disco sem linha no banco — o que sobra quando uma conta é apagada e o
 * CASCADE leva as linhas mas não os arquivos.
 */
export function faxina(banco) {
  const soltas = apagarArquivos(banco, "uso = 'pagina' AND parte_id IS NULL AND criado_em < datetime('now', '-6 hours')")
  const conhecidos = new Set(banco.prepare('SELECT id, extensao FROM publicacao_arquivo').all().map(nomeArquivo))
  let orfaos = 0
  try {
    for (const f of readdirSync(PASTA)) {
      if (conhecidos.has(f)) continue
      const c = join(PASTA, f)
      try { if (Date.now() - statSync(c).mtimeMs > 10 * 60000) { unlinkSync(c); orfaos++ } } catch {}
    }
  } catch {}
  return { soltas, orfaos }
}

// ─────────────────────────────────────────────────────────────
// a administração
// ─────────────────────────────────────────────────────────────

export function filaDeRevisao(banco) {
  const obras = banco.prepare(`
    SELECT p.id, p.tipo, p.formato, p.titulo, p.estado, p.motivo, p.classificacao, p.capa, p.capa_pendente, p.atualizada_em,
           p.declarou_autoria, l.usuario,
           (SELECT COUNT(*) FROM publicacao_parte x WHERE x.publicacao_id = p.id AND x.estado = 'revisao') partes_revisao,
           (SELECT COUNT(*) FROM publicacao_denuncia d WHERE d.publicacao_id = p.id AND d.resolvida_em IS NULL) denuncias
      FROM publicacao p JOIN leitor l ON l.id = p.autor_id
     WHERE p.estado IN ('revisao','suspensa') OR p.capa_pendente IS NOT NULL
        OR EXISTS (SELECT 1 FROM publicacao_parte x WHERE x.publicacao_id = p.id AND (x.estado = 'revisao' OR x.pendente = 'revisao'))
        OR EXISTS (SELECT 1 FROM publicacao_denuncia d WHERE d.publicacao_id = p.id AND d.resolvida_em IS NULL)
     ORDER BY p.atualizada_em`).all()
  const partes = banco.prepare(`SELECT id, publicacao_id, ordem, COALESCE(titulo_pendente, titulo) titulo, palavras,
        json_array_length(COALESCE(paginas_pendente, paginas)) paginas, pendente = 'revisao' edicao
      FROM publicacao_parte WHERE estado = 'revisao' OR pendente = 'revisao' ORDER BY publicacao_id, ordem`).all()
  const denuncias = banco.prepare(`SELECT d.id, d.publicacao_id, d.motivo, d.detalhe, d.criada_em, l.usuario
      FROM publicacao_denuncia d LEFT JOIN leitor l ON l.id = d.leitor_id WHERE d.resolvida_em IS NULL ORDER BY d.criada_em`).all()
  const publicadas = banco.prepare(`SELECT p.id, p.titulo, p.tipo, p.leituras, p.publicada_em, l.usuario
      FROM publicacao p JOIN leitor l ON l.id = p.autor_id WHERE p.estado = 'publicada' ORDER BY p.publicada_em DESC LIMIT 50`).all()
  return {
    obras: obras.map((o) => ({ ...o, capa: urlArquivo(o.capa), capa_pendente: urlArquivo(o.capa_pendente),
      partes: partes.filter((x) => x.publicacao_id === o.id) })),
    denuncias: denuncias.map((d) => ({ ...d, motivoNome: MOTIVOS_DENUNCIA[d.motivo] ?? d.motivo })),
    publicadas,
  }
}

/**
 * Quem denunciou fica sabendo do que aconteceu (19/09/2026). Antes a denúncia
 * sumia na fila: a pessoa não sabia se alguém tinha olhado, e denúncia que
 * não volta resposta ensina a não denunciar. `so`: uma denúncia só (a que foi
 * resolvida sem tirar a obra); sem ele, todas as abertas daquela obra.
 */
function responderDenuncias(banco, publicacaoId, titulo, desfecho, { so = null } = {}) {
  const abertas = so
    ? banco.prepare('SELECT id, leitor_id FROM publicacao_denuncia WHERE id = ? AND resolvida_em IS NULL AND leitor_id IS NOT NULL').all(so)
    : banco.prepare('SELECT id, leitor_id FROM publicacao_denuncia WHERE publicacao_id = ? AND resolvida_em IS NULL AND leitor_id IS NOT NULL').all(publicacaoId)
  for (const d of abertas) {
    avisar(banco, d.leitor_id, { chave: `denuncia-resposta-${d.id}`, tipo: 'denuncia',
      titulo: `Sua denúncia sobre ${titulo} foi analisada`, corpo: desfecho, link: '/publicacoes.html' })
  }
}

/**
 * Uma decisão da administração. `alvo`: obra, parte, capa ou denúncia.
 * Obra: aprovar | recusar | suspender | reativar. Parte: aprovar | recusar.
 * Capa: aprovar | recusar. Denúncia: resolver.
 */
export function decidir(banco, admin, { alvo, id, acao, motivo }) {
  const porque = texto(motivo, 500) || null
  const avisarAutor = (autorId, titulo, corpo) => avisar(banco, autorId,
    { chave: `pub-${Date.now()}-${randomBytes(3).toString('hex')}`, tipo: 'publicacao', titulo, corpo, link: '/publicar.html' })

  if (alvo === 'obra') {
    const o = banco.prepare('SELECT * FROM publicacao WHERE id = ?').get(Number(id))
    if (!o) throw new Recusa('Publicação não encontrada.', 404)
    if (acao === 'aprovar' || acao === 'reativar') {
      if (acao === 'aprovar' && o.estado !== 'revisao') throw new Recusa('Esta obra não está em revisão.')
      if (acao === 'reativar' && o.estado !== 'suspensa') throw new Recusa('Esta obra não está suspensa.')
      if (acao === 'aprovar') {
        banco.prepare(`UPDATE publicacao_parte SET estado='publicada', motivo=NULL, publicada_em=COALESCE(publicada_em, datetime('now'))
            WHERE publicacao_id = ? AND estado = 'revisao'`).run(o.id)
      }
      banco.prepare(`UPDATE publicacao SET estado='publicada', motivo=NULL, publicada_em=COALESCE(publicada_em, datetime('now')) WHERE id = ?`).run(o.id)
      if (acao === 'reativar') banco.prepare("UPDATE publicacao_denuncia SET resolvida_em = datetime('now') WHERE publicacao_id = ? AND resolvida_em IS NULL").run(o.id)
      avisarAutor(o.autor_id, `Publicada: ${o.titulo}`, 'A sua obra está no ar e já aparece nos filtros da comunidade.')
    } else if (acao === 'recusar' || acao === 'suspender') {
      if (!porque) throw new Recusa('Diga o motivo — ele vai para o autor.')
      if (acao === 'recusar') {
        banco.prepare("UPDATE publicacao_parte SET estado='recusada', motivo=? WHERE publicacao_id = ? AND estado = 'revisao'").run(porque, o.id)
      }
      banco.prepare('UPDATE publicacao SET estado=?, motivo=? WHERE id = ?').run(acao === 'recusar' ? 'recusada' : 'suspensa', porque, o.id)
      if (acao === 'suspender') {
        responderDenuncias(banco, o.id, o.titulo, 'Obrigado. A obra saiu do ar e o autor foi avisado do motivo.')
        banco.prepare("UPDATE publicacao_denuncia SET resolvida_em = datetime('now') WHERE publicacao_id = ? AND resolvida_em IS NULL").run(o.id)
      }
      avisarAutor(o.autor_id, `${acao === 'recusar' ? 'Não aprovada' : 'Suspensa'}: ${o.titulo}`, porque)
    } else throw new Recusa('Ação desconhecida.')
    return { ok: true }
  }

  if (alvo === 'parte') {
    const p = banco.prepare('SELECT x.*, p.autor_id, p.titulo obra, p.estado obra_estado FROM publicacao_parte x JOIN publicacao p ON p.id = x.publicacao_id WHERE x.id = ?').get(Number(id))
    if (!p || (p.estado !== 'revisao' && p.pendente !== 'revisao')) throw new Recusa('Capítulo não está em revisão.', 404)
    if (p.pendente === 'revisao') {
      if (acao === 'aprovar') { aplicarPendente(banco, p.id); avisarAutor(p.autor_id, `Edição no ar: ${p.obra} — ${p.titulo}`, null) }
      else if (acao === 'recusar') {
        if (!porque) throw new Recusa('Diga o motivo — ele vai para o autor.')
        descartarPendente(banco, p.id)
        banco.prepare('UPDATE publicacao_parte SET motivo = ? WHERE id = ?').run(porque, p.id)
        avisarAutor(p.autor_id, `Edição não aprovada: ${p.obra} — ${p.titulo}`, `${porque} A versão anterior continua no ar.`)
      } else throw new Recusa('Ação desconhecida.')
      return { ok: true }
    }
    if (acao === 'aprovar') {
      banco.prepare("UPDATE publicacao_parte SET estado='publicada', motivo=NULL, publicada_em=COALESCE(publicada_em, datetime('now')) WHERE id = ?").run(p.id)
      if (p.obra_estado === 'publicada') { avisarAutor(p.autor_id, `Capítulo no ar: ${p.obra} — ${p.titulo}`, null); avisarSeguidores(banco, p.publicacao_id, p.ordem, p.titulo, p.obra) }
    } else if (acao === 'recusar') {
      if (!porque) throw new Recusa('Diga o motivo — ele vai para o autor.')
      banco.prepare("UPDATE publicacao_parte SET estado='recusada', motivo=? WHERE id = ?").run(porque, p.id)
      avisarAutor(p.autor_id, `Capítulo não aprovado: ${p.obra} — ${p.titulo}`, porque)
    } else throw new Recusa('Ação desconhecida.')
    return { ok: true }
  }

  if (alvo === 'capa') {
    const o = banco.prepare('SELECT * FROM publicacao WHERE id = ? AND capa_pendente IS NOT NULL').get(Number(id))
    if (!o) throw new Recusa('Não há capa esperando revisão.', 404)
    if (acao === 'aprovar') {
      if (o.capa) apagarArquivos(banco, 'id = ?', idDoNome(o.capa))
      banco.prepare('UPDATE publicacao SET capa = capa_pendente, capa_pendente = NULL WHERE id = ?').run(o.id)
    } else if (acao === 'recusar') {
      apagarArquivos(banco, 'id = ?', idDoNome(o.capa_pendente))
      banco.prepare('UPDATE publicacao SET capa_pendente = NULL WHERE id = ?').run(o.id)
      avisarAutor(o.autor_id, `Capa nova não aprovada: ${o.titulo}`, porque)
    } else throw new Recusa('Ação desconhecida.')
    return { ok: true }
  }

  if (alvo === 'denuncia' && acao === 'resolver') {
    const d = banco.prepare('SELECT d.id, p.id pub, p.titulo FROM publicacao_denuncia d JOIN publicacao p ON p.id = d.publicacao_id WHERE d.id = ?').get(Number(id))
    if (d) responderDenuncias(banco, d.pub, d.titulo, 'Olhamos com cuidado e a obra continua no ar: não achamos nela o problema apontado. Obrigado por avisar.', { so: d.id })
    const r = banco.prepare("UPDATE publicacao_denuncia SET resolvida_em = datetime('now') WHERE id = ? AND resolvida_em IS NULL").run(Number(id))
    if (!r.changes) throw new Recusa('Denúncia não encontrada.', 404)
    return { ok: true }
  }
  throw new Recusa('Pedido desconhecido.')
}

// ── edição pendente de capítulo publicado ──

function paginasDe(json) { try { return JSON.parse(json ?? '[]') } catch { return [] } }

/** Troca a versão no ar pela editada, e apaga as páginas que saíram. */
function aplicarPendente(banco, parteId) {
  const p = banco.prepare('SELECT * FROM publicacao_parte WHERE id = ?').get(parteId)
  if (!p?.pendente) return
  const novas = p.paginas_pendente ? paginasDe(p.paginas_pendente) : paginasDe(p.paginas)
  const corpo = p.texto_pendente ?? p.texto
  banco.prepare(`UPDATE publicacao_parte SET titulo = COALESCE(titulo_pendente, titulo), texto = ?, paginas = ?, palavras = ?,
      titulo_pendente = NULL, texto_pendente = NULL, paginas_pendente = NULL, pendente = NULL, motivo = NULL,
      atualizada_em = datetime('now') WHERE id = ?`).run(corpo, JSON.stringify(novas), corpo ? contar(corpo) : p.palavras, p.id)
  const ficam = new Set(novas.map(idDoNome))
  for (const a of banco.prepare('SELECT id FROM publicacao_arquivo WHERE parte_id = ?').all(p.id)) {
    if (!ficam.has(a.id)) apagarArquivos(banco, 'id = ?', a.id)
  }
}

/** Joga fora a edição; a versão no ar não muda. */
function descartarPendente(banco, parteId) {
  const p = banco.prepare('SELECT * FROM publicacao_parte WHERE id = ?').get(parteId)
  if (!p?.pendente) return
  const ficam = new Set(paginasDe(p.paginas).map(idDoNome))
  for (const a of banco.prepare('SELECT id FROM publicacao_arquivo WHERE parte_id = ?').all(p.id)) {
    if (!ficam.has(a.id)) apagarArquivos(banco, 'id = ?', a.id)
  }
  banco.prepare('UPDATE publicacao_parte SET titulo_pendente = NULL, texto_pendente = NULL, paginas_pendente = NULL, pendente = NULL WHERE id = ?').run(p.id)
}

// ── seguir obra e ordem dos capítulos (17/09, tarde) ──

function contarSeguidores(banco, id) {
  try { return banco.prepare('SELECT COUNT(*) n FROM publicacao_seguidor WHERE publicacao_id = ?').get(id).n } catch { return 0 }
}

/** Capítulo novo no ar: aviso para quem segue (uma vez por capítulo). */
function avisarSeguidores(banco, publicacaoId, ordem, tituloParte, tituloObra) {
  let quem = []
  try { quem = banco.prepare('SELECT leitor_id FROM publicacao_seguidor WHERE publicacao_id = ?').all(publicacaoId) } catch { return }
  for (const { leitor_id: id } of quem) {
    avisar(banco, id, { chave: `seguindo-${publicacaoId}-${ordem}`, tipo: 'seguindo',
      titulo: `Capítulo novo: ${tituloObra}`, corpo: tituloParte, link: `/publicacoes.html?id=${publicacaoId}&cap=${ordem}` })
  }
}

/** Nova ordem dos capítulos: a lista inteira de ids, na ordem desejada. */
export function reordenarPartes(banco, pessoa, { publicacao, ids }) {
  const o = minhaObra(banco, pessoa, publicacao)
  const atuais = banco.prepare('SELECT id FROM publicacao_parte WHERE publicacao_id = ?').all(o.id).map((x) => x.id)
  const pedidos = (Array.isArray(ids) ? ids : []).map(Number)
  if (pedidos.length !== atuais.length || new Set(pedidos).size !== atuais.length || !pedidos.every((id) => atuais.includes(id))) {
    throw new Recusa('A lista de capítulos não confere. Recarregue a página.')
  }
  const mover = banco.prepare('UPDATE publicacao_parte SET ordem = ? WHERE id = ?')
  banco.exec('BEGIN')
  try {
    pedidos.forEach((id, i) => mover.run(-(i + 1), id))
    pedidos.forEach((id, i) => mover.run(i + 1, id))
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
  banco.prepare("UPDATE publicacao SET atualizada_em = datetime('now') WHERE id = ?").run(o.id)
  return { ok: true }
}
