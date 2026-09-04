import type { Catalogo, Ficha, Livro, ObraResumo } from '../tipos'

// O site é estático: os dados vêm de JSON gerado pela ingestão, não de uma API.
// É o que permite publicar no GitHub Pages hoje. Quando houver servidor, só
// este arquivo muda.
const RAIZ = import.meta.env.BASE_URL + 'dados/'

const memoria = new Map<string, unknown>()

async function pegar<T>(caminho: string): Promise<T> {
  const guardado = memoria.get(caminho)
  if (guardado) return guardado as T
  const r = await fetch(RAIZ + caminho)
  if (!r.ok) throw new Error(`não achei ${caminho} (${r.status})`)
  const d = (await r.json()) as T
  memoria.set(caminho, d)
  return d
}

export const catalogo = () => pegar<Catalogo>('catalogo.json')
export const ficha = (id: number) => pegar<Ficha>(`fichas/${id}.json`)

// Um arquivo por livro, com os capítulos dentro. Baixa uma vez e a leitura
// inteira fica instantânea — virar página não pede rede.
export const livro = (id: number) => pegar<Livro>(`livros/${id}.json`)

/** "Revolução" e "revolucao" têm que dar na mesma coisa. */
export const normal = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function buscar(obras: ObraResumo[], termo: string) {
  const t = normal(termo).trim()
  if (!t) return obras
  const partes = t.split(/\s+/)

  const achados: { o: ObraResumo; peso: number }[] = []
  for (const o of obras) {
    const titulo = normal(o.titulo)
    const alvo = `${titulo} ${normal(o.autor)} ${normal(o.temas.join(' '))}`
    if (!partes.every(p => alvo.includes(p))) continue
    // título que começa com o termo vem antes de título que o contém, que
    // vem antes de quem só bate no autor ou no tema
    const pos = titulo.indexOf(partes[0])
    achados.push({ o, peso: pos === 0 ? 0 : pos > 0 ? 1 : 2 })
  }
  return achados.sort((a, b) => a.peso - b.peso).map(x => x.o)
}

/** Quem dá para ler primeiro; depois, alfabético. */
export const porLegibilidade = (a: ObraResumo, b: ObraResumo) =>
  a.trilho === b.trilho ? a.titulo.localeCompare(b.titulo, 'pt') : a.trilho === 'A' ? -1 : 1
