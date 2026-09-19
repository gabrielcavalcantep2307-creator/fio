// O diário do painel: tudo que a administração FEZ, com quem, quando e de onde.
//
// Toda rota `acesso: 'admin'` que escreve (POST) deixa uma linha aqui, pelo
// roteador — nenhuma rota precisa lembrar de registrar. Entrar na conta de
// administração também (contas.abrirSessao). A aba Controle mostra as últimas.
//
// Para que serve: se um dia alguém entrar no painel, é aqui que se vê o que
// essa pessoa mexeu. E no dia a dia, "quem desligou a esteira?" tem resposta.
//
// O que NÃO guarda: senha, texto longo, arquivo. Do pedido fica só um resumo
// dos campos (60 letras cada) e do IP só o começo, como no resto do Fio.

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS diario_painel (
    id INTEGER PRIMARY KEY,
    quando TEXT NOT NULL DEFAULT (datetime('now')),
    leitor_id INTEGER,
    usuario TEXT,
    acao TEXT NOT NULL,
    resumo TEXT,
    de TEXT)`)
}

const ESCONDER = /senha|segredo|token|chave|resposta/i

/** O pedido em poucas palavras: `{ pausada: true }` → "pausada=true". */
export function resumir(dado) {
  if (!dado || typeof dado !== 'object') return null
  const partes = []
  for (const [k, v] of Object.entries(dado).slice(0, 8)) {
    let valor
    if (ESCONDER.test(k)) valor = '•••'
    else if (Array.isArray(v)) valor = `[${v.length} ${v.length === 1 ? 'item' : 'itens'}]`
    else if (v && typeof v === 'object') valor = '{…}'
    else valor = String(v).replace(/\s+/g, ' ').slice(0, 60)
    partes.push(`${k}=${valor}`)
  }
  return partes.join(' · ').slice(0, 400) || null
}

export function registrar(banco, { pessoa, acao, resumo = null, de = null }) {
  garantirTabelas(banco)
  banco.prepare('INSERT INTO diario_painel (leitor_id, usuario, acao, resumo, de) VALUES (?,?,?,?,?)')
    .run(pessoa?.id ?? null, pessoa?.usuario ?? null, String(acao).slice(0, 120), resumo, de)
  // um ano de histórico basta; o resto sai sozinho
  banco.prepare(`DELETE FROM diario_painel WHERE quando < datetime('now', '-365 days')`).run()
}

export function ultimos(banco, quantos = 30) {
  garantirTabelas(banco)
  return banco.prepare('SELECT quando, usuario, acao, resumo, de FROM diario_painel ORDER BY id DESC LIMIT ?').all(quantos)
}

// O nome humano de cada rota do painel, para o diário ler como frase.
const NOMES = {
  '/api/admin/esteira/pausa': 'ligou/desligou a esteira',
  '/api/ajustes': 'mudou as configurações',
  '/api/fila': 'pôs livros na fila',
  '/api/fila/remover': 'tirou um livro da fila',
  '/api/fila/retentar': 'mandou tentar de novo',
  '/api/convite': 'criou um convite',
  '/api/admin/publicacao': 'decidiu uma publicação',
  '/api/admin/correcao': 'decidiu uma correção',
  '/api/admin/correcoes/revisado': 'marcou livro como revisado',
  '/api/admin/assinatura': 'mudou uma assinatura',
  '/api/admin/curadoria/obra': 'editou um livro',
  '/api/admin/curadoria/serie': 'editou um quadrinho',
  '/api/admin/curadoria/capa': 'trocou uma capa',
}
export const nomeDaAcao = (caminho) => NOMES[caminho] ?? caminho
