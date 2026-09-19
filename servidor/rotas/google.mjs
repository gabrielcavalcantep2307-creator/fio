// Entrar com o Google (servidor/google.mjs). As duas primeiras são
// redirecionamentos, não JSON: o navegador vai e volta do Google.

import * as google from '../google.mjs'
import { Recusa } from '../contas.mjs'
import { NOME_COOKIE, SEGURO, cookie, lerCookie, redirecionar } from '../http/pedido.mjs'

// Cookie de 10 minutos que amarra a volta ao navegador que começou (o estado
// do OAuth mora no servidor; o cookie é a metade que prova que é o mesmo).
const NOME_G = SEGURO ? '__Host-fio-g' : 'fio-g'

export default function rotasDoGoogle({ rota, banco, site, quemE }) {
  const erro = (e, padrao) => `/entrar-google.html?erro=${encodeURIComponent(e instanceof Recusa ? e.message : padrao)}`

  // (o freio desta fica dentro de google.comecar, por faixa de IP)
  rota({ caminho: '/api/google/entrar', cru: true }, ({ req, res, busca, ip }) => {
    try {
      const atual = quemE(req)
      const modo = busca.get('modo') === 'vincular' ? 'vincular' : 'entrar'
      if (modo === 'vincular' && !atual) throw new Recusa('Entre na sua conta antes de ligar o Google.', 401)
      const { url, navegador } = google.comecar(banco, {
        modo, volta: busca.get('volta'), leitorId: atual?.id ?? null, ip,
        redirectUri: google.enderecoDeVolta(req.headers.host, site),
      })
      redirecionar(res, url, [cookie(NOME_G, navegador, 600)])
    } catch (e) { redirecionar(res, erro(e, 'Não deu para falar com o Google agora.')) }
  })

  rota({ caminho: '/api/google/volta', cru: true }, async ({ req, res, busca, ip, agente }) => {
    try {
      if (busca.get('error')) throw new Recusa(busca.get('error') === 'access_denied' ? 'Você cancelou a entrada pelo Google.' : 'O Google recusou a entrada.')
      const volta = await google.receber({ code: busca.get('code'), state: busca.get('state'), navegador: lerCookie(req, NOME_G) })
      const atual = quemE(req)
      // vincular só vale se quem voltou é a MESMA conta que começou
      const leitorId = volta.modo === 'vincular' && atual?.id === volta.leitorId ? atual.id : null
      const r = await google.resolver(banco, { perfil: volta.perfil, modo: volta.modo, leitorId }, { ip, agente })
      const cookies = [cookie(NOME_G, '', 0)]
      if (r.sessao) cookies.push(cookie(NOME_COOKIE, r.sessao.token, r.sessao.dias * 24 * 3600))
      redirecionar(res, r.vinculou ? '/conta.html#seguranca' : r.novo ? '/central.html' : volta.volta, cookies)
    } catch (e) { redirecionar(res, erro(e, 'Não deu para entrar com o Google agora.'), [cookie(NOME_G, '', 0)]) }
  })

  rota({ caminho: '/api/google/ligado' }, () => ({ disponivel: google.configurado() }))
  rota({ caminho: '/api/google', acesso: 'conta' }, ({ pessoa }) => google.situacao(banco, pessoa.id))
  rota({ metodo: 'POST', caminho: '/api/google/senha', acesso: 'conta', freio: { acao: 'senha-extra', msg: 'Muitas tentativas. Tente daqui a pouco.' } },
    ({ pessoa, dado }) => google.definirSenha(banco, pessoa.id, dado))
  rota({ metodo: 'POST', caminho: '/api/google/desligar', acesso: 'conta' }, ({ pessoa }) => google.desligar(banco, pessoa.id))
}
