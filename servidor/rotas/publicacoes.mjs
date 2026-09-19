// Rotas das publicações da comunidade (servidor/publicacoes.mjs).
//
// Escrever exige conta, plano que publica e passa por freio. Ler é público,
// mas só o que a administração aprovou.

import * as publicacoes from '../publicacoes.mjs'
import * as extras from '../extras.mjs'

const MUITAS = 'Muitas buscas seguidas. Espere um instante.'

export default function rotasDePublicacoes({ rota, banco }) {
  const escrita = { metodo: 'POST', acesso: 'conta', freio: { acao: 'publicar' } }

  rota({ caminho: '/api/minhas-publicacoes', acesso: 'conta' }, ({ pessoa }) => publicacoes.minhas(banco, pessoa))
  rota({ ...escrita, caminho: '/api/publicacao' }, ({ pessoa, dado }) => publicacoes.salvarObra(banco, pessoa, dado))
  rota({ ...escrita, caminho: '/api/publicacao/apagar' }, ({ pessoa, dado }) => publicacoes.apagarObra(banco, pessoa, dado.id))
  // capítulo de livro publicado pode ter 200 mil caracteres: teto maior só aqui
  rota({ ...escrita, caminho: '/api/publicacao/parte', teto: 2 * 1024 * 1024 }, ({ pessoa, dado }) => publicacoes.salvarParte(banco, pessoa, dado))
  rota({ ...escrita, caminho: '/api/publicacao/parte/apagar' }, ({ pessoa, dado }) => publicacoes.apagarParte(banco, pessoa, dado))
  rota({ ...escrita, caminho: '/api/publicacao/partes/ordem' }, ({ pessoa, dado }) => publicacoes.reordenarPartes(banco, pessoa, dado))
  rota({ ...escrita, caminho: '/api/publicacao/enviar' }, ({ pessoa, dado }) => publicacoes.enviar(banco, pessoa, dado))
  // Imagem crua no corpo, como o EPUB da estante. O que decide o tipo são os
  // bytes (servidor/imagem.mjs), nunca o cabeçalho.
  rota({ ...escrita, caminho: '/api/publicacao/imagem', freio: { acao: 'upload' }, corpo: 'binario', teto: publicacoes.TETO_UPLOAD + 1024, erro500: 'Não consegui guardar a imagem.' },
    ({ pessoa, busca, bytes }) => publicacoes.receberImagem(banco, pessoa, { id: busca.get('id'), uso: busca.get('uso') }, bytes))
  rota({ metodo: 'POST', caminho: '/api/publicacao/denunciar', acesso: 'conta', freio: { acao: 'denunciar' } }, ({ pessoa, dado }) => publicacoes.denunciar(banco, pessoa, dado))
  rota({ metodo: 'POST', caminho: '/api/publicacao/seguir', acesso: 'conta', freio: { acao: 'guardar-extra' } }, ({ pessoa, dado }) => extras.seguir(banco, pessoa, dado))

  rota({ caminho: '/api/publicacoes', freio: { acao: 'publicacoes', por: 'ip', msg: MUITAS } }, ({ quem, busca }) => publicacoes.listar(banco, quem(), busca))
  rota({ caminho: '/api/publicacao' }, ({ quem, busca }) => publicacoes.ficha(banco, quem(), busca.get('id')))
  rota({ caminho: '/api/publicacao/parte', freio: { acao: 'publicacoes', por: 'ip', msg: 'Muitos pedidos seguidos. Espere um instante.' } },
    ({ quem, busca }) => publicacoes.lerParte(banco, quem(), busca.get('id'), busca.get('ordem')))
  // O arquivo de imagem de uma publicação (capa ou página): quem pode ver é
  // decidido por publicacoes.podeVerArquivo — rascunho só o dono e a revisão.
  rota({ metodo: ['GET', 'HEAD'], caminho: '/api/pub-arquivo/:nome([^/]{1,80})', cru: true, erro500: 'erro' },
    ({ req, res, quem, params }) => publicacoes.servirArquivo(banco, quem(), req, res, params.nome))
}
