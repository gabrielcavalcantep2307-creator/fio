// Rotas do que é de cada leitor: estante, o que ele guardou entre aparelhos,
// gosto e recomendações, avisos, meta do ano, planos e pedidos de tradução.
//
// Tudo preso ao id de QUEM PEDE: nenhuma destas rotas aceita id de leitor
// vindo de fora. O questionário só grava escolha de lista fechada
// (`gosto.limparRespostas`), e os links dos avisos são montados aqui, nunca
// recebidos.

import * as contas from '../contas.mjs'
import * as meusLivros from '../meus-livros.mjs'
import * as gosto from '../gosto.mjs'
import * as planos from '../planos.mjs'
import * as acesso from '../acesso.mjs'
import * as esteira from '../esteira.mjs'
import * as extras from '../extras.mjs'

export default function rotasDoLeitor({ rota, banco, estatico }) {
  // Recomendação custa uma passada pelo acervo legível; guardada por leitor
  // até alguma coisa dele mudar (leitura nova, nota, gosto) ou dez minutos.
  const recsGuardadas = new Map()
  function recomendacoesDe(leitorId) {
    const indice = gosto.indiceDoSite(estatico)
    if (!indice) return { obras: [], semSinais: true, pedir: false }
    const sinais = gosto.lerSinais(banco, leitorId)
    const marca = [
      Math.max(0, ...[...sinais.progresso.values()].map((p) => p.mudouEm ?? 0), ...[...sinais.estante.values()].map((e) => e.mudouEm ?? 0)),
      sinais.notas.size, sinais.gostoMudou, indice.legiveis.length,
    ].join('|')
    const g = recsGuardadas.get(leitorId)
    if (g && g.marca === marca && Date.now() - g.em < 10 * 60000) return g.valor
    const valor = { ...gosto.recomendar(indice, sinais), pedir: sinais.pedido }
    recsGuardadas.set(leitorId, { marca, em: Date.now(), valor })
    if (recsGuardadas.size > 2000) recsGuardadas.clear()
    return valor
  }

  // ── a estante particular: o trilho C ──
  rota({ caminho: '/api/meus-livros', acesso: 'conta' }, ({ pessoa }) => ({ livros: meusLivros.meus(banco, pessoa.id) }))
  rota({ metodo: 'POST', caminho: '/api/apagar-meu-livro', acesso: 'conta' }, ({ pessoa, dado }) => meusLivros.apagar(banco, pessoa.id, Number(dado.obra)))
  // O EPUB vem CRU no corpo e o nome no cabeçalho: sem multipart de propósito —
  // multipart exigiria um analisador de formulário aqui dentro, mais código
  // lendo o que estranho manda.
  rota({ metodo: 'POST', caminho: '/api/meu-livro', acesso: 'conta', corpo: 'binario', teto: meusLivros.TETO_BYTES, erro500: 'Não consegui guardar este livro.' },
    ({ req, pessoa, bytes }) => meusLivros.guardar(banco, pessoa.id, bytes, {
      nomeArquivo: decodeURIComponent(String(req.headers['x-arquivo'] ?? '')).slice(0, 200),
    }))

  // ── o que o leitor guardou, entre aparelhos ──
  rota({ caminho: '/api/meus-dados', acesso: 'conta' }, ({ pessoa }) => contas.lerGuardado(banco, pessoa.id))
  rota({ metodo: 'POST', caminho: '/api/meus-dados', acesso: 'conta' }, ({ pessoa, dado }) => contas.guardar(banco, pessoa.id, dado))

  // ── meta do ano e quadrinhos na conta ──
  rota({ caminho: '/api/meta', acesso: 'conta' }, ({ pessoa, busca }) => extras.meta(banco, pessoa, busca.get('ano')))
  rota({ metodo: 'POST', caminho: '/api/meta', acesso: 'conta', freio: { acao: 'guardar-extra' } }, ({ pessoa, dado }) => extras.definirMeta(banco, pessoa, dado))
  rota({ caminho: '/api/quadrinhos/progresso', acesso: 'conta' }, ({ pessoa }) => extras.progressoQuadrinhos(banco, pessoa))
  rota({ metodo: 'POST', caminho: '/api/quadrinhos/progresso', acesso: 'conta', freio: { acao: 'guardar-extra' } },
    ({ pessoa, dado }) => extras.guardarProgressoQuadrinho(banco, pessoa, dado))

  // ── gosto, recomendações e avisos ──
  rota({ caminho: '/api/gosto', acesso: 'conta' }, ({ pessoa }) => {
    const s = gosto.lerSinais(banco, pessoa.id)
    return {
      respostas: s.respostas,
      pedir: s.pedido,
      opcoes: {
        humores: gosto.HUMORES.map(({ chave, rotulo }) => ({ chave, rotulo })),
        autores: gosto.AUTORES.map((a) => a.rotulo),
        vitrine: gosto.VITRINE,
        tempos: gosto.TEMPOS.map(({ chave, rotulo }) => ({ chave, rotulo })),
        evitar: gosto.EVITAR,
      },
    }
  })
  rota({ metodo: 'POST', caminho: '/api/gosto', acesso: 'conta' }, ({ pessoa, dado }) => {
    const respostas = gosto.limparRespostas(dado)
    banco.prepare(`
      INSERT INTO gosto (leitor_id, respostas, respondido_em, mudou_em) VALUES (?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(leitor_id) DO UPDATE SET respostas = excluded.respostas,
        respondido_em = datetime('now'), mudou_em = datetime('now')`).run(pessoa.id, JSON.stringify(respostas))
    recsGuardadas.delete(pessoa.id)
    gosto.avisar(banco, pessoa.id, { chave: 'boasvindas', tipo: 'boasvindas',
      titulo: 'Suas primeiras recomendações estão prontas',
      corpo: 'Elas mudam conforme você lê: o que você lê pesa mais do que o que você disse.', link: '/central.html' })
    return { ok: true, respostas, ...recomendacoesDe(pessoa.id) }
  })
  rota({ caminho: '/api/recomendacoes', acesso: 'conta' }, ({ pessoa }) => recomendacoesDe(pessoa.id))

  rota({ caminho: '/api/avisos', acesso: 'conta' }, ({ pessoa }) => {
    gosto.gerarAvisos(banco, pessoa.id, gosto.indiceDoSite(estatico))
    const avisos = banco.prepare(`SELECT id, tipo, titulo, corpo, link, criado_em, lido_em IS NOT NULL lido
      FROM aviso WHERE leitor_id = ? ORDER BY criado_em DESC, id DESC LIMIT 60`).all(pessoa.id)
    return { avisos, naoLidos: avisos.filter((a) => !a.lido).length }
  })
  rota({ caminho: '/api/avisos/contagem', acesso: 'conta' }, ({ pessoa }) => {
    gosto.gerarAvisos(banco, pessoa.id, gosto.indiceDoSite(estatico))
    return { naoLidos: banco.prepare('SELECT COUNT(*) n FROM aviso WHERE leitor_id = ? AND lido_em IS NULL').get(pessoa.id).n }
  })
  rota({ metodo: 'POST', caminho: '/api/avisos/lido', acesso: 'conta' }, ({ pessoa, dado }) => {
    const r = Number.isInteger(dado.id)
      ? banco.prepare("UPDATE aviso SET lido_em = datetime('now') WHERE id = ? AND leitor_id = ? AND lido_em IS NULL").run(dado.id, pessoa.id)
      : banco.prepare("UPDATE aviso SET lido_em = datetime('now') WHERE leitor_id = ? AND lido_em IS NULL").run(pessoa.id)
    return { marcados: r.changes }
  })

  // ── assinaturas: a vitrine é pública; ninguém assina sozinho ainda ──
  rota({ caminho: '/api/planos' }, ({ quem }) => {
    const pessoa = quem()
    const v = planos.vitrine(banco, pessoa)
    if (pessoa && v.meu) {
      const p = planos.planoDe(banco, pessoa)
      v.meu.uso = {
        livros: p.livrosMes === Infinity ? null : { ...acesso.usoDoMes(banco, pessoa.id), limite: acesso.livrosGratis(banco) },
        pedidos: { usados: acesso.pedidosDoMes(banco, pessoa.id), limite: p.pedidosMes },
      }
      v.meu.voz = p.voz
      v.meu.epub = p.epub
      v.meu.quer = planos.interesseDe(banco, pessoa.id)
    }
    return v
  })

  // pedir um plano de presente enquanto não há pagamento (planos.querer)
  rota({ metodo: 'POST', caminho: '/api/planos/quero', acesso: 'conta', freio: { acao: 'guardar-extra' } },
    ({ pessoa, dado }) => planos.querer(banco, pessoa, String(dado.plano ?? ''), dado.motivo))

  // ── pedidos de tradução (servidor/esteira.mjs) ──
  rota({ caminho: '/api/pedidos-traducao', acesso: 'conta' }, ({ pessoa }) => {
    const p = planos.planoDe(banco, pessoa)
    return { pedidos: esteira.meusPedidos(banco, pessoa), usados: acesso.pedidosDoMes(banco, pessoa.id), limite: p.pedidosMes, plano: p.nome }
  })
  rota({ caminho: '/api/pedidos-traducao/buscar', acesso: 'conta', freio: { acao: 'buscar-gutenberg' } }, ({ busca }) => esteira.buscarLivro(busca.get('q')))
  rota({ metodo: 'POST', caminho: '/api/pedidos-traducao', acesso: 'conta', freio: { acao: 'pedir-traducao' } },
    ({ pessoa, dado }) => esteira.pedir(banco, pessoa, planos.planoDe(banco, pessoa), dado))
}
