// A central: tudo sobre a VPS, numa página que roda no SEU computador.
//
//   node central/servidor.mjs
//
// Abre o navegador sozinho. Fecha com Ctrl+C.
//
// ─────────────────────────────────────────────────────────────
// POR QUE AQUI, E NÃO NA VPS
//
// Um painel que faz tudo é a coisa mais perigosa que pode existir numa
// máquina. Se ele estiver na internet, ele é a porta de entrada: quem passar
// por ele não precisa passar por mais nada. Reiniciar contêiner, ler banco,
// rodar deploy — tudo isso é poder de administrador, e poder de administrador
// atrás de uma senha numa página pública é um convite.
//
// E há a razão prática, que é ainda mais decisiva: um painel hospedado na VPS
// está fora do ar exatamente quando a VPS está com problema — que é o único
// momento em que alguém realmente precisa dele. Um painel de monitoramento que
// cai junto com o que ele monitora não é um painel, é um enfeite.
//
// Aqui, ele mora no seu computador, escuta só em 127.0.0.1 (endereço que não
// existe para o resto do mundo) e fala com a VPS por SSH — usando a chave que
// já existe. Nenhuma porta nova foi aberta na VPS. Nenhum login novo foi
// inventado. Se a VPS morrer, a página continua abrindo e continua dizendo o
// que ela sabia por último.
// ─────────────────────────────────────────────────────────────
//
// O SEGREDO NA URL, e por que ele é necessário mesmo sendo local
//
// "Só escuta em 127.0.0.1" protege contra a internet, e não protege contra o
// próprio navegador. Qualquer página aberta numa aba pode mandar um pedido
// para http://127.0.0.1:7777 — o navegador deixa. Se este servidor aceitasse
// qualquer pedido, um site qualquer poderia reiniciar seus contêineres pelas
// suas costas.
//
// Por isso todo pedido exige um segredo sorteado quando o programa sobe. Ele
// vai na URL que o navegador abre e fica na aba; nenhuma outra página tem como
// adivinhá-lo. É a diferença entre uma porta destrancada dentro de casa e uma
// porta destrancada na rua.

import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')

const arg = (n, p = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : p
}

const MAQUINA = arg('maquina', process.env.MAQUINA ?? 'root@142.93.57.2')
const CHAVE = arg('chave', process.env.CHAVE_SSH ?? join(homedir(), '.ssh', 'picord-deploy'))
const PORTA = Number(arg('porta', 7777))
const SEGREDO = randomBytes(24).toString('hex')

// ─────────────────────────────────────────────────────────────
// Falar com a VPS
// ─────────────────────────────────────────────────────────────

const ssh = (comando, segundos = 180) => new Promise((pronto) => {
  execFile('ssh', [
    '-i', CHAVE,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=20',
    '-o', 'BatchMode=yes',
    MAQUINA, comando,
  ], { timeout: segundos * 1000, maxBuffer: 32 * 1024 * 1024 },
  (erro, saida, erroSaida) => pronto({
    ok: !erro,
    saida: String(saida ?? ''),
    erro: erro ? (String(erroSaida ?? '') || erro.message) : '',
  }))
})

const enviar = (local, remoto) => new Promise((pronto) => {
  execFile('scp', ['-i', CHAVE, '-o', 'StrictHostKeyChecking=accept-new', local, `${MAQUINA}:${remoto}`],
    { timeout: 60_000 }, (erro) => pronto(!erro))
})

// ─────────────────────────────────────────────────────────────
// O panorama, com memória curta
//
// Colher custa uns vinte segundos: são dezenas de comandos na VPS, um `du` que
// percorre os volumes e uma consulta num banco de 2 GB. Rápido para quem pede
// uma vez; insuportável se a página pedir a cada vez que alguém troca de aba.
//
// Vinte segundos de validade é o intervalo em que um número ainda é o mesmo
// número. E `colhendo` garante que dez pedidos ao mesmo tempo virem UMA
// colheita — sem isso, abrir a página em três abas dispararia três SSH
// simultâneos, cada um rodando um `du` no mesmo disco.
// ─────────────────────────────────────────────────────────────

