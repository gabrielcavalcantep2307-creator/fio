// Rotas do painel do dono (/admin.html). Todas com `acesso: 'admin'`: o papel
// é lido do banco na hora, e quem não é admin recebe o MESMO 404 de uma rota
// que não existe — um leitor comum não descobre que o painel existe.
//
// O painel MOSTRA, ENFILEIRA e DECIDE; não roda comando nenhum na máquina.
// Quem traduz e publica é a esteira (servidor/esteira-trabalhador.mjs).

import * as contas from '../contas.mjs'
import { Recusa } from '../contas.mjs'
import { chaveDe } from '../usuario.mjs'
import * as ajustes from '../ajustes.mjs'
import * as acesso from '../acesso.mjs'
import * as planos from '../planos.mjs'
import * as esteira from '../esteira.mjs'
import * as curadoria from '../curadoria.mjs'
import * as correcoes from '../correcoes.mjs'
import * as publicacoes from '../publicacoes.mjs'
import * as controle from '../controle.mjs'
import { lerCookie } from '../http/pedido.mjs'

// A fonte que a esteira vai buscar depois. Só Gutenberg, e só o .txt: a esteira
// baixa este endereço sem ninguém olhar, então aceitar qualquer URL seria
// deixar o painel apontar o servidor para onde um atacante quisesse.
export function fonteDeGutenberg({ gutenberg, fonte }) {
  const id = String(gutenberg ?? '').trim()
  if (/^\d+$/.test(id)) return `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`
  const url = String(fonte ?? '').trim()
  if (/^https:\/\/www\.gutenberg\.org\/[\w./-]+$/.test(url) && url.length < 300) return url
  return null
}

