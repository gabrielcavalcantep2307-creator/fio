// Transforma o banco no site estático.
//
// O GitHub Pages não roda servidor: o que sobe é JSON pronto. Um arquivo
// magro com o catálogo inteiro (a busca roda no navegador, instantânea) e um
// arquivo por livro, com todos os capítulos dentro — baixa uma vez, e virar
// página nunca mais toca a rede.
//
//   node ingestao/publicar.mjs

import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { abrir, fechar, RAIZ } from '../servidor/banco/base.mjs'

const SAIDA = join(RAIZ, 'web', 'public', 'dados')
const CASA = process.env.FIO_JURISDICAO || 'BR'

const banco = abrir()
rmSync(SAIDA, { recursive: true, force: true })
mkdirSync(join(SAIDA, 'livros'), { recursive: true })

// Só entra no site o que é em português. Decisão do dono do acervo, e ela
// vale antes de qualquer outra: um livro em inglês não aparece nem no catálogo.
const EM_PORTUGUES = "o.idioma_original = 'pt'"

const obras = banco.prepare(`
  SELECT o.id, o.titulo, o.titulo_pt, o.ano, o.trilho, o.nivel, o.paginas, o.minutos_leitura,
         p.id autor_id, p.nome autor,
         t.id texto_id, t.normalizado, t.fonte, t.fonte_url,
         d.estado, d.motivo
    FROM obra o
    LEFT JOIN obra_pessoa op ON op.obra_id = o.id AND op.papel = 'autor'
    LEFT JOIN pessoa p ON p.id = op.pessoa_id
    LEFT JOIN texto t ON t.obra_id = o.id AND t.dono_id IS NULL
    LEFT JOIN direito d ON d.texto_id = t.id AND d.jurisdicao = ?
   WHERE o.publicada = 1 AND ${EM_PORTUGUES}
   GROUP BY o.id
   ORDER BY o.titulo`).all(CASA)

const capsDe = banco.prepare(
  'SELECT ordem, titulo, corpo, palavras FROM capitulo WHERE texto_id = ? ORDER BY ordem')

const limparTitulo = (s) => s.split('\n')[0].replace(/\s+/g, ' ').trim()

const resumo = []
let comTexto = 0
let bytes = 0

for (const o of obras) {
  // Um livro só ganha botão de leitura se: temos o texto normalizado E o
  // direito permite servir AQUI. As duas coisas, nunca uma só.
  const podeLer = o.normalizado === 1 && (o.estado === 'dominio_publico' || o.estado === 'licenca_livre')
  const trilho = podeLer ? 'A' : 'B'

  const linha = {
    id: o.id,
    titulo: limparTitulo(o.titulo_pt || o.titulo),
    autor: o.autor ?? 'autoria não identificada',
    autorId: o.autor_id,
    ano: o.ano,
    trilho,
    nivel: o.nivel,
    paginas: o.paginas,
    minutos: o.minutos_leitura,
    temas: [],
  }
  if (!podeLer) {
    linha.impedimento = o.normalizado !== 1
      ? 'Ainda não trouxemos o texto desta obra — ela está no catálogo, e o texto entra quando a ingestão passar por ela.'
      : (o.motivo ?? 'Estado de direito não confirmado para o Brasil.')
  }
  resumo.push(linha)

  if (!podeLer) continue

  const capitulos = capsDe.all(o.texto_id)
  if (!capitulos.length) continue

  const arquivo = JSON.stringify({
    ...linha,
    textoId: o.texto_id,
    fonte: o.fonte,
    fonteUrl: o.fonte_url,
    direito: o.motivo,
    capitulos,
  })
  writeFileSync(join(SAIDA, 'livros', `${o.id}.json`), arquivo)
  bytes += arquivo.length
  comTexto++
}

const autores = banco.prepare(`
  SELECT p.id, p.nome, p.morte, COUNT(*) obras
    FROM pessoa p
    JOIN obra_pessoa op ON op.pessoa_id = p.id AND op.papel = 'autor'
    JOIN obra o ON o.id = op.obra_id
   WHERE o.publicada = 1 AND ${EM_PORTUGUES}
   GROUP BY p.id
   ORDER BY obras DESC`).all()

writeFileSync(
  join(SAIDA, 'catalogo.json'),
  JSON.stringify({ geradoEm: new Date().toISOString().slice(0, 10), obras: resumo, autores }),
)

console.log(`catálogo ...... ${resumo.length} obras em português`)
console.log(`com texto ..... ${comTexto} (${(bytes / 1e6).toFixed(1)} MB antes da compressão)`)
console.log(`autores ....... ${autores.length}`)
console.log(`saída ......... web/public/dados/`)
fechar()
