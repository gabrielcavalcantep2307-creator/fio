// Rotas de leitura: o livro, o arquivo para levar, a busca dentro dos livros,
// o que está sendo lido, as notas e as correções da comunidade.

import * as contas from '../contas.mjs'
import { Recusa } from '../contas.mjs'
import * as acesso from '../acesso.mjs'
import * as planos from '../planos.mjs'
import * as curadoria from '../curadoria.mjs'
import * as correcoes from '../correcoes.mjs'
import * as extras from '../extras.mjs'
import { montarEpub, nomeDeArquivo } from '../epub.mjs'
import { montarPdf, nomeDeArquivoPdf } from '../pdf.mjs'
import { ondeComecaOLivro } from '../folha-de-rosto.mjs'
import { criarBuscaParalela } from '../busca-paralela.mjs'
import { diagramar } from '../diagramar.mjs'
import { notaDe, avisoDeOcr } from '../qualidade.mjs'
import { criarQuisDizer } from '../quis-dizer.mjs'
import { redirecionar } from '../http/pedido.mjs'

const CASA = process.env.FIO_JURISDICAO || 'BR'

/** O título do Gutenberg às vezes traz o subtítulo depois de uma quebra. */
const primeiraLinha = (s) => String(s ?? '').split(/[\r\n]/)[0].replace(/\s+/g, ' ').trim()

// Uma obra traduzida por nós tem DOIS textos: a nossa tradução em português
// e o original de que ela partiu, guardado para conferência. O que se entrega
// é sempre o português — a subconsulta escolhe, e não o acaso do JOIN.
const O_TEXTO_QUE_VALE = `t.id = (
    SELECT id FROM texto WHERE obra_id = o.id AND dono_id IS NULL
     ORDER BY (idioma = 'pt') DESC, normalizado DESC, id LIMIT 1)`

