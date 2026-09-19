// Rotas da conta: entrar, sair, recuperar, e o que a pessoa muda em si mesma.

import * as contas from '../contas.mjs'
import { Recusa } from '../contas.mjs'
import { conferirUsuario, estaTomado } from '../usuario.mjs'
import * as ajustes from '../ajustes.mjs'
import * as planos from '../planos.mjs'
import * as acesso from '../acesso.mjs'
import * as extras from '../extras.mjs'
import { porCookie, semCookie, lerCookie } from '../http/pedido.mjs'

export default function rotasDeConta({ rota, banco }) {
  rota({ caminho: '/api/saude' }, () => ({ ok: true, versao: 1, convite: ajustes.cadastroAberto(banco) ? 'opcional' : 'obrigatorio' }))

  rota({ caminho: '/api/eu', acesso: 'conta' }, ({ pessoa }) => ({ pessoa }))

  rota({ metodo: 'POST', caminho: '/api/criar' }, async ({ res, dado, ip, agente }) => {
    const { pessoa, sessao } = await contas.criar(banco, dado, { ip, agente })
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  })

  rota({ metodo: 'POST', caminho: '/api/entrar' }, async ({ res, dado, ip, agente }) => {
    const { pessoa, sessao } = await contas.entrar(banco, dado, { ip, agente })
    porCookie(res, sessao.token, sessao.dias)
    return { pessoa }
  })

  rota({ metodo: 'POST', caminho: '/api/sair' }, ({ req, res }) => {
    contas.sair(banco, lerCookie(req))
    semCookie(res)
    return { ok: true }
  })

  // ── esqueci a senha, sem e-mail ──
  //
  // O link por e-mail saiu: ele amarrava a conta a uma caixa de mensagens que
  // não é nossa, e quem tinha o e-mail invadido perdia a conta junto. No
  // lugar, o que a pessoa SABE. Duas rotas: uma diz quais são as perguntas
  // daquele endereço, a outra recebe as respostas e a senha nova de uma vez —
  // o "pode trocar" nunca existe como estado, então não há o que roubar.
  rota({ metodo: 'POST', caminho: '/api/perguntas' }, ({ dado, ip, agente }) => contas.perguntasParaRecuperar(banco, dado, { ip, agente }))
  rota({ metodo: 'POST', caminho: '/api/responder' }, async ({ res, dado, ip, agente }) => {
    await contas.recuperarComRespostas(banco, dado, { ip, agente })
    semCookie(res)
    return { ok: true }
  })

  /** As sugestões para a tela de cadastro montar a escolha. */
  rota({ caminho: '/api/sugestoes' }, () => contas.perguntasSugeridas())

  // ── o nome está livre? ──
  //
  // Diz que um nome existe, e isso é de propósito: nome de usuário é público
  // por natureza. O que ela NÃO diz é de quem é, e o freio vale porque varrer
  // nomes para montar a lista de quem tem conta continua sendo varredura.
  rota({ caminho: '/api/nome-livre', freio: { acao: 'nome-livre', por: 'ip', msg: 'Muitas consultas. Espere um pouco.' } }, ({ busca }) => {
    const u = String(busca.get('u') ?? '').trim()
    const problema = conferirUsuario(u)
    if (problema) return { livre: false, motivo: problema }
    return estaTomado(banco, u) ? { livre: false, motivo: 'Esse nome já está em uso. Escolha outro.' } : { livre: true }
  })

  // NÃO existe rota de "força da senha", e é decisão: a régua é pura
  // (`avaliarSenha`) e roda no navegador. A senha atravessa a rede UMA vez.

  // ── a conta por dentro ──
  //
  // Trocar a senha derruba todas as sessões, inclusive esta, e devolve um
  // cookie novo na mesma resposta: quem trocou continua dentro, o resto cai.
  rota({ metodo: 'POST', caminho: '/api/minha-senha', acesso: 'conta' }, async ({ res, pessoa, dado, ip, agente }) => {
    const { sessao } = await contas.trocarMinhaSenha(banco, pessoa.id, dado, { ip, agente })
    porCookie(res, sessao.token, sessao.dias)
    return { ok: true }
  })
  rota({ metodo: 'POST', caminho: '/api/meu-nome', acesso: 'conta' }, ({ pessoa, dado }) => contas.mudarNome(banco, pessoa.id, dado))
  /** As MINHAS perguntas: o texto delas, nunca as respostas. */
  rota({ caminho: '/api/minhas-perguntas', acesso: 'conta' }, ({ pessoa }) => ({ perguntas: contas.minhasPerguntas(banco, pessoa.id) }))
  // Trocar as perguntas exige a senha atual: é justamente como alguém sentado
  // num computador aberto tomaria a conta para sempre.
  rota({ metodo: 'POST', caminho: '/api/minhas-perguntas', acesso: 'conta' },
    ({ pessoa, dado, ip, agente }) => contas.trocarMinhasPerguntas(banco, pessoa.id, dado, { ip, agente }))
  rota({ caminho: '/api/meus-aparelhos', acesso: 'conta' }, ({ req, pessoa }) => contas.minhasSessoes(banco, pessoa.id, lerCookie(req)))
  rota({ metodo: 'POST', caminho: '/api/sair-dos-outros', acesso: 'conta' }, ({ req, pessoa }) => contas.sairDosOutros(banco, pessoa.id, lerCookie(req)))
  rota({ metodo: 'POST', caminho: '/api/sair-do-aparelho', acesso: 'conta' }, ({ pessoa, dado }) => extras.sairDoAparelho(banco, pessoa, dado))
  rota({ metodo: 'POST', caminho: '/api/meu-email', acesso: 'conta', freio: { acao: 'senha-extra' } }, ({ pessoa, dado }) => extras.mudarEmail(banco, pessoa, dado))

  rota({ caminho: '/api/minha-conta', acesso: 'conta' }, ({ pessoa }) => {
    const p = planos.planoDe(banco, pessoa)
    const uso = {
      livros: p.livrosMes === Infinity ? null : { ...acesso.usoDoMes(banco, pessoa.id), limite: acesso.livrosGratis(banco) },
      pedidos: { usados: acesso.pedidosDoMes(banco, pessoa.id), limite: p.pedidosMes },
    }
    return extras.resumoConta(banco, pessoa, { plano: p, uso })
  })

  // ── LGPD: levar embora, e apagar ──
  //
  // Art. 18, V: levar tudo embora, em formato legível. E sem apagar do lado
  // de cá, o "apagar tudo" seria mentira: a sincronia devolveria tudo.
  rota({ caminho: '/api/exportar', acesso: 'conta' }, ({ pessoa }) => contas.exportarTudo(banco, pessoa.id))
  rota({ metodo: 'POST', caminho: '/api/apagar-dados', acesso: 'conta' }, ({ pessoa }) => contas.apagarGuardado(banco, pessoa.id))
  rota({ metodo: 'POST', caminho: '/api/apagar-conta', acesso: 'conta' }, ({ res, pessoa, dado }) => {
    // Exige digitar a identidade da conta — o nome de usuário ou o e-mail.
    // Apagar é irreversível, e um clique sozinho não é consentimento.
    const digitado = String(dado.email ?? dado.usuario ?? '').trim().toLowerCase()
    const aceitos = [pessoa.email, pessoa.usuario].filter(Boolean).map((x) => String(x).toLowerCase())
    if (!digitado || !aceitos.includes(digitado)) {
      throw new Recusa('Digite o seu nome de usuário (ou o e-mail da conta) para confirmar.')
    }
    contas.apagarConta(banco, pessoa.id)
    semCookie(res)
    return { ok: true }
  })
}