export default function rotasDoPainel({ rota, banco, estatico }) {
  const admin = (caminho, def = {}) => ({ caminho, acesso: 'admin', ...def })
  const post = (caminho, def = {}) => admin(caminho, { metodo: 'POST', ...def })

  rota(post('/api/convite'), ({ pessoa, dado }) => contas.criarConvite(banco, { criadoPor: pessoa.id, nota: dado.nota }))

  // ── o retrato do acervo e da fila ──
  rota(admin('/api/painel'), () => {
    const um = (sql, ...a) => banco.prepare(sql).get(...a)
    const fila = Object.fromEntries(banco.prepare('SELECT estado, COUNT(*) n FROM fila_traducao GROUP BY estado').all().map((l) => [l.estado, l.n]))
    return {
      acervo: {
        obras: um('SELECT COUNT(*) n FROM obra WHERE publicada = 1').n,
        legiveis: um(`SELECT COUNT(*) n FROM obra o WHERE o.publicada = 1 AND EXISTS (
            SELECT 1 FROM texto t WHERE t.obra_id = o.id AND t.idioma = 'pt' AND t.normalizado = 1
              AND EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id))`).n,
        nossas: um("SELECT COUNT(*) n FROM texto WHERE fonte = 'fio_traducao'").n,
        capitulos: um('SELECT COUNT(*) n FROM capitulo').n,
        palavras: um('SELECT COALESCE(SUM(palavras),0) n FROM capitulo').n,
        autores: um('SELECT COUNT(*) n FROM pessoa').n,
      },
      leitores: {
        contas: um('SELECT COUNT(*) n FROM leitor WHERE desativado = 0').n,
        sessoes: um("SELECT COUNT(*) n FROM sessao WHERE expira_em > datetime('now')").n,
      },
      fila: { espera: fila.espera ?? 0, na_esteira: fila.na_esteira ?? 0, pronto: fila.pronto ?? 0, erro: fila.erro ?? 0 },
      // O que subiu por último: as traduções nossas mais recentes.
      recentes: banco.prepare(`
        SELECT o.id, COALESCE(o.titulo_pt, o.titulo) titulo, t.criado_em,
               (SELECT p.nome FROM obra_pessoa op JOIN pessoa p ON p.id = op.pessoa_id
                 WHERE op.obra_id = o.id AND op.papel = 'autor' LIMIT 1) autor
          FROM texto t JOIN obra o ON o.id = t.obra_id
         WHERE t.fonte = 'fio_traducao'
         ORDER BY t.criado_em DESC LIMIT 15`).all(),
    }
  })

  // ── a sala de controle (servidor/controle.mjs): tudo que roda, num retrato ──
  rota(admin('/api/admin/controle'), ({ req, pessoa }) => controle.retrato(banco, { pessoa, token: lerCookie(req) }))

  // ── a fila de tradução e a esteira ──
  rota(admin('/api/fila'), () => ({
    itens: banco.prepare(`
      SELECT f.id, f.titulo, f.autor, f.morte, f.fonte, f.idioma, f.estado, f.nota,
             f.obra_id, f.criado_em, f.tentativas, f.tentar_depois
        FROM fila_traducao f ORDER BY
          CASE f.estado WHEN 'erro' THEN 0 WHEN 'na_esteira' THEN 1 WHEN 'espera' THEN 2 ELSE 3 END,
          -- na ordem em que a esteira vai pegar (esteira.proximo)
          CASE WHEN f.estado = 'na_esteira' THEN -f.prioridade END,
          CASE WHEN f.estado = 'na_esteira' THEN COALESCE(f.bytes, 9000000000) END,
          f.criado_em DESC LIMIT 500`).all(),
  }))

  // Enfileira livros: { livros: [{ titulo, autor, morte?, gutenberg | fonte, idioma? }] }
  rota(post('/api/fila'), ({ pessoa, dado }) => {
    const livros = Array.isArray(dado.livros) ? dado.livros : []
    if (!livros.length) throw new Recusa('Mande ao menos um livro.')
    if (livros.length > 200) throw new Recusa('Muitos de uma vez; até 200 por envio.')
    const poe = banco.prepare('INSERT INTO fila_traducao (titulo, autor, morte, fonte, idioma, pedido_por) VALUES (?,?,?,?,?,?)')
    const jaTem = banco.prepare('SELECT 1 FROM fila_traducao WHERE fonte = ? AND estado <> ?')
    const aceitos = [], recusados = []
    banco.exec('BEGIN')
    try {
      for (const l of livros) {
        const titulo = String(l.titulo ?? '').trim().slice(0, 300)
        const autor = String(l.autor ?? '').trim().slice(0, 200)
        const idioma = String(l.idioma ?? 'en').trim().toLowerCase().slice(0, 5) || 'en'
        const morte = Number.isInteger(Number(l.morte)) ? Number(l.morte) : null
        const fonte = fonteDeGutenberg(l)
        if (!titulo || !autor) { recusados.push({ l, porque: 'título e autor são obrigatórios' }); continue }
        if (!fonte) { recusados.push({ l, porque: 'fonte precisa ser um id ou URL .txt do Gutenberg' }); continue }
        if (jaTem.get(fonte, 'pronto')) { recusados.push({ l, porque: 'já está na fila' }); continue }
        poe.run(titulo, autor, morte, fonte, idioma, pessoa.id)
        aceitos.push(titulo)
      }
      banco.exec('COMMIT')
    } catch (e) { banco.exec('ROLLBACK'); throw e }
    return { aceitos: aceitos.length, recusados }
  })

  // Só o que ainda não entrou na esteira: tirar da fila algo que já está sendo
  // traduzido não pararia a tradução — só confundiria os dois lados.
  rota(post('/api/fila/remover'), ({ dado }) => ({
    removidos: banco.prepare("DELETE FROM fila_traducao WHERE id = ? AND estado IN ('espera','erro')").run(Number(dado.id)).changes,
  }))
  rota(post('/api/fila/retentar'), ({ dado }) => ({ mudados: esteira.retentar(banco, Number(dado.id)) }))
  rota(admin('/api/admin/esteira'), () => esteira.estado(banco))
  // A esteira olha este interruptor a cada volta. Pausar não interrompe o
  // livro em curso: ele termina, e o próximo espera.
  rota(post('/api/admin/esteira/pausa'), ({ dado }) => { esteira.pausar(banco, dado.pausada === true); return esteira.estado(banco) })

  // ── curadoria do acervo (servidor/curadoria.mjs) ──
  rota(admin('/api/admin/curadoria'), ({ busca }) => {
    const tipo = busca.get('tipo'), id = busca.get('id')
    return {
      editados: curadoria.listaEditados(banco),
      ...(tipo === 'obra' && id ? { obra: curadoria.lerObra(banco, id) } : {}),
      ...(tipo === 'serie' && id ? { serie: curadoria.lerSerie(banco, id) } : {}),
    }
  })
  rota(admin('/api/admin/curadoria/base'), ({ busca }) => curadoria.baseParaPainel(banco, estatico, busca.get('tipo')))
  rota(admin('/api/admin/curadoria/ficha'), ({ busca }) => curadoria.fichaOriginal(banco, estatico, busca.get('id')))
  rota(post('/api/admin/curadoria/obra'), ({ pessoa, dado }) => curadoria.salvarObra(banco, pessoa, estatico, dado))
  rota(post('/api/admin/curadoria/serie'), ({ pessoa, dado }) => curadoria.salvarSerie(banco, pessoa, estatico, dado))
  rota(post('/api/admin/curadoria/capa', { corpo: 'binario', teto: 4 * 1024 * 1024 + 1024, erro500: 'Não consegui guardar a capa.' }),
    ({ pessoa, busca, bytes }) => curadoria.receberCapa(banco, pessoa, estatico, { tipo: busca.get('tipo'), id: busca.get('id') }, bytes))

  // ── correções dos leitores, publicações e assinaturas ──
  rota(admin('/api/admin/correcoes'), () => correcoes.fila(banco))
  rota(post('/api/admin/correcao'), ({ pessoa, dado }) => correcoes.decidir(banco, pessoa, dado))
  rota(post('/api/admin/correcoes/revisado'), ({ pessoa, dado }) => correcoes.marcarRevisado(banco, pessoa, dado))
  rota(admin('/api/admin/publicacoes'), () => publicacoes.filaDeRevisao(banco))
  rota(post('/api/admin/publicacao'), ({ pessoa, dado }) => publicacoes.decidir(banco, pessoa, dado))
  rota(admin('/api/admin/assinaturas'), () => ({
    assinaturas: planos.listar(banco), planos: planos.ORDEM.map((k) => ({ chave: k, nome: planos.PLANOS[k].nome })),
  }))
  rota(post('/api/admin/assinatura'), ({ pessoa, dado }) => planos.conceder(banco, pessoa.id, dado, { chaveDe, Recusa }))

  // ── a central de ajustes ──
  //
  // As poucas chaves que o dono muda pelo painel, de uma lista fechada (ver
  // `ajustes.mjs`): o painel não escreve chave livre, senão escreveria por
  // cima do segredo da casa, que mora na mesma tabela.
  rota(admin('/api/ajustes'), () => ({
    cadastro_aberto: ajustes.ler(banco, 'cadastro_aberto') === 'sim',
    amostra: acesso.amostraLigada(banco),
    gratis_livros_mes: acesso.livrosGratis(banco),
    manutencao: ajustes.ler(banco, 'manutencao') === 'sim',
    // contexto, só leitura: vem do ambiente, não se muda por aqui.
    esteira_paralelo: Number(process.env.FIO_PARALELO || 8),
    jurisdicao: process.env.FIO_JURISDICAO || 'BR',
  }))
  rota(post('/api/ajustes'), ({ dado }) => {
    const mudou = {}
    if (dado.cadastro_aberto !== undefined) {
      ajustes.escrever(banco, 'cadastro_aberto', dado.cadastro_aberto ? 'sim' : 'nao')
      mudou.cadastro_aberto = !!dado.cadastro_aberto
    }
    // `portao_ativo` virou "sem conta lê só a amostra" (17/09): a chave é a
    // mesma para o que já estava ligado continuar ligado.
    if (dado.amostra !== undefined) {
      ajustes.escrever(banco, 'portao_ativo', dado.amostra ? 'sim' : 'nao')
      mudou.amostra = !!dado.amostra
    }
    // o site "desligado" para quem não é admin (servidor/manutencao.mjs)
    if (dado.manutencao !== undefined) {
      ajustes.escrever(banco, 'manutencao', dado.manutencao === true ? 'sim' : 'nao')
      mudou.manutencao = dado.manutencao === true
    }
    if (dado.gratis_livros_mes !== undefined) {
      const n = Math.round(Number(dado.gratis_livros_mes))
      if (!Number.isInteger(n) || n < 0 || n > 100) throw new Recusa('Livros por mês: um número de 0 a 100.')
      ajustes.escrever(banco, 'gratis_livros_mes', String(n))
      mudou.gratis_livros_mes = n
    }
    return { ok: true, mudou }
  })
}
