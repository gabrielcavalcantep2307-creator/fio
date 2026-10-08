// Roda DENTRO do infra-esteira-1: republica o catálogo do site com os títulos novos.
import { abrir } from '/app/servidor/banco/base.mjs'
import { publicarCatalogo } from '/app/servidor/servicos/catalogo.mjs'

const n = publicarCatalogo(abrir(process.env.FIO_BANCO), process.env.FIO_SITE_DADOS, { jurisdicao: process.env.FIO_JURISDICAO || 'BR' })
console.log('catálogo:', n.obras, 'obras,', n.legiveis, 'para ler', n.trocou ? '— republicado' : `— NÃO trocou (${n.noAr} no ar)`)
