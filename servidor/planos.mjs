// As assinaturas do Fio: três níveis acima da conta grátis.
//
// **Estado em 17/09/2026: ninguém assina sozinho.** Não há gateway de
// pagamento. Os planos existem, com preço e comparação, para o leitor saber o
// que vem — e quem tem plano hoje é quem o dono escolheu dar, pelo painel
// (`origem = 'cortesia'`). Quando o pagamento chegar, ele grava aqui com
// `origem = 'pagamento'` e o resto do sistema não muda: tudo pergunta
// `planoDe()`, e ninguém lê a tabela direto.
//
// **Admin é sempre Tear**, o plano mais alto, sem linha na tabela: quem cuida
// da casa não depende de alguém lembrar de lhe dar assinatura.
//
// Os nomes seguem o fio: novelo (o fio enrolado), trama (o fio que se cruza
// com outros e vira tecido) e tear (onde se faz o tecido).
//
// ─────────────────────────────────────────────────────────────
// A LÓGICA DOS NÍVEIS (refeita em 17/09, a pedido do dono)
//
//   sem conta  lê o PRIMEIRO capítulo de cada livro. Para seguir, cria conta.
//   Grátis     3 livros novos por mês. Livro aberto fica aberto para sempre
//              (ninguém perde a leitura no meio). Leis, quadrinhos livres e a
//              comunidade não contam.
//   Novelo     ler sem limite, ouvir em voz alta, baixar EPUB, pedir tradução.
//   Trama      tudo do Novelo + publicar.
//   Tear       tudo da Trama, em escala, e com prioridade.
//
// Cada item da tabela abaixo é COISA QUE O SERVIDOR FAZ VALER hoje — nada de
// "em breve" e nada de detalhe de infraestrutura (megabytes, páginas por
// capítulo): ninguém compra plano por isso. Os tetos técnicos continuam
// existindo em `publicar`, só não viram argumento de venda.
// ─────────────────────────────────────────────────────────────

export const DISPONIVEL = false
export const AVISO = 'As assinaturas ainda não estão abertas. Os preços abaixo são os que vão valer quando o pagamento for ligado. Até lá, os planos são concedidos pela administração do Fio.'

const MB = 1024 * 1024
const SEM_LIMITE = Infinity

export const PLANOS = {
  leitor: {
    chave: 'leitor', nome: 'Grátis', nivel: 0, preco: 0, precoAno: 0,
    frase: 'Para conhecer a casa.',
    livrosMes: 3, voz: false, epub: false, pedidosMes: 0, prioridade: false,
    publicar: null,
  },
  novelo: {
    chave: 'novelo', nome: 'Novelo', nivel: 1, preco: 9.9, precoAno: 99,
    frase: 'Para quem lê de verdade.',
    livrosMes: SEM_LIMITE, voz: true, epub: true, pedidosMes: 2, prioridade: false,
    publicar: null,
  },
  trama: {
    chave: 'trama', nome: 'Trama', nivel: 2, preco: 19.9, precoAno: 199,
    frase: 'Para quem também escreve ou desenha.',
    livrosMes: SEM_LIMITE, voz: true, epub: true, pedidosMes: 5, prioridade: false,
    publicar: { obras: 3, partesPorObra: 60, paginasPorParte: 120, armazenamento: 1000 * MB, caracteresPorParte: 150_000 },
  },
  tear: {
    chave: 'tear', nome: 'Tear', nivel: 3, preco: 34.9, precoAno: 349,
    frase: 'Para séries em andamento e para quem estuda pesado.',
    livrosMes: SEM_LIMITE, voz: true, epub: true, pedidosMes: 15, prioridade: true,
    publicar: { obras: 20, partesPorObra: 500, paginasPorParte: 200, armazenamento: 5000 * MB, caracteresPorParte: 200_000 },
  },
}

export const ORDEM = ['leitor', 'novelo', 'trama', 'tear']