let cache = null
let colhendo = null

async function panorama(forcar = false) {
  if (!forcar && cache && Date.now() - cache.quando < 20_000) return cache
  if (colhendo) return colhendo

  colhendo = (async () => {
    const t0 = Date.now()
    await enviar(join(AQUI, 'coletar.py'), '/opt/fio/coletar.py')
    const r = await ssh('python3 /opt/fio/coletar.py')

    let dados = null
    let falha = null
    try {
      dados = JSON.parse(r.saida)
    } catch {
      falha = r.ok ? `a VPS respondeu algo que não é JSON: ${r.saida.slice(0, 300)}`
        : (r.erro || 'a VPS não respondeu').slice(0, 300)
    }

    // Guarda o ÚLTIMO panorama bom mesmo quando esta colheita falhou. Uma
    // central que fica em branco quando a VPS cai não serve para nada: é
    // justamente aí que se quer olhar para o que ela era antes de cair.
    const novo = {
      quando: Date.now(),
      demorou: Date.now() - t0,
      dados: dados ?? cache?.dados ?? null,
      envelhecido: !dados && Boolean(cache?.dados),
      colhido_em: dados ? Date.now() : (cache?.colhido_em ?? null),
      falha,
      git: await noGit(),
    }
    cache = novo
    colhendo = null
    return novo
  })()

  return colhendo
}

/** O que o repositório daqui diz — a outra metade que a VPS não sabe. */
function noGit() {
  return new Promise((pronto) => {
    execFile('git', ['-C', RAIZ, 'log', '-12', '--format=%h\x1f%ar\x1f%s'],
      { timeout: 15_000 }, (erro, saida) => {
        if (erro) return pronto(null)
        const commits = String(saida).trim().split('\n').filter(Boolean).map((l) => {
          const [hash, quando, assunto] = l.split('\x1f')
          return { hash, quando, assunto }
        })
        execFile('git', ['-C', RAIZ, 'status', '--porcelain'], { timeout: 15_000 },
          (e2, s2) => pronto({
            commits,
            sujo: e2 ? [] : String(s2).trim().split('\n').filter(Boolean).slice(0, 20),
          }))
      })
  })
}

// ─────────────────────────────────────────────────────────────
// As ações
//
// Uma lista FECHADA, e nunca um campo onde se digita um comando.
//
// A tentação de pôr um terminal na página é grande — resolveria tudo de uma
// vez. É também o que transforma um painel numa arma: basta um pedido forjado
// chegar nele para que qualquer comando rode como root na VPS. Com uma lista
// fechada, o pior que um pedido forjado consegue é reiniciar um contêiner que
// volta sozinho em cinco segundos.
//
// Cada ação carrega o que ela FAZ, o que ela ESTRAGA se der errado, e quanto
// demora — e a página mostra isso antes de perguntar se pode.
// ─────────────────────────────────────────────────────────────

