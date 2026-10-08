// A RETRADUÇÃO DO ACERVO (06/10/2026).
//
// O dono: "automatizar sem quebrar todos os livros do site". Os 327 livros
// traduzidos do inglês pelo motor antigo (NLLB-600M) são traduzidos de novo
// pelo tradutor local (Opus-MT), um por um, dos mais lidos para os menos. O
// livro novo NÃO vai direto para o site: ele passa por um portão, e só entra
// se for melhor que o que está lá em tudo que dá para medir sem ler.
//
// O PORTÃO (avaliar):
//   1. mesmo número de capítulos — capítulo a mais ou a menos desalinha o
//      progresso de quem está lendo e a busca;
//   2. cada capítulo com tamanho parecido com o de antes (0,6 a 1,6) e o livro
//      inteiro também (0,8 a 1,25) — tradução que encolhe perdeu texto;
//   3. quase nada no original: no máximo 1% das frases sem tradução nenhuma;
//   4. o motor antigo socorreu no máximo 10% das frases (passou disso, o
//      livro é dos que o tradutor novo não domina);
//   5. não mais inglês que antes (folga de 1 por mil para nome de personagem).
// Passou em tudo: entra. Falhou em qualquer um: fica SEGURADO, com o motivo
// escrito, e o site continua com a tradução de antes.
//
// A VOLTA (desfazer): antes de trocar, os capítulos de antes vão para
// `capitulo_versao`, byte a byte. Desfazer devolve exatamente aquilo — e o
// guardado é sempre o PRIMEIRO, o do motor antigo, mesmo que o livro seja
// retraduzido de novo depois.
//
// O que NÃO muda: o id de cada capítulo (só o corpo é trocado), então o
// progresso de leitura e os links continuam valendo; e o título do capítulo,
// que já estava conferido.

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS retraducao (
    texto_id  INTEGER PRIMARY KEY REFERENCES texto(id),
    estado    TEXT NOT NULL CHECK (estado IN ('traduzindo','promovida','segurada','desfeita','erro')),
    motivo    TEXT,
    metricas  TEXT,
    tentativas INTEGER NOT NULL DEFAULT 0,
    em        TEXT NOT NULL DEFAULT (datetime('now')))`)
  banco.exec(`CREATE TABLE IF NOT EXISTS capitulo_versao (
    texto_id    INTEGER NOT NULL REFERENCES texto(id),
    ordem       INTEGER NOT NULL,
    titulo      TEXT,
    corpo       TEXT NOT NULL,
    palavras    INTEGER NOT NULL,
    guardado_em TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (texto_id, ordem))`)
  // a nota da conferência (servidor/conferencia.mjs): a retradução começa pelos piores
  banco.exec(`CREATE TABLE IF NOT EXISTS conferencia (
    texto_id  INTEGER PRIMARY KEY REFERENCES texto(id),
    obra_id   INTEGER NOT NULL,
    nota      INTEGER NOT NULL,
    estado    TEXT NOT NULL CHECK (estado IN ('ok','atencao','ruim')),
    problemas TEXT NOT NULL DEFAULT '{}',
    medido_em TEXT NOT NULL DEFAULT (datetime('now')))`)
}

/** Os livros a retraduzir: do inglês, com o original conhecido, dos mais lidos para os menos. */
export function candidatos(banco, limite = 50) {
  garantirTabelas(banco)
  return banco.prepare(`
    SELECT t.id texto_id, t.obra_id, COALESCE(o.titulo_pt, o.titulo) titulo, f.fonte,
      (SELECT COUNT(*) FROM abertura a WHERE a.obra_id = t.obra_id AND a.quando >= datetime('now','-60 days')) lido,
      (SELECT COALESCE(SUM(palavras),0) FROM capitulo c WHERE c.texto_id = t.id) palavras
    FROM texto t JOIN obra o ON o.id = t.obra_id
    JOIN fila_traducao f ON f.id = (SELECT MAX(id) FROM fila_traducao x WHERE x.obra_id = t.obra_id AND x.estado = 'pronto')
    LEFT JOIN conferencia cf ON cf.texto_id = t.id
    WHERE t.fonte = 'fio_traducao' AND t.dono_id IS NULL AND f.idioma = 'en'
      AND NOT EXISTS (SELECT 1 FROM retraducao r WHERE r.texto_id = t.id
        AND (r.estado IN ('promovida','segurada','desfeita','traduzindo','erro') OR r.tentativas >= 2))
    ORDER BY COALESCE(cf.nota, 100) ASC, lido DESC, palavras ASC LIMIT ?`).all(limite)
}

// palavras que só o inglês usa (nenhuma existe em português)
const INGLES = new Set('the and of was his her with that which had were from they would been have this but not you she him their there what when said could into upon then them who will very your our'.split(' '))
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')

/** Palavras de inglês por mil, num corpo de capítulo (ou em vários). */
export function inglesPorMil(corpos) {
  let n = 0, total = 0
  for (const c of [].concat(corpos)) for (const w of texto(c).toLowerCase().match(/\p{L}+/gu) ?? []) { total++; if (INGLES.has(w)) n++ }
  return total ? Math.round((n / total) * 10000) / 10 : 0
}

/**
 * O portão. `antigos` e `novos`: [{ ordem, palavras, corpo }]; `registro`:
 * o que o tradutor decidiu (frases, alternativa, ingles, mint, original).
 */
export function avaliar(antigos, novos, registro = {}) {
  const motivos = []
  if (novos.length !== antigos.length) motivos.push(`capítulos: ${novos.length} agora, ${antigos.length} antes`)
  const somaA = antigos.reduce((s, c) => s + c.palavras, 0), somaN = novos.reduce((s, c) => s + c.palavras, 0)
  const razao = somaN / Math.max(1, somaA)
  if (razao < 0.8 || razao > 1.25) motivos.push(`tamanho do livro: ${razao.toFixed(2)} do de antes`)
  if (novos.length === antigos.length) {
    for (let i = 0; i < novos.length; i++) {
      const a = antigos[i].palavras, n = novos[i].palavras
      if (a >= 200 && (n / a < 0.6 || n / a > 1.6)) { motivos.push(`capítulo ${i + 1}: ${n} palavras contra ${a}`); break }
      if (a > 0 && n === 0) { motivos.push(`capítulo ${i + 1} saiu vazio`); break }
    }
  }
  const frases = Math.max(1, registro.frases ?? 0)
  const noOriginal = (registro.original ?? 0) / frases
  const socorro = ((registro.mint ?? 0) + (registro.original ?? 0)) / frases
  if (noOriginal > 0.01) motivos.push(`${(noOriginal * 100).toFixed(1)}% das frases ficaram no original`)
  if (socorro > 0.10) motivos.push(`o motor antigo socorreu ${(socorro * 100).toFixed(0)}% das frases`)
  const inglesAntes = inglesPorMil(antigos.map((c) => c.corpo)), inglesAgora = inglesPorMil(novos.map((c) => c.corpo))
  // folga de 1 por mil: nome de personagem fica em inglês de propósito ("Nan o' the Mill")
  if (inglesAgora > inglesAntes + 1) motivos.push(`mais inglês que antes (${inglesAgora} contra ${inglesAntes} por mil)`)
  const metricas = {
    capitulos: novos.length, palavras: somaN, palavrasAntes: somaA, razao: Math.round(razao * 100) / 100,
    inglesAntes, inglesAgora, frases: registro.frases ?? 0, alternativa: registro.alternativa ?? 0,
    ficouIngles: registro.ingles ?? 0, socorroMint: registro.mint ?? 0, noOriginal: registro.original ?? 0,
  }
  return { passa: motivos.length === 0, motivos, metricas }
}

export function marcar(banco, textoId, estado, motivo = null, metricas = null) {
  garantirTabelas(banco)
  banco.prepare(`INSERT INTO retraducao (texto_id, estado, motivo, metricas, tentativas) VALUES (?,?,?,?, ?)
    ON CONFLICT(texto_id) DO UPDATE SET estado = excluded.estado, motivo = excluded.motivo,
      metricas = COALESCE(excluded.metricas, retraducao.metricas),
      tentativas = retraducao.tentativas + (excluded.estado = 'erro'), em = datetime('now')`)
    .run(textoId, estado, motivo, metricas ? JSON.stringify(metricas) : null, estado === 'erro' ? 1 : 0)
}

function reindexar(banco, textoId) {
  banco.prepare('DELETE FROM busca_capitulo WHERE texto_id = ?').run(textoId)
  const poe = banco.prepare('INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)')
  for (const c of banco.prepare('SELECT id, corpo FROM capitulo WHERE texto_id = ?').all(textoId)) poe.run(c.corpo, c.id, textoId)
}

/** Troca os corpos dos capítulos pelos novos, guardando os de antes. */
export function promover(banco, textoId, novos, metricas) {
  garantirTabelas(banco)
  banco.exec('BEGIN')
  try {
    // guarda só a PRIMEIRA versão: desfazer sempre volta à tradução original do site
    banco.prepare(`INSERT OR IGNORE INTO capitulo_versao (texto_id, ordem, titulo, corpo, palavras)
      SELECT texto_id, ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ?`).run(textoId)
    const troca = banco.prepare('UPDATE capitulo SET corpo = ?, palavras = ? WHERE texto_id = ? AND ordem = ?')
    for (const c of novos) {
      if (troca.run(c.corpo, c.palavras, textoId, c.ordem).changes !== 1) throw new Error(`capítulo ${c.ordem} não existe no site`)
    }
    reindexar(banco, textoId)
    marcar(banco, textoId, 'promovida', null, metricas)
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
}

/** Devolve o livro, byte a byte, à tradução de antes. */
export function desfazer(banco, textoId) {
  garantirTabelas(banco)
  const antes = banco.prepare('SELECT ordem, titulo, corpo, palavras FROM capitulo_versao WHERE texto_id = ? ORDER BY ordem').all(textoId)
  if (!antes.length) throw new Error('não há versão guardada deste livro')
  banco.exec('BEGIN')
  try {
    const volta = banco.prepare('UPDATE capitulo SET corpo = ?, palavras = ?, titulo = ? WHERE texto_id = ? AND ordem = ?')
    for (const c of antes) volta.run(c.corpo, c.palavras, c.titulo, textoId, c.ordem)
    reindexar(banco, textoId)
    marcar(banco, textoId, 'desfeita', 'voltou à tradução anterior pelo painel')
    banco.exec('COMMIT')
  } catch (e) { banco.exec('ROLLBACK'); throw e }
}

/** O que o painel mostra. */
export function painel(banco) {
  garantirTabelas(banco)
  const conta = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM retraducao GROUP BY estado').all().map((r) => [r.estado, r.n]))
  const linhas = banco.prepare(`SELECT r.texto_id, r.estado, r.motivo, r.metricas, r.em, t.obra_id, COALESCE(o.titulo_pt, o.titulo) titulo
    FROM retraducao r JOIN texto t ON t.id = r.texto_id JOIN obra o ON o.id = t.obra_id ORDER BY r.em DESC LIMIT 80`).all()
    .map((r) => ({ ...r, metricas: r.metricas ? JSON.parse(r.metricas) : null }))
  return { conta, faltam: candidatos(banco, 1000).length, linhas }
}
