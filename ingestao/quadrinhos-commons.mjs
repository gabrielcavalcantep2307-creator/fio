// Quadrinhos em domínio público que moram no Wikimedia Commons.
//
//   node ingestao/quadrinhos-commons.mjs --completo quadrinhos-completo.json \
//        --baixar commons-downloads.tsv --ocr dados/quadrinhos-ocr
//
// Hoje: Little Nemo in Slumberland, de Winsor McCay (morto em 1934), as páginas
// de domingo do New York Herald de 1905 a 1911 — livres no Brasil (autor morto
// há mais de 70 anos) e nos EUA (publicadas antes de 1931). O Commons marca
// cada arquivo como domínio público; a lista só aceita arquivo com essa marca.
//
// Faz três coisas:
//   1. monta a série (volumes por semestre) e a põe no catálogo completo,
//      trocando a versão anterior dela se houver;
//   2. escreve a lista de downloads (url → caminho no site) para rodar no host;
//   3. escreve, para a esteira de OCR, a lista caminho-no-site → arquivo local
//      (quando `--local` aponta para uma pasta com as páginas já baixadas).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const arg = (n, p = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p }
const UA = 'fio/0.1 (biblioteca em portugues; https://fiolib.com.br)'
const API = 'https://commons.wikimedia.org/w/api.php'

async function api(params) {
  const r = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`Commons ${r.status}`)
  return r.json()
}

async function arquivosDaCategoria(categoria) {
  const saida = []
  let continuar = {}
  do {
    const j = await api({ action: 'query', generator: 'categorymembers', gcmtitle: `Category:${categoria}`, gcmtype: 'file', gcmlimit: '200',
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'LicenseShortName', ...continuar })
    saida.push(...Object.values(j.query?.pages ?? {}))
    continuar = j.continue ?? null
  } while (continuar)
  return saida
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

async function littleNemo() {
  const porData = new Map()
  for (let ano = 1905; ano <= 1911; ano++) {
    for (const f of await arquivosDaCategoria(`Little Nemo in Slumberland, ${ano}`)) {
      const m = f.title.match(/(\d{4})-(\d{2})-(\d{2})\)?\.jpe?g$/i)
      const info = f.imageinfo?.[0]
      if (!m || !info) continue
      if (/panel|panels|half|cropped|detail|non-US/i.test(f.title)) continue
      if (info.width < 1200) continue
      if (!/public domain|pd/i.test(info.extmetadata?.LicenseShortName?.value ?? '')) continue
      const data = `${m[1]}-${m[2]}-${m[3]}`
      if (!porData.has(data)) porData.set(data, { data, url: info.url, titulo: f.title })
    }
  }
  const paginas = [...porData.values()].sort((a, b) => a.data.localeCompare(b.data))
  // volumes por semestre: cada um com 20 a 26 domingos
  const grupos = new Map()
  for (const p of paginas) {
    const [a, mes] = p.data.split('-').map(Number)
    const chave = `${a}-${mes <= 6 ? 1 : 2}`
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(p)
  }
  // semestre com poucas páginas (buracos do acervo) vai junto com o anterior
  const juntos = []
  for (const ps of grupos.values()) {
    if (ps.length < 8 && juntos.length) juntos.at(-1).push(...ps)
    else juntos.push([...ps])
  }
  const downloads = []
  const capitulos = juntos.map((ps, i) => {
    const n = i + 1
    const pasta = `quadrinhos/little-nemo/${String(n).padStart(2, '0')}`
    const lista = ps.map((p, k) => {
      const caminho = `/${pasta}/${String(k + 1).padStart(3, '0')}.jpg`
      downloads.push([p.url, caminho.slice(1), p.data])
      return caminho
    })
    const [a0, m0] = ps[0].data.split('-').map(Number)
    const [a1, m1] = ps.at(-1).data.split('-').map(Number)
    return {
      n, titulo: a0 === a1 ? `${a0}, ${MESES[m0 - 1]}–${MESES[m1 - 1]}` : `${MESES[m0 - 1]} ${a0} – ${MESES[m1 - 1]} ${a1}`, capa: lista[0], paginas: lista,
      datas: ps.map((p) => p.data), fonte: 'https://commons.wikimedia.org/wiki/Category:Little_Nemo_in_Slumberland',
    }
  })
  return {
    serie: {
      id: 'little-nemo',
      titulo: 'Little Nemo no País dos Sonhos',
      autor: 'Winsor McCay',
      ano: '1905–1911',
      estilo: 'colorido',
      formato: 'quadrinho',
      sentido: 'ltr',
      modo: 'pagina',
      idioma: 'Inglês, com tradução do Fio sobre os balões',
      resumo: 'Toda noite, o pequeno Nemo adormece e é chamado ao País dos Sonhos pelo rei Morfeu — e toda manhã acorda caído da cama. As páginas de domingo que Winsor McCay desenhou para o New York Herald são das mais bonitas já feitas em quadrinhos: arquiteturas impossíveis, camas que andam, cidades de açúcar, em cores de jornal de 1905.',
      tags: ['fantasia', 'sonho', 'clássico', 'colorido', 'aventura'],
      capa: capitulos[0]?.capa,
      traducao: '/dados/quadrinhos-traducao/little-nemo.json',
      licenca: {
        nome: 'Domínio público',
        url: 'https://commons.wikimedia.org/wiki/Category:Little_Nemo_in_Slumberland',
        credito: 'Winsor McCay (1869–1934), publicado no New York Herald entre 1905 e 1911. Domínio público. Digitalizações: Wikimedia Commons. Tradução dos balões: esteira do Fio (OCR e tradução automática), com revisão.',
      },
      fonte: 'https://commons.wikimedia.org',
      capitulos,
    },
    downloads,
  }
}

const { serie, downloads } = await littleNemo()
console.log(`${serie.titulo}: ${serie.capitulos.length} volumes, ${downloads.length} páginas`)

const completoArq = arg('completo')
if (completoArq) {
  const completo = JSON.parse(readFileSync(completoArq, 'utf8'))
  completo.series = [...completo.series.filter((s) => s.id !== serie.id), serie]
  writeFileSync(completoArq, JSON.stringify(completo))
  console.log(`catálogo completo: ${completo.series.length} séries`)
}
const baixar = arg('baixar')
if (baixar) writeFileSync(baixar, downloads.map(([u, d]) => `${u}\t${d}`).join('\n') + '\n')

// Para a esteira de OCR: caminho no site → arquivo local (as páginas já
// baixadas nesta máquina, nomeadas pela data: 1905-10-15.jpg).
const local = arg('local')
if (local) {
  mkdirSync(arg('ocr', 'dados/quadrinhos-ocr'), { recursive: true })
  const linhas = downloads.map(([, d, data]) => [`/${d}`, join(local, `${data}.jpg`)]).filter(([, f]) => existsSync(f))
  writeFileSync(join(arg('ocr', 'dados/quadrinhos-ocr'), 'little-nemo.tsv'), linhas.map((l) => l.join('\t')).join('\n') + '\n')
  console.log(`OCR: ${linhas.length} páginas locais listadas`)
}