const ACOES = {
  'copia-do-fio': {
    nome: 'Fazer cópia do banco do Fio agora',
    faz: 'Copia o catálogo inteiro para /opt/fio/backups, comprimido, com a data no nome. '
      + 'Sai com uns 600 MB: o VACUUM compacta o banco de 2,2 GB para 1,4 GB antes de comprimir.',
    estraga: 'Nada. É só leitura, e grava num arquivo novo.',
    // Medido: 414 segundos na primeira vez que rodou, em 14/09/2026. O palpite
    // inicial dizia "3 a 6 minutos" e era otimista — e uma estimativa otimista
    // faz quem está esperando achar que travou e interromper no meio.
    demora: 'uns 7 minutos',
    perigo: 'nenhum',
    comando: `set -e
      mkdir -p /opt/fio/backups
      CARIMBO=$(date +%Y%m%d-%H%M%S)
      # VACUUM INTO, e não "cp": copiar um SQLite em uso pega o arquivo no meio
      # de uma escrita e produz uma cópia que parece existir e não abre. O
      # VACUUM lê pela biblioteca, respeita o diário, e entrega um banco íntegro.
      docker exec infra-fio-1 node -e "
        const {DatabaseSync} = require('node:sqlite')
        const db = new DatabaseSync('/dados/catalogo.db', {readOnly: true})
        db.exec(\\"VACUUM INTO '/dados/.copia.db'\\")
      "
      docker exec infra-fio-1 sh -c "gzip -1 -c /dados/.copia.db" > /opt/fio/backups/fio-$CARIMBO.db.gz
      docker exec infra-fio-1 rm -f /dados/.copia.db
      chmod 600 /opt/fio/backups/fio-$CARIMBO.db.gz
      ls -lh /opt/fio/backups/fio-$CARIMBO.db.gz`,
  },

  'agendar-copia-do-fio': {
    nome: 'Fazer a cópia do Fio acontecer sozinha, toda madrugada',
    faz: 'Escreve /opt/fio/backup.sh e põe uma linha no cron para rodar às 03:40. '
      + 'Guarda as 7 cópias mais recentes e apaga as mais velhas.',
    estraga: 'Passa a ocupar uns 4,2 GB de disco (7 cópias de 600 MB). Há 42 GB livres. '
      + 'Rodar duas vezes não duplica a linha do cron — ela é substituída.',
    demora: 'instantâneo (a primeira cópia sai de madrugada)',
    perigo: 'baixo',
    // O cron que já existia fazia backup só do Picord, e essa é a razão de o
    // banco do Fio ter passado dez dias sem nenhuma cópia: ninguém tinha
    // decidido não fazer, simplesmente nunca foi incluído. Uma cópia feita à
    // mão resolve hoje; só o agendamento resolve amanhã.
    comando: `set -e
      cat > /opt/fio/backup.sh <<'FIM'
#!/bin/bash
# Copia de seguranca do catalogo do Fio. Roda pelo cron, de madrugada.
#
# VACUUM INTO, e nao "cp": copiar um SQLite em uso pega o arquivo no meio de
# uma escrita e produz uma copia que parece existir e nao abre.
#
# LIMITE CONHECIDO: grava no MESMO disco. Protege contra corromper o arquivo e
# contra apagar sem querer. NAO protege contra a maquina morrer.
set -euo pipefail
DESTINO=/opt/fio/backups
GUARDAR=7
CARIMBO=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DESTINO"; chmod 700 "$DESTINO"
docker exec infra-fio-1 node -e "
  const {DatabaseSync} = require('node:sqlite')
  new DatabaseSync('/dados/catalogo.db', {readOnly: true}).exec(\\"VACUUM INTO '/dados/.copia.db'\\")
"
docker exec infra-fio-1 sh -c "gzip -1 -c /dados/.copia.db" > "$DESTINO/fio-$CARIMBO.db.gz"
docker exec --user root infra-fio-1 rm -f /dados/.copia.db
chmod 600 "$DESTINO/fio-$CARIMBO.db.gz"
echo "banco: $DESTINO/fio-$CARIMBO.db.gz ($(du -h "$DESTINO/fio-$CARIMBO.db.gz" | cut -f1))"
ls -t "$DESTINO"/fio-*.db.gz | tail -n +$((GUARDAR + 1)) | xargs -r rm -f
FIM
      chmod +x /opt/fio/backup.sh
      # Tira a linha antiga antes de por a nova, senao rodar isto duas vezes
      # agenda duas copias na mesma madrugada.
      (crontab -l 2>/dev/null | grep -v '/opt/fio/backup.sh'; \\
       echo '40 3 * * * /opt/fio/backup.sh >> /var/log/fio-backup.log 2>&1') | crontab -
      echo "agendado. o cron agora tem:"
      crontab -l | grep -v '^#'`,
  },

  'conferir-copia': {
    nome: 'Conferir se a última cópia realmente abre',
    faz: 'Descomprime a cópia mais recente do Fio, manda o SQLite checar a integridade dela '
      + 'e conta os livros lá dentro. Apaga o arquivo de teste no fim.',
    estraga: 'Nada. Usa uns 1,5 GB de disco durante o teste e devolve no fim.',
    demora: 'uns 3 minutos',
    perigo: 'nenhum',
    // Uma cópia que não abre é pior do que não ter cópia: ela faz você parar de
    // se preocupar. O único jeito de saber se um backup presta é restaurá-lo, e
    // é isso que esta ação faz — num arquivo descartável, sem encostar no que
    // está no ar.
    comando: `set -e
      ULTIMA=$(ls -t /opt/fio/backups/fio-*.db.gz 2>/dev/null | head -1)
      test -n "$ULTIMA" || { echo "nao ha nenhuma copia do Fio ainda"; exit 1; }
      echo "conferindo $ULTIMA"
      gzip -dc "$ULTIMA" > /tmp/prova.db
      docker cp /tmp/prova.db infra-fio-1:/tmp/prova.db > /dev/null
      docker exec infra-fio-1 node -e "
        const {DatabaseSync} = require('node:sqlite')
        const db = new DatabaseSync('/tmp/prova.db', {readOnly: true})
        const um = (s) => Object.values(db.prepare(s).get())[0]
        console.log('integridade ....', um('PRAGMA integrity_check'))
        console.log('obras ..........', um('SELECT COUNT(*) n FROM obra'))
        console.log('capitulos ......', um('SELECT COUNT(*) n FROM capitulo'))
        console.log('nossas traducoes', um(\\"SELECT COUNT(*) n FROM texto WHERE fonte='fio_traducao'\\"))
      " 2>&1 | grep -viE 'experimental|trace-warn'
      docker exec --user root infra-fio-1 rm -f /tmp/prova.db
      rm -f /tmp/prova.db
      echo
      echo "se a integridade deu 'ok' e os numeros batem com a aba O Fio, a copia presta."`,
  },

  'reiniciar-fio': {
    nome: 'Reiniciar o servidor do Fio',
    faz: 'Para e sobe o contêiner infra-fio-1.',
    estraga: 'O site fica fora do ar por uns 10 segundos. Quem estiver lendo perde a página; nada é perdido no banco.',
    demora: 'uns 20 segundos',
    perigo: 'baixo',
    comando: 'docker restart infra-fio-1 && sleep 6 && docker ps --filter name=infra-fio-1 --format "{{.Status}}"',
  },

  'republicar-catalogo': {
    nome: 'Republicar o catálogo do site',
    faz: 'Relê o banco e reescreve o catálogo estático que o site inteiro usa — prateleiras, capas e o botão de ler.',
    estraga: 'Nada, se der certo. É o passo que faz um livro recém-instalado aparecer.',
    demora: 'uns 2 a 4 minutos',
    perigo: 'baixo',
    comando: `set -e
      docker exec --user root infra-fio-1 sh -c 'rm -rf /tmp/saida && mkdir -p /tmp/saida && chown 1717:1717 /tmp/saida'
      docker exec infra-fio-1 node /app/ingestao/publicar.mjs --saida /tmp/saida 2>&1 | tail -8
      # A conferência antes de trocar: uma pasta de fichas pela metade
      # substituiria 4983 páginas de livro por 1700, e o site não daria erro
      # nenhum — as outras 3283 simplesmente sumiriam.
      docker cp infra-fio-1:/tmp/saida/fichas /opt/fio/site/dados/fichas.novo
      QUANTAS=$(ls /opt/fio/site/dados/fichas.novo | wc -l)
      test "$QUANTAS" -gt 4900 || { echo "só $QUANTAS fichas; não vou trocar"; exit 1; }
      docker cp infra-fio-1:/tmp/saida/catalogo.json /opt/fio/site/dados/catalogo.json
      rm -rf /opt/fio/site/dados/fichas
      mv /opt/fio/site/dados/fichas.novo /opt/fio/site/dados/fichas
      chown -R 197608:197121 /opt/fio/site/dados
      echo "pronto: $QUANTAS fichas publicadas"`,
  },

  'limpar-wal': {
    nome: 'Fechar o diário de escrita do banco (WAL)',
    faz: 'Manda o SQLite passar o que está no diário para o banco e zerar o diário.',
    estraga: 'Nada. Libera disco e deixa o banco mais rápido de abrir.',
    demora: 'uns 30 segundos',
    perigo: 'nenhum',
    comando: `docker exec infra-fio-1 node -e "
      const {DatabaseSync} = require('node:sqlite')
      const db = new DatabaseSync('/dados/catalogo.db')
      console.log(JSON.stringify(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()))
    " && docker exec infra-fio-1 sh -c 'stat -c "%n %s" /dados/catalogo.db-wal'`,
  },

  'apagar-copias-velhas': {
    nome: 'Apagar as pastas antigas do deploy',
    faz: 'Remove /opt/fio/site.ant e /opt/fio/servidor.antes, que são cópias do que estava no ar antes do último deploy.',
    estraga: 'Você perde a possibilidade de voltar para a versão anterior por cópia direta. O git continua tendo tudo, menos a interface, cujo fonte não existe em lugar nenhum — por isso o site.ant NÃO é apagado por padrão.',
    demora: 'instantâneo',
    perigo: 'médio',
    comando: `du -sh /opt/fio/servidor.antes 2>/dev/null
      rm -rf /opt/fio/servidor.antes
      echo "servidor.antes apagado; site.ant preservado de proposito (fonte da interface nao existe em outro lugar)"
      df -h / | tail -1`,
  },

  'ver-logs-do-fio': {
    nome: 'Ver os últimos registros do servidor do Fio',
    faz: 'Mostra as últimas 120 linhas que o contêiner escreveu.',
    estraga: 'Nada. Só lê.',
    demora: 'instantâneo',
    perigo: 'nenhum',
    comando: 'docker logs --tail 120 infra-fio-1 2>&1',
  },

  'quem-tentou-entrar': {
    nome: 'Ver quem tentou entrar por SSH',
    faz: 'Lista as tentativas de login recusadas e os endereços que o fail2ban baniu.',
    estraga: 'Nada. Só lê.',
    demora: 'uns 10 segundos',
    perigo: 'nenhum',
    comando: `echo "=== banidos agora ==="
      fail2ban-client status sshd 2>/dev/null | tail -4
      echo
      echo "=== ultimas recusas ==="
      journalctl -u ssh --since '7 days ago' --no-pager 2>/dev/null | grep -iE 'failed|invalid' | tail -20 || echo "(nenhuma)"`,
  },
}

