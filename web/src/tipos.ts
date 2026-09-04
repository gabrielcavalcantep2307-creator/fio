// O vocabulário do site, e ele é o mesmo do banco.
//
//   Obra    a coisa abstrata: "Dom Casmurro, de Machado, 1899"
//   Texto   uma manifestação dela num idioma, com um dono de tradução
//   Trilho  A = dá para ler aqui · B = ficha e onde encontrar · C = do leitor
//
// A separação entre obra e texto é o que permite dizer "temos o livro, mas
// não podemos servir esta tradução". Está explicada em docs/ACERVO.md.

export type Trilho = 'A' | 'B' | 'C'

export type ObraResumo = {
  id: number
  /** a frase da capa, escrita à mão. Só existe para as obras já curadas. */
  chamada?: string | null
  titulo: string
  autor: string
  autorId: number | null
  ano: number | null
  trilho: Trilho
  minutos: number | null
  temas: string[]
  /** arquivo nosso em /capas */
  capa: string | null
  /** id de capa na Open Library, servida por eles */
  capaOL: string | null
}

export type Onde = {
  tipo: 'compra' | 'biblioteca' | 'emprestimo_digital' | 'previa' | 'leitura_externa' | 'audiolivro'
  provedor: string
  rotulo: string | null
  url: string
}

export type Ficha = ObraResumo & {
  subtitulo: string | null
  paginas: number | null
  autorNasc: number | null
  autorMorte: number | null
  assuntos: string[]
  direito: string | null
  impedimento: string | null
  fonte: string | null
  fonteUrl: string | null
  olid: string | null
  onde: Onde[]
  /** contexto editorial: por que a obra existe, e o que observar nela */
  porque: string | null
  observar: string | null
  capitulos: { ordem: number; titulo: string | null; palavras: number }[] | null
}

export type Capitulo = {
  ordem: number
  titulo: string | null
  corpo: string
  palavras: number
}

export type Livro = ObraResumo & {
  textoId: number
  capitulos: Capitulo[]
}

export type Tema = {
  nome: string
  resumo: string | null
  obras: number
  legiveis: number
}

export type Autor = {
  id: number
  nome: string
  nascimento: number | null
  morte: number | null
  obras: number
}

/** Prateleira com curadoria — escolha de gente, não filtro de metadado. */
export type Colecao = {
  nome: string
  resumo: string | null
  obras: number[]
}

export type Catalogo = {
  geradoEm: string
  obras: ObraResumo[]
  temas: Tema[]
  autores: Autor[]
  colecoes: Colecao[]
}
