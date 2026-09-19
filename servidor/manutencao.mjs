// "Desligar o site" pelo painel, sem desligar nada de verdade.
//
// O interruptor mora no banco (ajuste `manutencao`). Ligado, quem não é admin
// recebe uma página de "voltamos já" (503) e a API responde 503; o admin
// continua vendo tudo, para conferir antes de religar. A esteira segue
// traduzindo: ela é outro serviço e não passa por aqui.
//
// Desligar o PROCESSO de verdade só se faz na VPS (docs/COMANDOS.md): o
// painel não tem, e não deve ter, poder sobre a máquina.

import * as ajustes from './ajustes.mjs'

// o que continua aberto para todo mundo: entrar (senão o admin não volta) e a saúde
const SEMPRE = /^\/api\/(google\/(entrar|volta|ligado)|entrar|sair|eu|saude)$/

export const ligada = (banco) => ajustes.ler(banco, 'manutencao') === 'sim'

const PAGINA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fio — voltamos já</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f5f0;color:#1c1a17;
font:17px/1.6 Georgia,serif;padding:24px;box-sizing:border-box}
@media (prefers-color-scheme:dark){body{background:#14140f;color:#ece7db}}
main{max-width:34ch;text-align:center}h1{font-size:24px;margin:0 0 8px}p{margin:0;opacity:.75}</style></head>
<body><main><h1>Voltamos já</h1><p>O Fio está em manutenção por alguns minutos. Seus livros e o que você leu estão guardados.</p></main></body></html>`

/** Responde e devolve true quando o pedido fica barrado pela manutenção. */
export function barrar(banco, req, res, caminho, { quemE, painel }) {
  if (!ligada(banco) || SEMPRE.test(caminho)) return false
  if (painel && (caminho === painel || caminho.startsWith(`${painel}/`))) return false
  if (quemE(req)?.papel === 'admin') return false
  const api = caminho.startsWith('/api/')
  res.writeHead(503, {
    'content-type': api ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'cache-control': 'no-store', 'retry-after': '300',
  })
  res.end(api ? JSON.stringify({ erro: 'O Fio está em manutenção. Volta em alguns minutos.' }) : PAGINA)
  return true
}