// ─────────────────────────────────────────────────────────────
// O servidor
// ─────────────────────────────────────────────────────────────

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

const responder = (res, codigo, corpo, tipo = 'application/json; charset=utf-8') => {
  res.writeHead(codigo, {
    'content-type': tipo,
    // A página não busca nada de fora e não deve poder ser embutida em lugar
    // nenhum. Com isto, mesmo que algo desse errado, não há para onde vazar.
    'content-security-policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    // Nada de cache. Duas razões: os números são de agora e não de ontem; e o
    // segredo muda a cada vez que o programa sobe, então um HTML guardado
    // aponta para um segredo morto — a página abre, pede o estilo com a chave
    // velha, leva 403 e aparece sem formatação nenhuma. Levei uma dessas.
    'cache-control': 'no-store, must-revalidate',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
  res.end(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo))
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')

  // O segredo pode vir na URL (a página) ou no cabeçalho (os pedidos que a
  // página faz depois). Nos dois casos ele é obrigatório.
  const dado = url.searchParams.get('t') ?? req.headers['x-central']
  if (dado !== SEGREDO) {
    return responder(res, 403, 'Segredo errado. Abra pelo endereço que o programa imprimiu no terminal.\n', 'text/plain; charset=utf-8')
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    // replaceAll, e não replace: o segredo aparece três vezes no HTML — no
    // body, no link do CSS e no src do JS. Com `replace` só a primeira seria
    // trocada, e o navegador pediria a folha de estilo com "__SEGREDO__"
    // literal, levaria 403, e a página apareceria sem estilo nenhum e sem
    // nenhum erro que apontasse para aqui.
    const html = readFileSync(join(AQUI, 'pagina.html'), 'utf8').replaceAll('__SEGREDO__', SEGREDO)
    return responder(res, 200, html, TIPOS['.html'])
  }

  for (const arquivo of ['pagina.css', 'pagina.js']) {
    if (url.pathname === `/${arquivo}`) {
      const caminho = join(AQUI, arquivo)
      if (!existsSync(caminho)) return responder(res, 404, 'sem isso\n', 'text/plain')
      return responder(res, 200, readFileSync(caminho), TIPOS[arquivo.slice(arquivo.lastIndexOf('.'))])
    }
  }

  if (url.pathname === '/api/panorama') {
    return responder(res, 200, await panorama(url.searchParams.get('forcar') === '1'))
  }

  if (url.pathname === '/api/acoes') {
    return responder(res, 200, Object.fromEntries(
      Object.entries(ACOES).map(([k, a]) => [k, { ...a, comando: undefined }])))
  }

  if (url.pathname === '/api/acao' && req.method === 'POST') {
    const qual = url.searchParams.get('qual')
    const acao = ACOES[qual]
    if (!acao) return responder(res, 404, { erro: 'não conheço essa ação' })

    const t0 = Date.now()
    const r = await ssh(acao.comando, 900)
    cache = null // o que ela mexeu precisa ser relido
    return responder(res, 200, {
      qual, ok: r.ok, segundos: Math.round((Date.now() - t0) / 1000),
      saida: r.saida.slice(-8000), erro: r.erro.slice(-4000),
    })
  }

  responder(res, 404, { erro: 'sem isso' })
})

