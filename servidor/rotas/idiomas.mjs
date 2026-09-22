// Rotas do estudo de idiomas — exclusivo de quem tem o plano Tear.
//
// O curso em si (as unidades, o vocabulário, os quizzes) é estático — ver
// `../idiomas.mjs`. Aqui só a porta: confere o plano, entrega o curso a
// quem pode, e guarda o progresso de quem estuda.

import * as idiomas from '../idiomas.mjs'
import * as planos from '../planos.mjs'
import { Recusa } from '../contas.mjs'

/** Só quem tem Tear passa daqui — a mesma checagem em toda rota do arquivo. */
function soTear(banco, pessoa) {
  if (planos.planoDe(banco, pessoa).chave !== 'tear') {
    throw new Recusa('O estudo de idiomas é uma área do plano Tear.', 402)
  }
}

export default function rotasDeIdiomas({ rota, banco }) {
  // A lista dos sete, para o cartão da aba — sem plano nenhum, todo mundo vê
  // o que existe (é o que faz a pessoa querer assinar). O CONTEÚDO exige Tear.
  rota({ caminho: '/api/idiomas' }, () => ({ idiomas: idiomas.listaIdiomas() }))

  rota({ caminho: '/api/idiomas/:idioma', acesso: 'conta' }, ({ pessoa, params }) => {
    soTear(banco, pessoa)
    const curso = idiomas.cursoDe(params.idioma)
    if (!curso) throw new Recusa('Não temos este idioma.', 404)
    return {
      curso,
      progresso: idiomas.progressoDe(banco, pessoa.id, params.idioma),
      revisao: idiomas.filaDeRevisao(banco, pessoa.id, params.idioma),
    }
  })

  rota({ metodo: 'POST', caminho: '/api/idiomas/:idioma/concluir', acesso: 'conta' }, ({ pessoa, params, dado }) => {
    soTear(banco, pessoa)
    const unidade = String(dado.unidade ?? '').slice(0, 80)
    const acertos = Math.max(0, Math.min(200, Number(dado.acertos) || 0))
    const total = Math.max(0, Math.min(200, Number(dado.total) || 0))
    if (!unidade) throw new Recusa('Falta dizer qual unidade.')
    idiomas.concluirUnidade(banco, pessoa.id, params.idioma, unidade, { acertos, total })
    return { ok: true }
  })

  // Cada revisão espaçada é UM item por pedido — o quiz de repetição manda um
  // por vez, à medida que a pessoa responde, para o SM-2 recalcular na hora.
  rota({ metodo: 'POST', caminho: '/api/idiomas/:idioma/revisar', acesso: 'conta' }, ({ pessoa, params, dado }) => {
    soTear(banco, pessoa)
    const item = String(dado.item ?? '').slice(0, 200)
    if (!item) throw new Recusa('Falta dizer qual item.')
    idiomas.revisarItem(banco, pessoa.id, params.idioma, item, Boolean(dado.acertou))
    return { ok: true }
  })
}
