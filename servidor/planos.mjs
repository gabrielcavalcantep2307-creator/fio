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
// com outros e vira tecido) e tear (onde se faz o tecido). Publicar começa na
// Trama — é o nível em que você passa de ler histórias a tecer as suas.

export const DISPONIVEL = false
export const AVISO = 'As assinaturas ainda não estão abertas. Os planos e os preços abaixo já são os que vão valer; o pagamento chega numa próxima etapa. Por enquanto os planos são concedidos pela administração do Fio.'

const MB = 1024 * 1024

// Os limites que o servidor FAZ valer hoje. O que é só promessa de tela fica
// em `recursos`, marcado com `em_breve`.
export const PLANOS = {
  leitor: {
    chave: 'leitor', nome: 'Leitor', nivel: 0, preco: 0, precoAno: 0,
    frase: 'A biblioteca inteira, de graça, para sempre.',
    publicar: null,
  },
  novelo: {
    chave: 'novelo', nome: 'Novelo', nivel: 1, preco: 7.9, precoAno: 79,
    frase: 'Para quem lê muito e quer apoiar a casa.',
    publicar: null,
  },
  trama: {
    chave: 'trama', nome: 'Trama', nivel: 2, preco: 16.9, precoAno: 169,
    frase: 'Para quem também escreve ou desenha: publique livros e quadrinhos.',
    publicar: { obras: 3, partesPorObra: 40, paginasPorParte: 80, armazenamento: 300 * MB, caracteresPorParte: 120_000 },
  },
  tear: {
    chave: 'tear', nome: 'Tear', nivel: 3, preco: 29.9, precoAno: 299,
    frase: 'Para criadores com série em andamento e público formado.',
    publicar: { obras: 20, partesPorObra: 400, paginasPorParte: 150, armazenamento: 3000 * MB, caracteresPorParte: 200_000 },
  },
}

export const ORDEM = ['leitor', 'novelo', 'trama', 'tear']

// A comparação que a página de planos desenha. Cada linha: o recurso e o que
// cada plano leva. `true`/`false` viram ✓/—; texto aparece como está.
export const RECURSOS = [
  { grupo: 'Ler', itens: [
    { nome: 'Todo o acervo: livros, leis, quadrinhos livres', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Publicações da comunidade', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Progresso, marcações e notas em todos os aparelhos', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Recomendações pelo seu gosto', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Baixar EPUB', leitor: true, novelo: true, trama: true, tear: true },
    { nome: 'Pedir tradução de um livro em domínio público', leitor: false, novelo: '1 por mês', trama: '3 por mês', tear: '8 por mês', em_breve: true },
    { nome: 'Pular a fila da esteira de tradução', leitor: false, novelo: false, trama: false, tear: true, em_breve: true },
    { nome: 'Leitura em voz alta no navegador', leitor: false, novelo: true, trama: true, tear: true, em_breve: true },
  ] },
  { grupo: 'Publicar', itens: [
    { nome: 'Publicar livros e quadrinhos (mangá, manhwa, HQ)', leitor: false, novelo: false, trama: true, tear: true },
    { nome: 'Obras publicadas ao mesmo tempo', leitor: false, novelo: false, trama: '3', tear: '20' },
    { nome: 'Capítulos por obra', leitor: false, novelo: false, trama: '40', tear: '400' },
    { nome: 'Páginas de quadrinho por capítulo', leitor: false, novelo: false, trama: '80', tear: '150' },
    { nome: 'Espaço para imagens', leitor: false, novelo: false, trama: '300 MB', tear: '3 GB' },
    { nome: 'Capa própria', leitor: false, novelo: false, trama: true, tear: true },
    { nome: 'Leituras de cada obra e de cada capítulo', leitor: false, novelo: false, trama: true, tear: true },
    { nome: 'Destaque na vitrine da comunidade', leitor: false, novelo: false, trama: false, tear: '1 por mês', em_breve: true },
    { nome: 'Parte da receita para criadores (por leitura)', leitor: false, novelo: false, trama: true, tear: true, em_breve: true },
  ] },
  { grupo: 'A casa', itens: [
    { nome: 'Selo de apoiador no perfil e nas resenhas', leitor: false, novelo: true, trama: true, tear: true, em_breve: true },
    { nome: 'Novidades antes de todo mundo', leitor: false, novelo: false, trama: true, tear: true, em_breve: true },
    { nome: 'Voto no que a casa traduz a seguir', leitor: false, novelo: true, trama: true, tear: true, em_breve: true },
  ] },
]

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
      const { publicar, ...resto } = PLANOS[k]
      return { ...resto, publica: !!publicar }
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
