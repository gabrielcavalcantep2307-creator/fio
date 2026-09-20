// A central de ajustes: as poucas chaves que o dono muda pelo painel, e o
// portão de leitura que uma delas comanda.
//
// Mora na tabela `ajuste` (chave→valor), a mesma que guarda o segredo das
// perguntas de segurança. Por isso o painel NÃO escreve chave livre: a lista
// abaixo é fechada, e escrever fora dela seria escrever por cima do segredo da
// casa. O painel manda `portao_ativo`, e é só isso que ele consegue mexer.

// Quantas chaves o painel lê e escreve, e o que cada uma aceita.
export const CHAVES = {
  cadastro_aberto: 'bool', // qualquer um pode criar conta, sem convite
  portao_ativo: 'bool',    // depois de X páginas, anônimo precisa entrar
  portao_paginas: 'int',   // o X; vazio = a média calculada do acervo
  // 17/09: o portão por páginas deu lugar à amostra (portao_ativo = sem conta
  // lê só o 1º capítulo) e ao limite do plano grátis, em livros por mês.
  gratis_livros_mes: 'int',
  // 19/09: "desligar o site" pelo painel (servidor/manutencao.mjs)
  manutencao: 'bool',
  // 20/09: a revisora das traduções (servidor/revisao.mjs). Três estados, e o
  // padrão de fábrica é o mais tímido: 'propor' mede e lista, sem tocar no
  // texto; 'aplicar' troca de verdade; 'parada' não faz nada.
  revisora: 'modo',
}

/** Os únicos valores que uma chave de tipo 'modo' aceita. */
export const MODOS = { revisora: ['parada', 'propor', 'aplicar'] }

// A régua editorial de sempre: 300 palavras por página é o meio-termo entre
// livro de bolso e capa dura. Serve para dois cálculos — o teto do portão e o
// tamanho de cada livro que o anônimo abre.
const PALAVRAS_POR_PAGINA = 300

function garantir(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS ajuste (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)`)
  // Quem já leu quanto, sem conta. Por FAIXA DE IP, porque não há cookie
  // anônimo e a faixa é o que já existe. `obras` guarda os ids já contados,
  // para que reabrir um livro começado não gaste página de novo.
  banco.exec(`CREATE TABLE IF NOT EXISTS leitura_livre (
    dica       TEXT PRIMARY KEY,
    paginas    INTEGER NOT NULL DEFAULT 0,
    obras      TEXT    NOT NULL DEFAULT '',
    atualizado TEXT    NOT NULL DEFAULT (datetime('now')))`)
}

export function ler(banco, chave) {
  garantir(banco)
  return banco.prepare('SELECT valor FROM ajuste WHERE chave = ?').get(chave)?.valor ?? null
}

export function escrever(banco, chave, valor) {
  if (!(chave in CHAVES)) throw new Error(`ajuste desconhecido: ${chave}`)
  // Chave de tipo 'modo' tem lista fechada. Sem esta conferência, o painel
  // poderia gravar "aplicarr" e a revisora cairia no padrão sem ninguém ver —
  // um erro de digitação ligando um serviço que mexe no acervo.
  if (CHAVES[chave] === 'modo' && !MODOS[chave]?.includes(String(valor))) {
    throw new Error(`valor inválido para ${chave}: ${valor}`)
  }
  garantir(banco)
  banco.prepare(`INSERT INTO ajuste (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`).run(chave, String(valor))
}

// ── o cadastro: aberto por ambiente OU por ajuste ──
// O ambiente (`FIO_CONVITE=aberto`) continua mandando, e é o que sobrevive a
// um banco recriado. O ajuste é o interruptor do dia a dia, no painel.
export const cadastroAberto = (banco) =>
  process.env.FIO_CONVITE === 'aberto' || ler(banco, 'cadastro_aberto') === 'sim'

export const portaoAtivo = (banco) => ler(banco, 'portao_ativo') === 'sim'

// O padrão do portão: a média de páginas de um livro legível, vezes cinco —
// "cinco livros de graça, depois entra". Calculado do próprio acervo para não
// virar número mágico que envelhece quando o acervo cresce.
//
// A média vem de `minutos_leitura`, já gravado por obra, e NÃO de somar as
// palavras de todo capítulo do acervo: aquela conta cruza `capitulo` inteiro e
// levava treze segundos — e como `node:sqlite` é síncrono, treze segundos
// travando O PROCESSO TODO, para todo mundo, a cada vez que alguém abrisse os
// ajustes. Minuto de leitura × 250 palavras/minuto ÷ 300 palavras/página dá a
// mesma página, num décimo de milésimo do tempo.
const PALAVRAS_POR_MINUTO = 250
export function paginasPadrao(banco) {
  const r = banco.prepare(
    'SELECT AVG(minutos_leitura) m FROM obra WHERE publicada = 1 AND minutos_leitura > 0').get()
  const mediaPaginas = Math.round((r?.m ?? 0) * PALAVRAS_POR_MINUTO / PALAVRAS_POR_PAGINA)
  return Math.max(50, mediaPaginas * 5)
}

export function portaoPaginas(banco) {
  const v = ler(banco, 'portao_paginas')
  return v ? Number(v) : paginasPadrao(banco)
}

const paginasDoLivro = (capitulos) =>
  Math.max(1, Math.round(capitulos.reduce((s, c) => s + (c.palavras || 0), 0) / PALAVRAS_POR_PAGINA))

/**
 * O portão. Um anônimo abre livros até somar o teto de páginas; o livro que
 * ultrapassa ainda abre inteiro (quem começou termina), e o PRÓXIMO livro novo
 * é que pede conta. Reabrir um livro já contado é sempre livre.
 *
 * Devolve `{ pode: true }` ou `{ pode: false, teto, lidas }`.
 */
export function podeLerAnon(banco, dica, obraId, capitulos) {
  if (!portaoAtivo(banco)) return { pode: true }
  garantir(banco)
  const teto = portaoPaginas(banco)
  const linha = banco.prepare('SELECT paginas, obras FROM leitura_livre WHERE dica = ?').get(dica)
    ?? { paginas: 0, obras: '' }
  const jaLidas = linha.obras ? linha.obras.split(',') : []
  if (jaLidas.includes(String(obraId))) return { pode: true }
  if (linha.paginas >= teto) return { pode: false, teto, lidas: linha.paginas }

  const novas = linha.paginas + paginasDoLivro(capitulos)
  const lista = [...jaLidas, String(obraId)].slice(-300).join(',')
  banco.prepare(`INSERT INTO leitura_livre (dica, paginas, obras, atualizado)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(dica) DO UPDATE SET
      paginas = excluded.paginas, obras = excluded.obras, atualizado = excluded.atualizado`)
    .run(dica, novas, lista)
  return { pode: true }
}
