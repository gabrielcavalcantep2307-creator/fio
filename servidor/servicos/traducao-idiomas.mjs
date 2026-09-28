// O tradutor ao vivo da área de Idiomas — não confundir com o motor de
// tradução de livro (`motor-traducao.mjs`), que é frágil, já se perdeu uma
// vez, e serve a ingestão. Este arquivo só REAPROVEITA o que já existe lá
// (`escolherMotor`, `traduzirDeepL`) para a direção idioma→português, e fala
// direto com o MinT para português→idioma, que `motor-traducao.mjs` não
// cobre (lá o alvo é sempre 'PT-BR').
//
// Sem `abrasileirar()` nem glossário aqui: os dois corrigem texto EM
// português (norma de Portugal, termo de livro) e não fazem sentido quando o
// que sai é francês, espanhol etc.

import { escolherMotor, traduzirDeepL } from './motor-traducao.mjs'

const SERVICO = 'https://translate.wmcloud.org/api/translate'

const CODIGO = {
  espanhol: 'es', frances: 'fr', ingles: 'en',
  japones: 'ja', alemao: 'de', russo: 'ru', italiano: 'it',
}

async function traduzirMinT(texto, de, para) {
  const r = await fetch(`${SERVICO}/${de}/${para}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: texto }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`MinT devolveu ${r.status}`)
  const { translation } = await r.json()
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new Error('MinT devolveu resposta vazia')
  }
  return translation
}

/**
 * Traduz uma palavra ou frase curta para o Tradutor da área de Idiomas.
 * `idioma` é a chave interna ('frances', 'espanhol'...); `direcao` diz o
 * sentido. Português → idioma sempre pelo MinT (o DeepL daqui só sabe
 * traduzir PARA português); idioma → português tenta DeepL, com o MinT como
 * reserva — o mesmo caminho que a ingestão de livro já usa.
 */
export async function traduzirRapido(texto, idioma, direcao) {
  const bruto = String(texto ?? '').trim().slice(0, 500)
  if (!bruto) return { traducao: '', motor: null }
  const cod = CODIGO[idioma]
  if (!cod) throw new Error(`Idioma desconhecido: ${idioma}`)

  if (direcao === 'pt->idioma') {
    const traducao = await traduzirMinT(bruto, 'pt', cod)
    return { traducao, motor: 'mint' }
  }

  const { motor } = await escolherMotor({ caracteres: bruto.length, de: cod, jaComecado: false, reserva: 0 })
  if (motor === 'deepl') {
    try {
      const traducao = await traduzirDeepL(bruto, cod)
      return { traducao, motor: 'deepl' }
    } catch {
      // cai para o MinT em vez de falhar o pedido
    }
  }
  const traducao = await traduzirMinT(bruto, cod, 'pt')
  return { traducao, motor: 'mint' }
}
