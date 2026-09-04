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
    const estado = c.usado_em ? `usado por ${c.email}` : c.expira_em < new Date().toISOString() ? 'vencido' : 'aberto'
    console.log(`  ${String(c.id).padStart(3)} ${estado.padEnd(34)} ${c.nota ?? ''}`)
  }

  console.log('\nSESSÕES ABERTAS')
  for (const s of banco.prepare(
    `SELECT l.email, s.criado_em, s.visto_em, s.ip_dica, s.agente FROM sessao s
       JOIN leitor l ON l.id = s.leitor_id ORDER BY s.visto_em DESC`).all()) {
    console.log(`  ${s.email.padEnd(28)} ${s.ip_dica ?? '?'}  ${String(s.agente ?? '').slice(0, 40)}`)
  }

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
