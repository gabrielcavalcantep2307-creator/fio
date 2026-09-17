// O pulso da esteira: conta ao painel, na VPS, o que ela está fazendo agora.
//
// Sem isto o painel só via a fila — e a fila não sabe se a esteira está viva.
// A esteira chama `pulso.mudar({...})` quando algo muda; o envio acontece no
// máximo a cada 20 s (e na hora, nos momentos que importam: livro novo, fim).
//
// A chave vem de FIO_ESTEIRA_CHAVE ou do arquivo `dados/traducoes/.chave-esteira`
// (fora do git). Sem chave, o pulso não faz nada e a esteira segue igual.
// Falha de rede nunca derruba a esteira: traduzir é o que importa.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function criarPulso(raiz) {
  const arquivo = join(raiz, 'dados', 'traducoes', '.chave-esteira')
  const chave = process.env.FIO_ESTEIRA_CHAVE || (existsSync(arquivo) ? readFileSync(arquivo, 'utf8').trim() : '')
  const url = process.env.FIO_PULSO_URL || 'https://fiolib.duckdns.org/api/esteira/pulso'
  const estado = { estado: 'medindo', rodada: {}, plano: {}, atual: null, ultimos: [], log: [] }
  let ultimoEnvio = 0, agendado = null, enviando = false

  async function enviar() {
    if (!chave || enviando) return
    enviando = true
    ultimoEnvio = Date.now()
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fio': '1', 'x-esteira-chave': chave },
        body: JSON.stringify({ ...estado, enviado: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch { /* sem rede agora; o próximo pulso tenta de novo */ }
    enviando = false
  }

  function mudar(parcial, { agora = false } = {}) {
    Object.assign(estado, parcial)
    if (agora || Date.now() - ultimoEnvio > 20_000) { clearTimeout(agendado); agendado = null; return enviar() }
    if (!agendado) agendado = setTimeout(() => { agendado = null; enviar() }, 20_000 - (Date.now() - ultimoEnvio))
  }

  function registrar(linha) {
    const l = String(linha).replace(/\r/g, '').trim()
    if (!l) return
    estado.log.push(l.slice(0, 200))
    if (estado.log.length > 12) estado.log.splice(0, estado.log.length - 12)
  }

  // batida a cada minuto mesmo sem novidade: é o que mostra "viva" no painel
  const batida = setInterval(() => { if (Date.now() - ultimoEnvio > 55_000) enviar() }, 60_000)
  batida.unref()

  return { estado, mudar, registrar, ligado: !!chave, fim: () => { clearInterval(batida); clearTimeout(agendado) } }
}
