// Convites e administração — as duas coisas que só se fazem pela linha de
// comando, de propósito.
//
//   node servidor/convite.mjs                      # gera um convite
//   node servidor/convite.mjs "para o Ravi"        # com uma nota
//   node servidor/convite.mjs --listar             # quem entrou, e por qual
//   node servidor/convite.mjs --admin fulano@x.com # promove alguém
//
// Por que não tem tela para isso: a primeira conta de um sistema fechado é o
// problema do ovo e da galinha — uma tela de "criar o primeiro admin" fica
// aberta na internet até alguém achar. Aqui, quem tem acesso à máquina é
// quem convida, e é assim que a biblioteca continua sendo de quem é.

import { abrir, fechar } from './banco/base.mjs'
import { criarConvite } from './contas.mjs'

const banco = abrir()
const arg = process.argv[2]

if (arg === '--listar') {
  console.log('CONTAS')
  for (const l of banco.prepare(
    `SELECT id, nome, email, papel, criado_em, visto_em, desativado FROM leitor ORDER BY id`).all()) {
    console.log(`  ${String(l.id).padStart(3)} ${l.papel.padEnd(7)} ${l.email.padEnd(30)} ${l.nome}` +
      `${l.desativado ? '  [desativada]' : ''}  visto: ${l.visto_em ?? 'nunca'}`)
  }

  console.log('\nCONVITES')
  for (const c of banco.prepare(
    `SELECT c.id, c.criado_em, c.expira_em, c.usado_em, c.nota, l.email
       FROM convite c LEFT JOIN leitor l ON l.id = c.usado_por ORDER BY c.id`).all()) {
    // `expira_em` vem como "2026-09-09 12:00:00" e o ISO do JS traz um "T"
    // no lugar do espaço. Como " " < "T", todo convite que vence HOJE aparecia
    // vencido, ainda que faltassem doze horas. Compara-se no mesmo formato.
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const estado = c.usado_em ? `usado por ${c.email}`
      : c.expira_em < agora ? 'vencido' : 'aberto'
    console.log(`  ${String(c.id).padStart(3)} ${estado.padEnd(34)} ${c.nota ?? ''}`)
  }

  console.log('\nSESSÕES ABERTAS')
  for (const s of banco.prepare(
    `SELECT l.email, s.criado_em, s.visto_em, s.ip_dica, s.agente FROM sessao s
       JOIN leitor l ON l.id = s.leitor_id ORDER BY s.visto_em DESC`).all()) {
    console.log(`  ${s.email.padEnd(28)} ${s.ip_dica ?? '?'}  ${String(s.agente ?? '').slice(0, 40)}`)
  }

} else if (arg === '--revogar') {
  const id = Number(process.argv[3])
  if (!id) { console.error('uso: --revogar <id do convite>'); process.exit(1) }
  // Só convite ainda não usado. Apagar um convite JÁ usado apagaria a única
  // linha que conta como aquela pessoa entrou nesta biblioteca.
  const r = banco.prepare('DELETE FROM convite WHERE id = ? AND usado_em IS NULL').run(id)
  console.log(r.changes ? `convite ${id} cancelado` : `convite ${id} não existe, ou já foi usado`)

} else if (arg === '--varios') {
  // Convidar quatro amigos numa tarde não devia ser quatro sessões de SSH.
  const quantos = Math.min(Math.max(Number(process.argv[3]) || 3, 1), 20)
  console.log('')
  for (let i = 0; i < quantos; i++) {
    const { codigo } = criarConvite(banco, { nota: process.argv[4] ?? null })
    console.log(`  ${codigo}`)
  }
  console.log('')
  console.log(`  ${quantos} convites, uso único cada um.`)
  console.log('  Esta é a única vez que eles aparecem.')
  console.log('')

} else if (arg === '--admin') {
  const email = process.argv[3]
  if (!email) { console.error('uso: --admin <email>'); process.exit(1) }
  const r = banco.prepare('UPDATE leitor SET papel = ? WHERE email = ?').run('admin', email.toLowerCase())
  console.log(r.changes ? `${email} agora é admin` : `não achei ${email}`)

} else {
  const { codigo, dias } = criarConvite(banco, { nota: arg ?? null })
  console.log(`\n  ${codigo}\n`)
  console.log(`  uso único, vale ${dias} dias.`)
  console.log('  Esta é a única vez que este código aparece: no banco fica só o resumo dele.\n')
}

fechar()
