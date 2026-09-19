// A busca dentro dos livros FORA do processo que atende o site (19/09/2026).
//
// O teste de carga na VPS (1 núcleo, cópia do banco de verdade) mostrou o
// gargalo: `node:sqlite` é síncrono, e uma busca no índice de 110 milhões de
// palavras leva de 0,3 a 2 segundos. Enquanto ela roda, o processo inteiro
// para — a página inicial, o livro de quem está lendo, o /api/saude. Com 5% das
// visitas buscando, o tempo de resposta de TODO o site ia de 0,2 s para 2 a 4 s.
//
// Três coisas aqui:
//
//   1. UM TRABALHADOR (worker_thread) com conexão própria ao banco, só de
//      leitura. A busca continua custando CPU, mas o resto do site segue
//      respondendo enquanto ela roda.
//   2. MEMÓRIA das buscas recentes (10 minutos, 500 termos). Quando o site for
//      divulgado, metade das buscas vai ser a mesma dúzia de palavras.
//   3. FILA COM TETO. Passou de 8 esperando, responde "tente em alguns
//      segundos" na hora, em vez de empilhar até todo mundo esperar minutos.
//
// Sem arquivo de banco (testes em memória), cai na busca direta de sempre.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { criarBuscaNoTexto, comoConsulta } from './busca-no-texto.mjs'
import { Recusa } from './contas.mjs'

const MEMORIA_MS = 10 * 60_000
const MEMORIA_TERMOS = 500
const FILA_MAXIMA = 8
const ESPERA_MAXIMA_MS = 15_000

export function criarBuscaParalela(banco, { caminho = process.env.FIO_BANCO } = {}) {
  const direta = criarBuscaNoTexto(banco)
  const usarTrabalhador = !!caminho && caminho !== ':memory:' && existsSync(caminho)
  const memoria = new Map()
  const esperando = new Map()
  let trabalhador = null
  let proximo = 1

  function ligar() {
    trabalhador = new Worker(new URL(import.meta.url), {
      workerData: { buscaNoTexto: true, caminho },
      resourceLimits: { maxOldGenerationSizeMb: 96 },
    })
    // não segura o processo aberto sozinho (testes, desligamento)
    trabalhador.unref()
    trabalhador.on('message', ({ id, r, erro, status }) => {
      const p = esperando.get(id)
      if (!p) return
      esperando.delete(id)
      clearTimeout(p.relogio)
      if (erro) p.rej(new Recusa(erro, status ?? 500))
      else p.res(r)
    })
    trabalhador.on('error', (e) => console.error('busca: o trabalhador caiu:', e.message))
    trabalhador.on('exit', () => {
      trabalhador = null
      for (const p of esperando.values()) { clearTimeout(p.relogio); p.rej(new Recusa('A busca reiniciou. Tente de novo.', 503)) }
      esperando.clear()
    })
  }

  function noTrabalhador(termo, jurisdicao) {
    if (esperando.size >= FILA_MAXIMA) {
      return Promise.reject(new Recusa('Muita gente buscando agora. Tente de novo em alguns segundos.', 503))
    }
    if (!trabalhador) ligar()
    return new Promise((res, rej) => {
      const id = proximo++
      const relogio = setTimeout(() => {
        if (esperando.delete(id)) rej(new Recusa('A busca demorou demais. Tente palavras mais específicas.', 503))
      }, ESPERA_MAXIMA_MS)
      esperando.set(id, { res, rej, relogio })
      trabalhador.postMessage({ id, termo, jurisdicao })
    })
  }

  const buscar = async (termo, { jurisdicao = 'BR' } = {}) => {
    const consulta = comoConsulta(termo)
    if (!consulta) return { termo: String(termo ?? ''), achados: [] }
    const chave = `${jurisdicao}|${consulta.toLowerCase()}`
    const lembrada = memoria.get(chave)
    if (lembrada && Date.now() - lembrada.quando < MEMORIA_MS) {
      return { ...structuredClone(lembrada.r), termo: String(termo ?? '') }
    }
    const r = usarTrabalhador ? await noTrabalhador(termo, jurisdicao) : direta(termo, { jurisdicao })
    memoria.delete(chave)
    memoria.set(chave, { quando: Date.now(), r })
    if (memoria.size > MEMORIA_TERMOS) memoria.delete(memoria.keys().next().value)
    // cópia: quem chama acrescenta o "você quis dizer" em cima do resultado
    return structuredClone(r)
  }
  buscar.esquecer = () => memoria.clear()
  buscar.parar = () => trabalhador?.terminate()
  return buscar
}

// ── o lado do trabalhador ──
if (!isMainThread && workerData?.buscaNoTexto) {
  const banco = new DatabaseSync(workerData.caminho)
  banco.exec('PRAGMA query_only = ON')
  banco.exec('PRAGMA busy_timeout = 4000')
  const buscar = criarBuscaNoTexto(banco)
  parentPort.on('message', ({ id, termo, jurisdicao }) => {
    try {
      parentPort.postMessage({ id, r: buscar(termo, { jurisdicao }) })
    } catch (e) {
      parentPort.postMessage({ id, erro: e instanceof Recusa ? e.message : 'Não consegui buscar agora.', status: e?.status ?? 500 })
    }
  })
}