// Sem este ouvinte, a porta ocupada derruba o programa com um despejo de pilha
// de vinte linhas cujo assunto — "já tem uma central aberta" — não aparece em
// nenhuma delas. É o mesmo defeito que matou a esteira hoje: `error` sem
// ouvinte, no Node, é o processo inteiro que cai.
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORTA} já está ocupada.`)
    console.error('  Provavelmente já existe uma central aberta — procure a outra janela preta.')
    console.error(`  Se não for isso, use outra porta:  node central/servidor.mjs --porta ${PORTA + 1}\n`)
  } else {
    console.error(`\n  Não deu para subir: ${e.message}\n`)
  }
  process.exit(1)
})

servidor.listen(PORTA, '127.0.0.1', () => {
  const endereco = `http://127.0.0.1:${PORTA}/?t=${SEGREDO}`
  console.log('\n  ┌─ Central do Fio ' + '─'.repeat(40))
  console.log('  │')
  console.log(`  │  ${endereco}`)
  console.log('  │')
  console.log(`  │  máquina: ${MAQUINA}`)
  console.log('  │  escutando só em 127.0.0.1 — ninguém de fora alcança isto')
  console.log('  │  Ctrl+C para fechar')
  console.log('  └' + '─'.repeat(57) + '\n')

  if (!process.argv.includes('--sem-abrir')) {
    const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', endereco]]
      : process.platform === 'darwin' ? ['open', [endereco]] : ['xdg-open', [endereco]]
    spawn(abrir[0], abrir[1], { detached: true, stdio: 'ignore' }).unref()
  }

  panorama().then((p) => console.log(p.falha
    ? `  (primeira colheita falhou: ${p.falha})`
    : `  (primeira colheita pronta em ${Math.round(p.demorou / 1000)}s)`))
})
