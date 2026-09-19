// Rotas dos quadrinhos: a vitrine dos que hospedamos e o catálogo de
// descoberta de mangá, manhwa e manhua modernos (servidor/mangas.mjs), que
// NÃO hospeda nada — consulta o AniList na hora e aponta onde ler oficialmente.

import * as extras from '../extras.mjs'
import * as mangas from '../mangas.mjs'
import * as mangaLista from '../manga-lista.mjs'

const MUITAS = 'Muitas buscas seguidas. Espere um instante.'

export default function rotasDeQuadrinhos({ rota, banco, estatico }) {
  rota({ caminho: '/api/quadrinhos/vitrine' }, () => extras.vitrineQuadrinhos(banco, estatico))

  // Público, com freio por faixa de IP. A lista e a ficha consultam o AniList
  // com cache; o navegador pode guardar a resposta por 10 minutos.
  const descoberta = { freio: { acao: 'mangas', por: 'ip', msg: MUITAS }, cache: 'public, max-age=600', erro500: 'O catálogo de mangás não respondeu.' }
  rota({ caminho: '/api/mangas', ...descoberta }, ({ busca }) => mangas.listar(busca))
  // "Minha lista" (servidor/manga-lista.mjs): da conta, e só guarda o que o AniList mostra
  const freioLista = { acao: 'guardar-extra', msg: 'Muitas mudanças seguidas na lista. Espere um pouco.' }
  rota({ caminho: '/api/mangas/lista', acesso: 'conta' }, ({ pessoa }) => mangaLista.listar(banco, pessoa.id))
  rota({ metodo: 'POST', caminho: '/api/mangas/lista', acesso: 'conta', freio: freioLista }, ({ pessoa, dado }) => mangaLista.por(banco, pessoa.id, dado))
  rota({ metodo: 'POST', caminho: '/api/mangas/lista/tirar', acesso: 'conta', freio: freioLista }, ({ pessoa, dado }) => mangaLista.tirar(banco, pessoa.id, dado))
  rota({ caminho: '/api/mangas/:id', ...descoberta }, ({ params }) => mangas.detalhe(params.id))
  // A capa passa por aqui para o navegador não falar com terceiros; o proxy só
  // aceita o CDN de capas do AniList e nomes de arquivo de imagem.
  rota({ caminho: '/api/capa-manga/:tamanho(medium|large)/:arquivo([\\w.-]+\\.(?:jpe?g|png|webp))', cru: true, erro500: 'O catálogo de mangás não respondeu.' },
    ({ res, params }) => mangas.servirCapa(res, params.tamanho, params.arquivo))
}
