// O nome de usuário: o que vale, e por que a comparação não é a óbvia.
//
// ─────────────────────────────────────────────────────────────
// O PROBLEMA QUE ISTO RESOLVE
//
// Entrar por e-mail parece prático e tem dois defeitos. O primeiro é que o
// e-mail é o mesmo em toda a internet: quem descobre o seu aqui sabe onde te
// procurar em todo lugar. O segundo é que ele te obriga a ter um — e esta
// biblioteca não manda e-mail nenhum desde que a recuperação virou pergunta.
//
// Nome de usuário resolve os dois. Mas ele traz um risco que o e-mail não
// tinha, e é o risco de SE PASSAR POR ALGUÉM.
// ─────────────────────────────────────────────────────────────
//
// POR QUE A COMPARAÇÃO NÃO É `usuario = usuario`
//
// Numa biblioteca de amigos, o nome é o rosto. Se `gabriel` já existe e
// alguém consegue criar algo que se LÊ como `gabriel`, essa pessoa passa a
// assinar resenha com a cara do dono da casa. Comparar as letras cruas deixa
// isso passar de quatro jeitos:
//
//   CAIXA          `Gabriel` e `gabriel`
//   SEPARADOR      `ga.briel`, `ga_briel`, `ga-briel`
//   ACENTO         `gabriél`, que some ao ler rápido
//   ALFABETO       `gаbriel` com o "а" cirílico, que é OUTRO caractere e
//                  desenha exatamente igual
//
// O último é o pior porque é invisível. Por isso o conjunto de letras
// permitido é fechado em ASCII: não é xenofobia de teclado, é que um nome que
// ninguém consegue digitar olhando não serve como nome, e um nome que se
// disfarça de outro serve para o que não deve.
//
// A chave de unicidade, então, é o nome sem caixa, sem separador e sem nada
// que não seja letra ou número. `Ga.Briel` e `gabriel` colidem, e é isso que
// se quer.

/** O que se aceita escrever. Fechado, e por isso previsível. */
const PERMITIDO = /^[a-zA-Z][a-zA-Z0-9._-]{2,23}$/

/**
 * Nomes que a casa guarda para si.
 *
 * Metade é para não confundir gente ("admin", "suporte"), e metade é para não
 * confundir MÁQUINA: um nome igual a uma rota atrapalha o dia em que houver
 * `/u/<nome>`, e descobrir isso depois custa uma migração.
 */
const RESERVADOS = new Set([
  'admin', 'administrador', 'root', 'suporte', 'ajuda', 'contato', 'sistema',
  'fio', 'fiolib', 'biblioteca', 'oficial', 'equipe', 'moderador', 'mod',
  'api', 'www', 'app', 'site', 'static', 'assets', 'ativos', 'dados', 'capas',
  'login', 'entrar', 'sair', 'criar', 'cadastro', 'conta', 'contas', 'senha',
  'null', 'undefined', 'anonimo', 'anônimo', 'ninguem', 'ninguém', 'eu',
  'novo', 'teste', 'test', 'user', 'usuario', 'usuário', 'me',
])

/**
 * A chave de unicidade: o nome reduzido ao que ele PARECE.
 *
 * NFKD separa a letra do acento, e a faixa combinante sai fora; o que não for
 * letra ou número ASCII cai junto. O que sobra é o desenho do nome.
 */
export const chaveDe = (u) => String(u ?? '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

/**
 * Este nome pode ser usado? Devolve `null` quando sim, e o motivo quando não.
 *
 * As mensagens são específicas de propósito. "Nome inválido" faz a pessoa
 * tentar de novo no escuro, e tentar no escuro é o que enche o freio de
 * tentativas legítimas.
 */
export function conferirUsuario(bruto) {
  const u = String(bruto ?? '').trim()
  if (!u) return 'Escolha um nome de usuário.'
  if (u.length < 3) return 'O nome precisa de pelo menos 3 letras.'
  if (u.length > 24) return 'O nome pode ter no máximo 24 letras.'

  if (!/^[a-zA-Z]/.test(u)) return 'O nome tem que começar com uma letra.'
  if (!PERMITIDO.test(u)) {
    return 'Use só letras sem acento, números, ponto, hífen e sublinhado. '
      + 'É para ninguém conseguir criar um nome que se lê igual ao seu.'
  }
  if (/[._-]$/.test(u)) return 'O nome não pode terminar em ponto, hífen ou sublinhado.'
  if (/[._-]{2,}/.test(u)) return 'Não repita ponto, hífen ou sublinhado seguidos.'

  const chave = chaveDe(u)
  if (chave.length < 3) return 'Tem pontuação demais; sobram menos de 3 letras.'
  if (RESERVADOS.has(chave)) return 'Esse nome é reservado. Escolha outro.'

  // "usuario123" é um nome, "123456" não é: um nome só de dígitos é
  // indistinguível de um id, e um dia alguém vai tratá-lo como um.
  if (/^\d+$/.test(chave)) return 'Um nome só de números confunde com o número da conta.'

  return null
}

/** O nome já está tomado? A pergunta é feita sobre a CHAVE, nunca sobre o texto. */
export const estaTomado = (banco, usuario, exceto = null) => Boolean(banco.prepare(
  'SELECT 1 FROM leitor WHERE usuario_chave = ? AND (? IS NULL OR id <> ?)')
  .get(chaveDe(usuario), exceto, exceto))

export { RESERVADOS }