export default function rotasDeLeitura({ rota, banco }) {
  const buscarNoTexto = criarBuscaParalela(banco)
  const quisDizer = criarQuisDizer(banco, { jurisdicao: CASA })

  const doLivro = banco.prepare(`
    SELECT o.id, o.titulo, o.titulo_pt, t.id texto_id, t.fonte, t.fonte_url, t.normalizado,
           t.revisao, tr.nome tradutor,
           d.estado, d.motivo,
           (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
             WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
      FROM obra o
      JOIN texto t ON ${O_TEXTO_QUE_VALE}
      LEFT JOIN pessoa tr ON tr.id = t.tradutor_id
      LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
     WHERE o.id = ? AND o.publicada = 1`)

  const capitulosDo = banco.prepare('SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')

  const paraLeitura = banco.prepare(`
    SELECT o.id, o.titulo, o.titulo_pt, o.minutos_leitura, o.capa, o.capa_externa, o.trilho,
           t.id texto_id, t.fonte, t.revisao, t.aviso, t.fonte_url base_url, tr.nome tradutor, d.estado,
           p.id autor_id, p.nome autor
      FROM obra o
      JOIN texto t ON ${O_TEXTO_QUE_VALE}
      LEFT JOIN pessoa tr ON tr.id = t.tradutor_id
      LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE o.id = ? AND o.publicada = 1 AND t.normalizado = 1
     GROUP BY o.id`)

  // O mesmo, para o livro que é DO leitor (trilho C). Quem escolhe o texto é
  // `dono_id`; sem `publicada = 1`, porque livro particular nunca é publicado;
  // sem `direito`, porque a biblioteca não afirma nada sobre o arquivo de ninguém.
  const paraLeituraDoDono = banco.prepare(`
    SELECT o.id, o.titulo, o.titulo_pt, o.minutos_leitura, o.capa, o.capa_externa, o.trilho,
           t.id texto_id, 'meu' fonte, NULL revisao, NULL aviso, NULL base_url, NULL tradutor,
           'dominio_publico' estado,
           p.id autor_id, p.nome autor
      FROM obra o
      JOIN texto t ON t.obra_id = o.id AND t.dono_id = ?
      LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
      LEFT JOIN pessoa p ON p.id = op.pessoa_id
     WHERE o.id = ?
     GROUP BY o.id`)

  // A amostra (ver `acesso.mjs`): quem não pode ler o livro inteiro recebe os
  // capítulos até o primeiro capítulo de verdade e, no fim, um capítulo que
  // explica o porquê. O resto do texto simplesmente não sai daqui.
  function amostra(capitulos, decisao) {
    const comeca = ondeComecaOLivro(capitulos)
    const i = Math.max(0, capitulos.findIndex((c) => c.ordem === comeca))
    const ate = capitulos.slice(0, i + 1)
    const muro = acesso.capituloDoMuro(decisao)
    return [...ate, { ordem: (ate.at(-1)?.ordem ?? 0) + 1, titulo: muro.titulo, corpo: muro.corpo, palavras: 0 }]
  }

  // O livro diagramado, guardado na memória. Arrumar um livro leva de 20 ms a
  // meio segundo (os maiores), no processo que atende todo mundo: um livro
  // popular aberto por mil pessoas é arrumado uma vez só. Teto de 64 MB
  // (o container tem 320 MB) e validade de 30 minutos (a esteira pode
  // republicar um texto).
  const guardados = new Map()
  let bytesGuardados = 0
  const TETO_GUARDADO = 64 * 1024 * 1024
  function diagramado(o, meu, brutos) {
    const chave = `${meu ? 'meu' : 'casa'}:${o.texto_id}`
    const g = guardados.get(chave)
    if (g && Date.now() - g.em < 30 * 60_000) { guardados.delete(chave); guardados.set(chave, g); return g.caps }
    if (g) { guardados.delete(chave); bytesGuardados -= g.bytes }
    const caps = new Map(diagramar(brutos, { fonte: o.fonte }).map((c) => [c.ordem, c]))
    // texto em português cabe em 1 byte por letra na memória do V8 (Latin-1)
    let bytes = 0
    for (const c of caps.values()) bytes += c.corpo.length
    if (bytes < TETO_GUARDADO / 2) {
      guardados.set(chave, { em: Date.now(), caps, bytes })
      bytesGuardados += bytes
      for (const [k, v] of guardados) {
        if (bytesGuardados <= TETO_GUARDADO) break
        guardados.delete(k); bytesGuardados -= v.bytes
      }
    }
    return caps
  }

  // ── o livro inteiro, para o leitor ──
  //
  // O direito é conferido AQUI de novo. `obra.trilho` é rótulo de tela; a
  // regra é a tabela `direito`. E trilho C primeiro: se a obra é um arquivo
  // DESTA pessoa, é o texto dela que se entrega — consultar o acervo público
  // antes daria, para um livro que existe nos dois lugares, a cópia errada.
  rota({ caminho: '/api/livro/:id' }, ({ params, quem }) => {
    const pessoa = quem()
    const meu = pessoa ? paraLeituraDoDono.get(pessoa.id, params.id) : null
    const o = meu ?? paraLeitura.get(CASA, params.id)
    if (!o) throw new Recusa('Não temos o texto desta obra.', 404)
    if (!meu && curadoria.obraOculta(banco, params.id)) throw new Recusa('Não temos o texto desta obra.', 404)
    if (!meu && o.estado !== 'dominio_publico' && o.estado !== 'licenca_livre') throw new Recusa('Esta obra não pode ser lida aqui.', 403)
    let capitulos = capitulosDo.all(o.texto_id)
    if (!capitulos.length) throw new Recusa('Não temos o texto desta obra.', 404)

    // O limite do plano. Nunca para o livro que é do próprio leitor, nunca
    // para lei. Quem não pode ler inteiro recebe a amostra.
    let limitado = null
    if (!meu) {
      const decisao = acesso.decidir(banco, pessoa, o.id, { ehLei: o.fonte === 'planalto' })
      if (!decisao.pode) { capitulos = amostra(capitulos, decisao); limitado = decisao.motivo }
    }
    const comecaEm = ondeComecaOLivro(capitulos)
    // o texto como página de livro: frase cortada emendada, título, epígrafe
    // (diagramar.mjs), arrumado uma vez por livro e guardado
    // A amostra arruma só o que mostra: um livro de 18 MB não pode custar
    // segundos para entregar um capítulo a quem nem tem conta.
    if (limitado) capitulos = diagramar(capitulos, { fonte: o.fonte })
    else {
      const prontos = diagramado(o, meu, capitulos)
      capitulos = capitulos.map((c) => prontos.get(c.ordem) ?? diagramar([c], { fonte: o.fonte })[0])
    }
    return {
      id: o.id,
      titulo: primeiraLinha(o.titulo_pt || o.titulo),
      autor: o.autor ?? 'autoria não identificada',
      autorId: o.autor_id,
      ano: null,
      trilho: 'A',
      minutos: o.minutos_leitura,
      temas: [],
      capa: o.capa, capaOL: o.capa_externa,
      textoId: o.texto_id,
      // Em que capítulo entrar quando não há marca de onde parou (sem isto o
      // leitor abre na folha de rosto do editor em 582 obras).
      comecaEm,
      // O defeito DESTA digitalização, dito antes de o leitor estranhar o texto.
      // (e, sem aviso escrito à mão, o da nota do OCR: qualidade.mjs)
      aviso: o.aviso ?? (meu ? null : avisoDeOcr(notaDe(banco, o.id))),
      // O rótulo viaja com o TEXTO: quem abre direto pelo endereço vê o aviso.
      traducao: o.revisao ? { revisao: o.revisao, tradutor: o.tradutor, original: o.base_url } : null,
      // 'conta' | 'limite' quando o texto veio só em amostra
      limitado,
      capitulos,
    }
  })

  // ── o arquivo para levar ──
  //
  // EPUB é benefício de plano (Novelo em diante). O botão é um link comum,
  // então quem não tem plano vai à página de planos, e não a um JSON. Servir
  // um arquivo é mais sério que mostrar um botão: o direito é conferido de novo.
  rota({ caminho: '/api/livro/:id/epub', cru: true, erro500: 'Não consegui montar o arquivo.' }, ({ res, params, quem }) => {
    if (!planos.planoDe(banco, quem()).epub) return redirecionar(res, '/assinaturas.html?por=epub')
    const o = doLivro.get(CASA, params.id)
    if (!o || o.normalizado !== 1 || curadoria.obraOculta(banco, params.id)) throw new Recusa('Não temos o texto desta obra.', 404)
    if (o.estado !== 'dominio_publico' && o.estado !== 'licenca_livre') throw new Recusa('Esta obra não pode ser distribuída daqui.', 403)
    const livro = {
      id: o.id,
      titulo: primeiraLinha(o.titulo_pt || o.titulo),
      autor: o.autor ?? 'autoria não identificada',
      // O arquivo vai viver no aparelho de alguém: o aviso tem que ir junto.
      direito: o.revisao === 'automatica' ? `Tradução automática do Fio, sem revisão humana. ${o.motivo ?? ''}` : o.motivo,
      fonteUrl: o.fonte_url,
      capitulos: diagramar(capitulosDo.all(o.texto_id), { fonte: o.fonte, titulo: false }),
    }
    if (!livro.capitulos.length) throw new Recusa('Não temos o texto desta obra.', 404)
    const epub = montarEpub(livro)
    res.writeHead(200, {
      'content-type': 'application/epub+zip',
      'content-length': epub.length,
      // `filename*` com UTF-8 para o acento não virar lixo no nome do arquivo
      'content-disposition': `attachment; filename="${nomeDeArquivo(livro)}"; filename*=UTF-8''${encodeURIComponent(nomeDeArquivo(livro))}`,
      'cache-control': 'public, max-age=3600',
    })
    res.end(epub)
  })

  // O mesmo texto, num PDF com capa, ficha técnica e sumário clicável — o
  // formato de quem quer um arquivo com CARA de livro, não só o texto. Mesma
  // trava de plano do EPUB (Novelo em diante) e a mesma checagem de direito.
  rota({ caminho: '/api/livro/:id/pdf', cru: true, erro500: 'Não consegui montar o arquivo.' }, ({ res, params, quem }) => {
    if (!planos.planoDe(banco, quem()).pdf) return redirecionar(res, '/assinaturas.html?por=pdf')
    const o = doLivro.get(CASA, params.id)
    if (!o || o.normalizado !== 1 || curadoria.obraOculta(banco, params.id)) throw new Recusa('Não temos o texto desta obra.', 404)
    if (o.estado !== 'dominio_publico' && o.estado !== 'licenca_livre') throw new Recusa('Esta obra não pode ser distribuída daqui.', 403)
    const livro = {
      id: o.id,
      titulo: primeiraLinha(o.titulo_pt || o.titulo),
      autor: o.autor ?? 'autoria não identificada',
      tradutor: o.tradutor,
      revisao: o.revisao,
      direito: o.revisao === 'automatica' ? `Tradução automática do Fio, sem revisão humana. ${o.motivo ?? ''}` : o.motivo,
      fonteUrl: o.fonte_url,
      capitulos: diagramar(capitulosDo.all(o.texto_id), { fonte: o.fonte, titulo: false }),
    }
    if (!livro.capitulos.length) throw new Recusa('Não temos o texto desta obra.', 404)
    const pdf = montarPdf(livro)
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-length': pdf.length,
      'content-disposition': `attachment; filename="${nomeDeArquivoPdf(livro)}"; filename*=UTF-8''${encodeURIComponent(nomeDeArquivoPdf(livro))}`,
      'cache-control': 'public, max-age=3600',
    })
    res.end(pdf)
  })

  // "abri este livro": conta anônima (sem leitor, sem IP guardado)
  rota({ metodo: 'POST', caminho: '/api/abri/:id', corpo: false }, ({ params, ip }) => contas.registrarAbertura(banco, params.id, { ip }))

  // Buscar DENTRO dos livros: 110 milhões de palavras no FTS5. Rota pública e
  // cara, com freio por faixa de IP — sem ele, um laço na busca é a maneira
  // mais barata de derrubar o site.
  rota({ caminho: '/api/procurar', freio: { acao: 'procurar', por: 'ip', msg: 'Muitas buscas seguidas. Espere um instante.' } },
    async ({ busca }) => {
      const termo = busca.get('q') ?? ''
      // num trabalhador à parte, com memória das buscas recentes (busca-paralela.mjs)
      const r = await buscarNoTexto(termo, { jurisdicao: CASA })
      // achou pouco: talvez um erro de digitação no título ou no autor (quis-dizer.mjs)
      if (r.achados.length < 3) r.achados = [...quisDizer(termo, { fora: new Set(r.achados.map((a) => a.obra)) }), ...r.achados]
      return r
    })

  rota({ caminho: '/api/populares' }, () => ({
    semana: contas.maisLidos(banco, { dias: 7, quantos: 10 }),
    mes: contas.maisLidos(banco, { dias: 30, quantos: 10 }),
  }))
  rota({ caminho: '/api/novidades' }, () => extras.novidadesLivros(banco))

  // ── nota e resenha ──
  // Ler é público: a média e as resenhas ajudam a escolher o livro. Escrever
  // exige conta, porque resenha sem dono é panfleto.
  rota({ caminho: '/api/obra/:id/avaliacoes', erro500: 'não consegui ler as avaliações' },
    ({ params, quem }) => contas.avaliacoesDa(banco, params.id, quem()?.id ?? null))
  rota({ metodo: 'POST', caminho: '/api/avaliar', acesso: 'conta' }, ({ pessoa, dado }) => contas.avaliar(banco, pessoa.id, Number(dado.obra), dado))
  rota({ metodo: 'POST', caminho: '/api/desavaliar', acesso: 'conta' }, ({ pessoa, dado }) => contas.desavaliar(banco, pessoa.id, Number(dado.obra)))

  // ── correções comunitárias das traduções (servidor/correcoes.mjs) ──
  rota({ caminho: '/api/correcoes/resumo' }, ({ busca }) => correcoes.resumo(banco, busca.get('obra')) ?? { revisao: null })
  rota({ metodo: 'POST', caminho: '/api/correcoes', acesso: 'conta', freio: { acao: 'corrigir' } }, ({ pessoa, dado }) => correcoes.sugerir(banco, pessoa, dado))
}
