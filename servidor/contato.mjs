// Fale com a gente — o canal de contato do site (19/09/2026).
//
// Os termos e a privacidade mandavam escrever para contato@fiolib.com.br, mas
// o domínio tem "MX nulo": ele declara que NÃO recebe e-mail. Toda notificação
// de direito autoral, todo pedido de titular de dados, voltava para quem
// mandou sem ninguém saber. Para um site que diz "tiramos do ar o que for
// devido", o canal de aviso tem de existir de verdade.
//
// A mensagem fica no banco, aparece no painel (aba Mensagens) e acende o sino
// de toda conta de administração. Não precisa de conta para escrever: quem
// avisa de uma violação muitas vezes não é leitor daqui.

import { Recusa } from './contas.mjs'
import { dicaDeIp } from './seguranca.mjs'
import { avisar } from './gosto.mjs'

export const TIPOS = {
  direito: 'Direito autoral: uma obra que não deveria estar aqui',
  privacidade: 'Meus dados pessoais (LGPD)',
  erro: 'Um erro no site ou num livro',
  outro: 'Outro assunto',
}

export function garantirTabelas(banco) {
  banco.exec(`CREATE TABLE IF NOT EXISTS contato (
    id          INTEGER PRIMARY KEY,
    tipo        TEXT NOT NULL,
    nome        TEXT NOT NULL,
    email       TEXT NOT NULL,
    obra        TEXT,
    mensagem    TEXT NOT NULL,
    leitor_id   INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
    ip_dica     TEXT,
    criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
    resolvido_em TEXT,
    resposta    TEXT
  )`)
}

// tira caractere de controle (menos quebra de linha e tabulação), corta no tamanho
const limpa = (s, n) => [...String(s ?? '')].filter((c) => { const k = c.charCodeAt(0); return (k >= 32 && k !== 127) || k === 10 || k === 9 }).join('').trim().slice(0, n)

export function receber(banco, dado, { pessoa = null, ip = null } = {}) {
  const tipo = TIPOS[dado.tipo] ? dado.tipo : 'outro'
  const nome = limpa(dado.nome, 120)
  const email = limpa(dado.email, 200)
  const obra = limpa(dado.obra, 400)
  const mensagem = limpa(dado.mensagem, 5000)
  if (!nome) throw new Recusa('Diga o seu nome, para sabermos com quem falamos.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Recusa('Deixe um e-mail válido: é por ele que respondemos.')
  if (mensagem.length < 10) throw new Recusa('Escreva um pouco mais sobre o que aconteceu.')
  if (tipo === 'direito' && !obra) throw new Recusa('Diga qual obra é (o endereço da página ajuda).')
  if (tipo === 'direito' && !dado.boaFe) throw new Recusa('Para um aviso de direito autoral, confirme a declaração de boa-fé.')
  const r = banco.prepare(`INSERT INTO contato (tipo, nome, email, obra, mensagem, leitor_id, ip_dica) VALUES (?,?,?,?,?,?,?)`)
    .run(tipo, nome, email, obra || null, mensagem, pessoa?.id ?? null, dicaDeIp(ip))
  const id = Number(r.lastInsertRowid)
  for (const a of banco.prepare("SELECT id FROM leitor WHERE papel = 'admin' AND desativado = 0").all()) {
    avisar(banco, a.id, { chave: `contato:${id}`, tipo: tipo === 'direito' ? 'denuncia' : 'contato',
      titulo: tipo === 'direito' ? 'Aviso de direito autoral recebido' : 'Nova mensagem pelo "Fale com a gente"',
      corpo: `${nome}: ${mensagem.slice(0, 120)}`, link: '/admin.html' })
  }
  return { ok: true, protocolo: `FIO-${String(id).padStart(5, '0')}` }
}

export function listar(banco) {
  return banco.prepare(`SELECT id, tipo, nome, email, obra, mensagem, criado_em, resolvido_em, resposta
    FROM contato ORDER BY resolvido_em IS NOT NULL, criado_em DESC LIMIT 200`).all()
}

export function resolver(banco, { id, resposta = '', desfazer = false }) {
  const r = banco.prepare(`UPDATE contato SET resolvido_em = ${desfazer ? 'NULL' : "datetime('now')"}, resposta = ? WHERE id = ?`)
    .run(limpa(resposta, 2000) || null, Number(id))
  if (!r.changes) throw new Recusa('Mensagem não encontrada.', 404)
  return { ok: true }
}

export const pendentes = (banco) => banco.prepare('SELECT COUNT(*) n FROM contato WHERE resolvido_em IS NULL').get().n