// A comparação. `true`/`false` viram ✓/—; texto aparece como está.
export const RECURSOS = [
  { grupo: 'Ler', itens: [
    { nome: 'Livros por mês', leitor: '3', novelo: 'sem limite', trama: 'sem limite', tear: 'sem limite' },
    { nome: 'Leis e códigos completos', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Quadrinhos livres e obras da comunidade', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Progresso, marcações e notas em todos os aparelhos', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Ouvir em voz alta', leitor: false, novelo: true, trama: true, tear: true },
    { nome: 'Baixar em EPUB (Kindle, Kobo, celular)', leitor: false, novelo: true, trama: true, tear: true },
  ] },
  { grupo: 'Traduções', itens: [
    { nome: 'Sugerir correções e aparecer como revisor', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Pedir a tradução de um clássico', leitor: false, novelo: '2 por mês', trama: '5 por mês', tear: '15 por mês' },
    { nome: 'Seus pedidos na frente da fila', leitor: false, novelo: false, trama: false, tear: true },
  ] },
  { grupo: 'Publicar', itens: [
    { nome: 'Publicar livros, mangás e HQs', leitor: false, novelo: false, trama: 'até 3 obras', tear: 'até 20 obras' },
    { nome: 'Leituras de cada obra e capítulo', leitor: false, novelo: false, trama: true, tear: true },
    { nome: 'Prioridade na revisão', leitor: false, novelo: false, trama: false, tear: true },
  ] },
]

// Os destaques de cada cartão: poucas linhas, o que faz a pessoa escolher.
export const DESTAQUES = {
  leitor: ['3 livros novos por mês', 'Leis, quadrinhos livres e comunidade à vontade', 'Progresso em todos os aparelhos'],
  novelo: ['Livros sem limite', 'Ouvir em voz alta', 'Baixar em EPUB', '2 pedidos de tradução por mês'],
  trama: ['Tudo do Novelo', 'Publicar até 3 obras', 'Leituras de cada capítulo', '5 pedidos de tradução por mês'],
  tear: ['Tudo da Trama', 'Publicar até 20 obras', '15 pedidos de tradução, na frente da fila', 'Prioridade na revisão'],
}

export function garantirTabelas(banco) {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS assinatura (
      leitor_id     INTEGER PRIMARY KEY REFERENCES leitor(id) ON DELETE CASCADE,
      plano         TEXT NOT NULL CHECK (plano IN ('novelo','trama','tear')),
      origem        TEXT NOT NULL DEFAULT 'cortesia' CHECK (origem IN ('cortesia','pagamento')),
      concedida_por INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
      nota          TEXT,
      desde         TEXT NOT NULL DEFAULT (datetime('now')),
      ate           TEXT
    );`)
}

/** O plano que vale AGORA para esta pessoa (objeto de `PLANOS`). */
export function planoDe(banco, pessoa) {
  if (!pessoa) return PLANOS.leitor
  if (pessoa.papel === 'admin') return PLANOS.tear
  const a = banco.prepare(`SELECT plano FROM assinatura WHERE leitor_id = ?
      AND (ate IS NULL OR ate > datetime('now'))`).get(pessoa.id)
  return PLANOS[a?.plano] ?? PLANOS.leitor
}

/** O que a página de planos precisa, com o plano de quem pede. */
export function vitrine(banco, pessoa) {
  const meu = planoDe(banco, pessoa)
  const linha = pessoa && pessoa.papel !== 'admin'
    ? banco.prepare('SELECT origem, desde, ate FROM assinatura WHERE leitor_id = ?').get(pessoa.id)
    : null
  return {
    disponivel: DISPONIVEL,
    aviso: AVISO,
    planos: ORDEM.map((k) => {
      const { chave, nome, nivel, preco, precoAno, frase } = PLANOS[k]
      return { chave, nome, nivel, preco, precoAno, frase, destaques: DESTAQUES[k] }
    }),
    recursos: RECURSOS,
    meu: pessoa ? { plano: meu.chave, nome: meu.nome, porAdmin: pessoa.papel === 'admin', desde: linha?.desde ?? null, ate: linha?.ate ?? null } : null,
  }
}

// ── o painel ──

export function listar(banco) {
  return banco.prepare(`
    SELECT a.leitor_id id, l.usuario, l.nome, a.plano, a.origem, a.nota, a.desde, a.ate,
           c.usuario concedida_por
      FROM assinatura a JOIN leitor l ON l.id = a.leitor_id
      LEFT JOIN leitor c ON c.id = a.concedida_por
     ORDER BY a.desde DESC`).all()
}

/**
 * Dar, trocar ou tirar um plano. `plano: null` tira. `dias` opcional limita a
 * cortesia no tempo. Conta de admin não recebe linha: já é Tear.
 */
export function conceder(banco, adminId, { usuario, plano, dias, nota }, { chaveDe, Recusa }) {
  const chave = chaveDe(usuario)
  if (!chave) throw new Recusa('Diga o nome de usuário da conta.')
  const alvo = banco.prepare('SELECT id, usuario, papel FROM leitor WHERE usuario_chave = ? AND desativado = 0').get(chave)
  if (!alvo) throw new Recusa('Não achei conta com esse nome de usuário.', 404)
  if (alvo.papel === 'admin') throw new Recusa('Conta de administração já tem o plano Tear.')
  if (plano == null || plano === '' || plano === 'leitor') {
    const r = banco.prepare('DELETE FROM assinatura WHERE leitor_id = ?').run(alvo.id)
    return { ok: true, usuario: alvo.usuario, plano: 'leitor', mudou: r.changes > 0 }
  }
  if (!['novelo', 'trama', 'tear'].includes(plano)) throw new Recusa('Plano desconhecido.')
  const d = Number(dias)
  const ate = Number.isInteger(d) && d > 0 && d <= 3660 ? `+${d} days` : null
  banco.prepare(`
    INSERT INTO assinatura (leitor_id, plano, origem, concedida_por, nota, desde, ate)
    VALUES (?, ?, 'cortesia', ?, ?, datetime('now'), CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)
    ON CONFLICT(leitor_id) DO UPDATE SET plano = excluded.plano, origem = 'cortesia',
      concedida_por = excluded.concedida_por, nota = excluded.nota, desde = datetime('now'), ate = excluded.ate`)
    .run(alvo.id, plano, adminId, String(nota ?? '').trim().slice(0, 200) || null, ate, ate)
  return { ok: true, usuario: alvo.usuario, plano }
}
