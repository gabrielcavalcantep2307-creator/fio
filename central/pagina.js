// A central, do lado do navegador.
//
// Duas coisas moram aqui e valem ser ditas antes do código:
//
// 1. As REGRAS (lá embaixo) são o coração. Elas transformam números em frases
//    que dizem o que fazer. Um painel que mostra "disco 87%" espera que quem
//    olha saiba se 87 é bom ou ruim; um painel que diz "o disco vai encher em
//    poucos dias — apague as pastas antigas do deploy" não espera nada.
//
// 2. Toda seção carrega a explicação do que ela é, sempre visível. O pedido
//    era entender o que se está fazendo, e explicação atrás de um "?" é
//    explicação que ninguém lê.

const SEGREDO = document.body.dataset.segredo
const pedir = (caminho, opcoes = {}) =>
  fetch(caminho, { ...opcoes, headers: { 'x-central': SEGREDO, ...(opcoes.headers ?? {}) } })
    .then((r) => r.json())

// ─────────────────────────────────────────────────────────────
// Formatar
// ─────────────────────────────────────────────────────────────

const bytes = (n) => {
  if (!n) return '0'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4)
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`
}
const num = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

const duracao = (s) => {
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} dias`
}
const desde = (carimbo) => duracao((Date.now() / 1000) - carimbo)

const texto = (pai, tag, classe, conteudo) => {
  const e = document.createElement(tag)
  if (classe) e.className = classe
  if (conteudo != null) e.textContent = conteudo
  pai.appendChild(e)
  return e
}

// ─────────────────────────────────────────────────────────────
// AS REGRAS
//
// Cada uma recebe o panorama e devolve um alerta, ou nada. A ordem da lista
// não importa: elas são ordenadas por gravidade na hora de mostrar.
//
// Toda regra tem que responder três coisas, e a terceira é a que faz a
// diferença entre um painel e um despertador:
//   titulo    — o que está acontecendo
//   porque    — por que isso importa (a parte que ensina)
//   oquefazer — o que fazer a respeito (a parte que resolve)
// ─────────────────────────────────────────────────────────────

const REGRAS = [
  (d) => {
    const sem = (d.backups?.bancos ?? []).filter((b) => !b.tem_copia && b.bytes > 1e6)
    if (!sem.length) return null
    return {
      nivel: 'grave',
      titulo: `${sem.length} banco${sem.length > 1 ? 's' : ''} de dados sem nenhuma cópia de segurança`,
      porque: `${sem.map((b) => `${b.nome} (${bytes(b.bytes)})`).join(', ')}. `
        + 'A pasta /opt/fio/backups existe e está vazia. O backup que roda de madrugada pelo cron '
        + 'copia só o Picord — o Fio nunca foi incluído nele. Se este disco morrer hoje, '
        + 'tudo isso morre junto: o catálogo, as traduções, as contas. Não existe segunda cópia.',
      oquefazer: 'Clique em **Fazer cópia do banco do Fio agora**, na aba Ações. '
        + 'Depois disso, o passo que falta é tirar a cópia DA MÁQUINA — uma cópia no mesmo disco '
        + 'protege contra apagar sem querer, e não protege contra o disco acabar.',
    }
  },

  (d) => {
    const disco = d.maquina?.disco
    if (!disco?.total) return null
    const usado = pct(disco.usado, disco.total)
    if (usado < 80) return null
    return {
      nivel: usado >= 90 ? 'grave' : 'atencao',
      titulo: `O disco está ${usado}% cheio`,
      porque: `${bytes(disco.livre)} livres de ${bytes(disco.total)}. Quando um disco enche, `
        + 'o SQLite para de conseguir escrever e o site começa a dar erro em tudo que grava — '
        + 'e a mensagem que aparece raramente diz "disco cheio".',
      oquefazer: 'Na aba Disco, veja quem está ocupando. As pastas .ant e .antes do deploy '
        + 'costumam ser as maiores e são descartáveis.',
    }
  },

  (d) => {
    const c = (d.containers ?? []).filter((x) => x.estado !== 'running')
    if (!c.length) return null
    return {
      nivel: 'grave',
      titulo: `${c.length} serviço${c.length > 1 ? 's' : ''} fora do ar`,
      porque: c.map((x) => `${x.nome}: ${x.situacao}`).join(' · '),
      oquefazer: 'Veja os registros dele na aba Ações antes de reiniciar — reiniciar sem ler '
        + 'o registro apaga a pista do que aconteceu.',
    }
  },

  (d) => {
    const c = (d.containers ?? []).filter((x) => x.reinicios >= 3)
    if (!c.length) return null
    return {
      nivel: 'atencao',
      titulo: 'Um serviço está caindo e voltando sozinho',
      porque: c.map((x) => `${x.nome} já reiniciou ${x.reinicios} vezes`).join(' · ')
        + '. Por fora ele aparece como "Up" — e é "Up" pela enésima vez. '
        + 'Reinício automático esconde o defeito em vez de resolver.',
      oquefazer: 'Leia os registros na aba Ações.',
    }
  },

  (d) => {
    const doente = (d.containers ?? []).filter((x) => x.saude && !['healthy', '-'].includes(x.saude))
    if (!doente.length) return null
    return {
      nivel: 'atencao',
      titulo: 'Um serviço está respondendo errado à checagem de saúde',
      porque: doente.map((x) => `${x.nome}: ${x.saude}`).join(' · '),
      oquefazer: 'Veja os registros. Se ficar "unhealthy" tempo demais, o Docker reinicia sozinho.',
    }
  },

  (d) => {
    const ate = d.site?.certificado_ate
    if (!ate) return null
    const dias = Math.round((new Date(ate) - Date.now()) / 86400000)
    if (dias > 21) return null
    return {
      nivel: dias <= 7 ? 'grave' : 'atencao',
      titulo: `O certificado do site vence em ${dias} dias`,
      porque: 'Sem certificado válido, o navegador mostra a página vermelha de "site não seguro" '
        + 'e ninguém entra. O Caddy renova sozinho uns 30 dias antes; estar tão perto do fim '
        + 'sugere que a renovação automática não está acontecendo.',
      oquefazer: 'Veja os registros do picord-caddy-1.',
    }
  },

  (d) => {
    const mem = d.maquina?.memoria_mb
    if (!mem?.total) return null
    const livre = pct(mem.disponivel, mem.total)
    if (livre > 15) return null
    return {
      nivel: livre <= 8 ? 'grave' : 'atencao',
      titulo: `Só ${livre}% da memória está disponível`,
      porque: `${mem.disponivel} MB de ${mem.total} MB. Quando a memória acaba, o Linux escolhe `
        + 'um programa e mata — e ele costuma escolher o maior, que aqui é o banco. '
        + 'A máquina tem 2 GB e roda duas aplicações.',
      oquefazer: 'Veja em Serviços quem está consumindo. A tradução em massa é o pico natural.',
    }
  },

  (d) => {
    const wal = d.fio?.wal_bytes ?? 0
    const banco = d.fio?.banco_bytes ?? 1
    if (wal < 200e6 && wal / banco < 0.25) return null
    return {
      nivel: 'atencao',
      titulo: `O diário de escrita do banco está com ${bytes(wal)}`,
      porque: 'O SQLite escreve primeiro num diário (o WAL) e depois passa para o banco. '
        + 'Ele cresce até alguém fechar o ciclo. Grande demais, ocupa disco à toa e deixa '
        + 'a abertura do banco mais lenta.',
      oquefazer: 'Clique em **Fechar o diário de escrita** na aba Ações. É seguro e rápido.',
    }
  },

  (d) => {
    if (d.seguranca?.ssh_senha_permitida !== 'yes') return null
    return {
      nivel: 'grave',
      titulo: 'O SSH aceita entrar com senha',
      porque: 'Com senha permitida, qualquer um na internet pode tentar adivinhar a sua, '
        + 'e eles tentam — o dia inteiro, automaticamente. Com só chave, não há o que adivinhar.',
      oquefazer: 'PasswordAuthentication no, em /etc/ssh/sshd_config. '
        + 'Confirme que a sua chave funciona ANTES de aplicar, ou você se tranca do lado de fora.',
    }
  },

  (d) => {
    const gerado = d.site?.catalogo_gerado_em
    if (!gerado) return null
    const dias = Math.round((Date.now() - new Date(gerado)) / 86400000)
    if (dias < 3) return null
    return {
      nivel: 'atencao',
      titulo: `O catálogo do site é de ${dias} dias atrás`,
      porque: 'O site não lê o banco: ele lê um arquivo estático que precisa ser reescrito. '
        + 'Livro instalado no banco e catálogo velho é livro que existe e não aparece — '
        + 'foi exatamente isso que fez A Revolução dos Bichos ficar ilegível por dois dias.',
      oquefazer: 'Clique em **Republicar o catálogo do site** na aba Ações.',
    }
  },

  (d) => {
    if (!d.seguranca?.reiniciar_pendente) return null
    return {
      nivel: 'atencao',
      titulo: 'A máquina está pedindo para reiniciar',
      porque: `Há ${d.seguranca.atualizacoes_pendentes} atualizações pendentes, e alguma delas `
        + 'mexeu no núcleo do sistema. Até reiniciar, a correção instalada não está valendo.',
      oquefazer: 'Reiniciar derruba os dois projetos por uns 40 segundos. '
        + 'Faça a cópia do banco antes, e escolha uma hora em que ninguém esteja lendo.',
    }
  },

  (d) => {
    const vazios = d.fio?.catalogo?.vazios ?? 0
    if (!vazios) return null
    return {
      nivel: 'info',
      titulo: `${vazios} obras têm ficha de texto e nenhum capítulo`,
      porque: 'São livros catalogados cujo texto nunca foi trazido. Estão marcados como '
        + 'não-legíveis, então o site não mente sobre eles — mas é a fila do que falta ingerir.',
      oquefazer: 'Nada urgente. É trabalho a fazer, não defeito.',
    }
  },

  (d) => {
    const estranhos = (d.processos ?? []).filter((p) =>
      !/systemd|journald|dbus|cron|sshd|polkit|udev|agetty|multipath|fwupd|ModemManager|fail2ban|unattended|snapd|rsyslog|resolved|networkd|timesync|logind|containerd|dockerd|docker-proxy|packagekit|droplet/i.test(p.comando))
    if (!estranhos.length) return null
    return {
      nivel: 'atencao',
      titulo: `${estranhos.length} programa${estranhos.length > 1 ? 's' : ''} rodando fora do Docker que eu não reconheço`,
      porque: estranhos.map((p) => `${p.comando.slice(0, 70)} (usuário ${p.usuario}, de pé há ${duracao(p.segundos)})`).join(' · ')
        + '. Tudo neste servidor deveria estar em contêiner. O que está solto ou foi posto '
        + 'à mão e esquecido, ou não devia estar aí.',
      oquefazer: 'Descubra o que é antes de matar. Se foi você que subiu e não usa mais, pode parar.',
    }
  },

  (d) => {
    const abertas = (d.portas ?? []).filter((p) => p.publica && ![22, 80, 443].includes(p.porta))
    if (!abertas.length) return null
    return {
      nivel: 'atencao',
      titulo: `${abertas.length} porta${abertas.length > 1 ? 's' : ''} aberta${abertas.length > 1 ? 's' : ''} para a internet além das de sempre`,
      porque: abertas.map((p) => `${p.porta} (${p.programa})`).join(', ')
        + '. As portas que precisam estar abertas são 22 (SSH), 80 e 443 (o site). '
        + 'Toda porta a mais é uma porta que alguém pode bater.',
      oquefazer: 'Se for o LiveKit do Wallt, é esperado — ele precisa de portas próprias para voz. '
        + 'Se não souber o que é, feche no firewall.',
    }
  },
]

// ─────────────────────────────────────────────────────────────
// As seções
// ─────────────────────────────────────────────────────────────

const cartao = (grade, rotulo, valor, nota, nivel, barra) => {
  const c = texto(grade, 'div', `cartao${nivel ? ` ${nivel}` : ''}`)
  texto(c, 'div', 'rotulo', rotulo)
  texto(c, 'div', `valor${String(valor).length > 12 ? ' pequeno' : ''}`, valor)
  if (barra != null) {
    const b = texto(c, 'div', `barra${barra >= 90 ? ' grave' : barra >= 80 ? ' atencao' : ''}`)
    texto(b, 'i').style.width = `${Math.min(barra, 100)}%`
  }
  if (nota) texto(c, 'div', 'nota', nota)
  return c
}

const tabela = (pai, colunas, linhas) => {
  const caixa = texto(pai, 'div', 'rolar')
  const t = texto(caixa, 'table')
  const cab = texto(texto(t, 'thead'), 'tr')
  for (const c of colunas) texto(cab, 'th', null, c)
  const corpo = texto(t, 'tbody')
  for (const linha of linhas) {
    const tr = texto(corpo, 'tr')
    for (const celula of linha) {
      if (celula && typeof celula === 'object' && celula.selo) {
        const td = texto(tr, 'td')
        texto(td, 'span', `selo ${celula.nivel ?? 'neutro'}`, celula.selo)
      } else if (celula && typeof celula === 'object') {
        texto(tr, 'td', celula.classe ?? '', celula.texto)
      } else {
        texto(tr, 'td', null, celula ?? '—')
      }
    }
  }
  return t
}

const SECOES = [
  {
    id: 'visao',
    nome: 'Visão geral',
    titulo: 'O que precisa de atenção',
    explica: 'Tudo que as regras acharam de errado agora, do mais grave para o menos. '
      + 'Lista vazia é a lista boa. Cada item diz por que importa e o que fazer — a ideia é '
      + 'que você nunca precise decorar o que um número quer dizer.',
    desenhar(pai, d) {
      const alertas = REGRAS.map((r) => { try { return r(d) } catch { return null } }).filter(Boolean)
      const ordem = { grave: 0, atencao: 1, info: 2 }
      alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])

      if (!alertas.length) {
        texto(pai, 'p', 'tudobem', 'Nada pedindo atenção. Tudo dentro do esperado.')
      }
      for (const a of alertas) {
        const caixa = texto(pai, 'div', `alerta ${a.nivel}`)
        const q = texto(caixa, 'div', 'quadro')
        texto(q, 'h3', null, a.titulo)
        texto(q, 'p', null, a.porque)
        const f = texto(q, 'div', 'oquefazer')
        // O **negrito** aponta para o botão que resolve. É o único lugar da
        // página onde se escreve em marcação, e vale a pena: liga o diagnóstico
        // à ação sem obrigar a procurar.
        f.innerHTML = ''
        for (const [i, parte] of a.oquefazer.split('**').entries()) {
          texto(f, i % 2 ? 'b' : 'span', null, parte)
        }
      }

      const resumo = texto(pai, 'div', 'grade')
      resumo.style.marginTop = '22px'
      const cat = d.fio?.catalogo ?? {}
      cartao(resumo, 'Livros no catálogo', num(cat.obras), `${num(cat.nossos)} traduzidos por nós`)
      cartao(resumo, 'Capítulos', num(cat.capitulos), `${num(Math.round((cat.palavras ?? 0) / 1e6))} milhões de palavras`)
      cartao(resumo, 'O site responde', d.site?.saude?.codigo === '200' ? 'sim' : 'NÃO',
        `${d.site?.saude?.ms} ms`, d.site?.saude?.codigo === '200' ? 'bem' : 'grave')
      cartao(resumo, 'De pé há', duracao(d.maquina?.de_pe_segundos ?? 0), d.maquina?.sistema)
    },
  },

  {
    id: 'maquina',
    nome: 'Máquina',
    titulo: 'O computador onde tudo isso mora',
    explica: 'Uma VPS de 1 núcleo e 2 GB na DigitalOcean, dividida entre dois projetos — '
      + 'o Fio (a biblioteca) e o Picord/Wallt. A carga é medida POR NÚCLEO: com 1 núcleo, '
      + 'carga 1,0 já é lotação; num de 4, seria folga. É por isso que o número dos núcleos '
      + 'aparece ao lado, e não escondido.',
    desenhar(pai, d) {
      const m = d.maquina ?? {}
      const g = texto(pai, 'div', 'grade')
      const cargaPct = pct(m.carga?.[0] ?? 0, m.nucleos ?? 1)
      cartao(g, 'Carga (1 min)', (m.carga?.[0] ?? 0).toFixed(2),
        `${m.nucleos} núcleo${m.nucleos > 1 ? 's' : ''} — ${cargaPct}% do que aguenta`,
        cargaPct >= 100 ? 'grave' : cargaPct >= 70 ? 'atencao' : 'bem', cargaPct)
      const mem = m.memoria_mb ?? {}
      cartao(g, 'Memória', `${num(mem.usada)} MB`, `${num(mem.disponivel)} MB disponíveis de ${num(mem.total)}`,
        null, pct(mem.usada, mem.total))
      const disco = m.disco ?? {}
      cartao(g, 'Disco', bytes(disco.usado), `${bytes(disco.livre)} livres de ${bytes(disco.total)}`,
        null, pct(disco.usado, disco.total))
      cartao(g, 'Troca (swap)', m.troca_mb?.total ? `${num(m.troca_mb.total)} MB` : 'não tem',
        m.troca_mb?.total ? `${num(m.troca_mb.livre)} MB livres`
          : 'sem swap, um pico de memória mata um programa em vez de ficar lento')
      cartao(g, 'Núcleo do sistema', m.kernel, m.sistema)
      cartao(g, 'Ligada há', duracao(m.de_pe_segundos ?? 0), 'desde o último reinício')
    },
  },

  {
    id: 'servicos',
    nome: 'Serviços',
    titulo: 'O que está rodando, e quanto está custando',
    explica: 'Cada linha é um contêiner — uma caixa fechada com um programa dentro. '
      + 'infra-fio-1 é a biblioteca. picord-caddy-1 é o porteiro: ele atende as portas 80 e 443, '
      + 'cuida do certificado HTTPS e decide qual endereço vai para qual projeto. '
      + 'picord-token e picord-livekit são do Wallt (voz). '
      + 'A coluna de REINÍCIOS é a que denuncia um serviço que cai e volta sem ninguém perceber.',
    desenhar(pai, d) {
      tabela(pai, ['Serviço', 'Situação', 'Saúde', 'Reinícios', 'CPU', 'Memória', 'Portas'],
        (d.containers ?? []).map((c) => [
          c.nome,
          { selo: c.situacao, nivel: c.estado === 'running' ? 'bem' : 'grave' },
          c.saude === '-' ? '—' : { selo: c.saude, nivel: c.saude === 'healthy' ? 'bem' : 'atencao' },
          { texto: String(c.reinicios), classe: 'num' },
          { texto: c.uso?.cpu ?? '—', classe: 'num' },
          { texto: c.uso?.memoria ?? '—', classe: 'num mono' },
          { texto: c.portas || 'nenhuma exposta', classe: 'mono' },
        ]))

      texto(pai, 'h2', null, 'Volumes').style.marginTop = '26px'
      texto(pai, 'p', 'explica', 'Volume é onde os dados sobrevivem ao contêiner. '
        + 'Apagar um contêiner não apaga o volume — é por isso que reiniciar o Fio não perde livro. '
        + 'infra_dados é o banco da biblioteca inteira.')
      tabela(pai, ['Volume', 'Tamanho', 'Usado por'],
        (d.volumes ?? []).map((v) => [v.nome, { texto: bytes(v.bytes), classe: 'num' },
          v.usado_por.join(', ') || 'ninguém — órfão']))
    },
  },

  {
    id: 'rede',
    nome: 'Rede',
    titulo: 'Quem consegue falar com a máquina',
    explica: 'A coluna que importa é "alcance". 127.0.0.1 significa que só a própria máquina '
      + 'enxerga aquela porta — é o caso do Fio, que fica escondido atrás do Caddy. '
      + '0.0.0.0 significa a internet inteira. As duas aparecem como "aberta" em qualquer '
      + 'ferramenta; a diferença entre elas é a diferença entre normal e susto.',
    desenhar(pai, d) {
      tabela(pai, ['Porta', 'Alcance', 'Programa', 'PID'],
        (d.portas ?? []).map((p) => [
          { texto: String(p.porta), classe: 'num' },
          p.publica
            ? { selo: 'a internet inteira', nivel: [22, 80, 443].includes(p.porta) ? 'neutro' : 'atencao' }
            : { selo: 'só a própria máquina', nivel: 'bem' },
          p.programa,
          { texto: String(p.pid), classe: 'num' },
        ]))

      texto(pai, 'h2', null, 'Programas fora do Docker').style.marginTop = '26px'
      texto(pai, 'p', 'explica', 'Tudo neste servidor deveria estar em contêiner. '
        + 'O que aparece aqui e não é do sistema operacional foi posto à mão em algum momento — '
        + 'e vale saber o que é.')
      tabela(pai, ['Comando', 'Usuário', 'De pé há', 'Memória'],
        (d.processos ?? []).map((p) => [
          { texto: p.comando, classe: 'mono' }, p.usuario, duracao(p.segundos),
          { texto: `${p.memoria_mb} MB`, classe: 'num' },
        ]))
    },
  },

  {
    id: 'fio',
    nome: 'O Fio',
    titulo: 'A biblioteca por dentro',
    explica: 'O banco é um arquivo SQLite só, de 2,2 GB, dentro do volume infra_dados. '
      + 'Não há servidor de banco separado — o próprio programa abre o arquivo. '
      + 'O "diário de escrita" (WAL) é onde o SQLite anota antes de gravar de vez; '
      + 'ele cresce até alguém fechar o ciclo.',
    desenhar(pai, d) {
      const c = d.fio?.catalogo ?? {}
      const g = texto(pai, 'div', 'grade')
      cartao(g, 'Obras', num(c.obras), `${num(c.publicadas)} publicadas`)
      cartao(g, 'Textos', num(c.textos), `${num(c.nossos)} traduzidos por nós · ${num(c.vazios)} sem capítulo`)
      cartao(g, 'Capítulos', num(c.capitulos), `${num(c.palavras)} palavras`)
      cartao(g, 'Autores e pessoas', num(c.pessoas))
      cartao(g, 'Contas de leitor', num(c.leitores), `${num(c.sessoes)} sessões abertas · ${num(c.convites)} convites`)
      cartao(g, 'Banco', bytes(d.fio?.banco_bytes), 'o arquivo catalogo.db')
      const wal = d.fio?.wal_bytes ?? 0
      cartao(g, 'Diário de escrita', bytes(wal),
        wal > 200e6 ? 'grande — dá para fechar pela aba Ações' : 'dentro do normal',
        wal > 200e6 ? 'atencao' : null)

      texto(pai, 'h2', null, 'O site, visto de fora').style.marginTop = '26px'
      texto(pai, 'p', 'explica', 'Estes pedidos saem da SUA máquina e vão pela internet, '
        + 'igual a um visitante. É a única conferência que conta: o servidor pode estar de pé '
        + 'e o site fora do ar assim mesmo, se o porteiro ou o certificado falharem.')
      const s = d.site ?? {}
      const g2 = texto(pai, 'div', 'grade')
      for (const [nome, rotulo] of [['saude', 'Servidor (/api/saude)'], ['catalogo', 'Catálogo'], ['raiz', 'Página inicial']]) {
        cartao(g2, rotulo, s[nome]?.codigo ?? '—', `${s[nome]?.ms ?? '?'} ms`,
          s[nome]?.codigo === '200' ? 'bem' : 'grave')
      }
      cartao(g2, 'Catálogo gerado em', s.catalogo_gerado_em ?? '—', 'o arquivo estático que o site lê')
      const dias = s.certificado_ate ? Math.round((new Date(s.certificado_ate) - Date.now()) / 86400000) : null
      cartao(g2, 'Certificado HTTPS', dias != null ? `${dias} dias` : '—',
        s.certificado_ate ?? '', dias != null && dias < 21 ? 'atencao' : 'bem')
    },
  },

  {
    id: 'copias',
    nome: 'Cópias',
    titulo: 'O que sobrevive se a máquina morrer',
    explica: 'Esta é a seção que responde a pergunta mais cara de todas. Ela não lista o que '
      + 'existe — lista o que NÃO tem cópia, que é o contrário. Uma tela que mostra os backups '
      + 'existentes deixa passar justamente o caso perigoso: uma pasta de backup no lugar certo, '
      + 'com o nome certo, e vazia por dentro.',
    desenhar(pai, d) {
      texto(pai, 'h2', null, 'Bancos de dados na máquina')
      tabela(pai, ['Banco', 'Tamanho', 'Projeto', 'Tem cópia?'],
        (d.backups?.bancos ?? []).map((b) => [
          { texto: b.nome, classe: 'mono' },
          { texto: bytes(b.bytes), classe: 'num' },
          b.projeto,
          b.tem_copia ? { selo: 'sim', nivel: 'bem' } : { selo: 'NENHUMA', nivel: 'grave' },
        ]))

      texto(pai, 'h2', null, 'Pastas de cópia').style.marginTop = '26px'
      tabela(pai, ['Pasta', 'Arquivos', 'Tamanho', 'Mais recente'],
        (d.backups?.pastas ?? []).map((p) => [
          { texto: p.caminho, classe: 'mono' },
          { texto: String(p.quantos), classe: 'num' },
          { texto: bytes(p.bytes), classe: 'num' },
          p.mais_novo ? `${p.mais_novo.nome} (há ${desde(p.mais_novo.quando)})`
            : { selo: 'vazia', nivel: 'grave' },
        ]))

      texto(pai, 'h2', null, 'O que roda sozinho de madrugada').style.marginTop = '26px'
      texto(pai, 'p', 'explica', 'Linhas do cron. Repare em QUAL script cada uma chama — '
        + 'é aí que se descobre que o backup automático cobre um projeto e não o outro.')
      const lista = texto(pai, 'div', 'rolar')
      const pre = texto(lista, 'div', 'saida', (d.backups?.cron ?? []).join('\n') || '(nada agendado)')
      pre.style.margin = '0'
      pre.style.border = 'none'

      const nota = texto(pai, 'div', 'alerta info')
      nota.style.marginTop = '22px'
      const q = texto(nota, 'div', 'quadro')
      texto(q, 'h3', null, 'Cópia no mesmo disco não é cópia de segurança de verdade')
      texto(q, 'p', null, 'Ela protege contra três coisas: o programa corromper o arquivo, '
        + 'uma migração dar errado, e alguém apagar sem querer. Não protege contra a única que '
        + 'acaba com tudo — o disco ou a máquina morrerem. Para isso a cópia precisa SAIR daqui: '
        + 'para o seu computador, ou para um armazenamento de objetos. É o passo que ainda falta.')
    },
  },

  {
    id: 'seguranca',
    nome: 'Segurança',
    titulo: 'Quem consegue entrar, e quem tentou',
    explica: 'Esta máquina fica na internet aberta, e recebe tentativas de invasão '
      + 'automáticas todo dia — não por ser importante, mas porque robôs varrem todos os '
      + 'endereços que existem. O que protege é: só entrar com chave, e o fail2ban banindo '
      + 'quem insiste.',
    desenhar(pai, d) {
      const s = d.seguranca ?? {}
      const g = texto(pai, 'div', 'grade')
      cartao(g, 'Entrar com senha', s.ssh_senha_permitida === 'no' ? 'bloqueado' : 'PERMITIDO',
        s.ssh_senha_permitida === 'no' ? 'só com chave — é o certo' : 'robôs vão tentar adivinhar',
        s.ssh_senha_permitida === 'no' ? 'bem' : 'grave')
      cartao(g, 'Entrar como root', s.ssh_root_permitido,
        s.ssh_root_permitido === 'without-password' ? 'só com chave' : '',
        s.ssh_root_permitido === 'yes' ? 'grave' : 'bem')
      cartao(g, 'fail2ban', s.fail2ban, 'bane quem erra a senha várias vezes',
        s.fail2ban === 'active' ? 'bem' : 'atencao')
      cartao(g, 'Firewall', s.firewall, null, /active/i.test(s.firewall ?? '') ? 'bem' : 'atencao')
      cartao(g, 'Atualizações pendentes', s.atualizacoes_pendentes,
        s.reiniciar_pendente ? 'e a máquina pede para reiniciar' : null,
        Number(s.atualizacoes_pendentes) > 0 ? 'atencao' : 'bem')
      cartao(g, 'Porta do SSH', s.ssh_porta)
    },
  },

  {
    id: 'disco',
    nome: 'Disco',
    titulo: 'Onde o espaço está indo',
    explica: 'As pastas terminadas em .ant e .antes são cópias do que estava no ar antes do '
      + 'último deploy. Servem para voltar atrás e, passado o susto, viram peso morto — '
      + 'com uma exceção: /opt/fio/site.ant guarda a única cópia da interface antiga, '
      + 'cujo código-fonte não existe em lugar nenhum.',
    desenhar(pai, d) {
      tabela(pai, ['Pasta', 'Tamanho'],
        (d.pastas ?? []).map((p) => [{ texto: p.caminho, classe: 'mono' },
          { texto: bytes(p.bytes), classe: 'num' }]))
    },
  },

  {
    id: 'codigo',
    nome: 'Código',
    titulo: 'O que mudou por último',
    explica: 'Os commits do repositório no SEU computador — a central lê o git daqui, não da VPS. '
      + '"Mudanças não salvas" são arquivos que você alterou e ainda não guardou em commit: '
      + 'é o que se perderia se o computador desligasse agora.',
    desenhar(pai, d, extra) {
      const g = extra?.git
      if (!g) return texto(pai, 'p', 'explica', 'Não consegui ler o git daqui.')

      if (g.sujo?.length) {
        const caixa = texto(pai, 'div', 'alerta atencao')
        const q = texto(caixa, 'div', 'quadro')
        texto(q, 'h3', null, `${g.sujo.length} arquivo(s) com mudança não salva em commit`)
        texto(q, 'p', null, g.sujo.join('  ·  '))
      }
      texto(pai, 'h2', null, 'Últimos commits').style.marginTop = '18px'
      const lista = texto(pai, 'div')
      for (const c of g.commits ?? []) {
        const l = texto(lista, 'div', 'commit')
        texto(l, 'span', 'hash', c.hash)
        texto(l, 'span', 'assunto', c.assunto)
        texto(l, 'span', 'quando', c.quando)
      }
    },
  },

  {
    id: 'acoes',
    nome: 'Ações',
    titulo: 'O que dá para mandar fazer daqui',
    explica: 'Uma lista fechada, de propósito. Não há um campo para digitar comando — '
      + 'um painel com terminal embutido é um painel que, se alguém alcançar, vira controle '
      + 'total da máquina. Cada ação abaixo diz o que faz e o que estraga ANTES de perguntar '
      + 'se pode, e nenhuma roda sem você confirmar.',
    async desenhar(pai) {
      const acoes = await pedir('/api/acoes')
      for (const [chave, a] of Object.entries(acoes)) {
        const caixa = texto(pai, 'div', 'acao')
        const q = texto(caixa, 'div', 'quadro')
        texto(q, 'h3', null, a.nome)
        texto(q, 'p', null, a.faz)
        texto(q, 'div', 'meta', `demora ${a.demora} · risco ${a.perigo}`)
        const b = texto(caixa, 'button', 'botao', 'Fazer')
        b.onclick = () => confirmarAcao(chave, a, caixa)
      }
    },
  },
]

// ─────────────────────────────────────────────────────────────
// Confirmar e rodar
// ─────────────────────────────────────────────────────────────

function confirmarAcao(chave, a, caixa) {
  const janela = document.getElementById('confirmar')
  document.getElementById('conf-nome').textContent = a.nome
  document.getElementById('conf-faz').textContent = a.faz
  document.getElementById('conf-estraga').textContent = a.estraga
  document.getElementById('conf-demora').textContent = a.demora
  janela.showModal()

  document.getElementById('conf-nao').onclick = () => janela.close()
  document.getElementById('conf-sim').onclick = async () => {
    janela.close()
    const botao = caixa.querySelector('button')
    botao.disabled = true
    botao.textContent = 'fazendo…'

    caixa.parentElement.querySelectorAll('.saida').forEach((s) => s.remove())
    const r = await pedir(`/api/acao?qual=${encodeURIComponent(chave)}`, { method: 'POST' })

    const saida = document.createElement('div')
    saida.className = 'saida'
    saida.textContent = `${r.ok ? '✓ pronto' : '✗ falhou'} em ${r.segundos}s\n\n${r.saida}${r.erro ? `\n--- erro ---\n${r.erro}` : ''}`
    caixa.insertAdjacentElement('afterend', saida)

    botao.disabled = false
    botao.textContent = 'Fazer'
    carregar(true)
  }
}

// ─────────────────────────────────────────────────────────────
// Montar a página
// ─────────────────────────────────────────────────────────────

let atual = location.hash.slice(1) || 'visao'
let ultimo = null

function desenharAbas(d) {
  const abas = document.getElementById('abas')
  abas.textContent = ''
  const alertas = d ? REGRAS.map((r) => { try { return r(d) } catch { return null } }).filter(Boolean) : []
  const graves = alertas.filter((a) => a.nivel === 'grave').length

  for (const s of SECOES) {
    const b = texto(abas, 'button', null, s.nome)
    b.setAttribute('aria-selected', s.id === atual)
    if (s.id === 'visao' && graves) texto(b, 'span', 'conta', String(graves))
    b.onclick = () => { atual = s.id; location.hash = s.id; desenhar() }
  }
}

async function desenhar() {
  const corpo = document.getElementById('corpo')
  corpo.textContent = ''
  const s = SECOES.find((x) => x.id === atual) ?? SECOES[0]
  const secao = texto(corpo, 'section')
  texto(secao, 'h2', null, s.titulo)
  texto(secao, 'p', 'explica', s.explica)
  desenharAbas(ultimo?.dados)
  try {
    await s.desenhar(secao, ultimo?.dados ?? {}, ultimo)
  } catch (e) {
    texto(secao, 'p', 'explica', `Não deu para desenhar esta seção: ${e.message}`)
  }
}

async function carregar(forcar = false) {
  const botao = document.getElementById('atualizar')
  botao.disabled = true
  try {
    ultimo = await pedir(`/api/panorama${forcar ? '?forcar=1' : ''}`)
  } catch (e) {
    ultimo = { falha: e.message, dados: ultimo?.dados ?? null }
  }
  botao.disabled = false

  const aviso = document.getElementById('aviso')
  if (ultimo.falha) {
    aviso.hidden = false
    aviso.textContent = ultimo.envelhecido
      ? `A VPS não respondeu agora (${ultimo.falha}). O que está na tela é a última leitura boa — não é o estado deste minuto.`
      : `A VPS não respondeu: ${ultimo.falha}`
  } else {
    aviso.hidden = true
  }

  document.getElementById('onde').textContent =
    ultimo.dados?.maquina ? `${ultimo.dados.maquina.nome} · ${ultimo.dados.maquina.sistema}` : 'sem resposta'
  document.getElementById('idade').textContent =
    ultimo.colhido_em ? `lido há ${duracao((Date.now() - ultimo.colhido_em) / 1000)}` : ''

  desenhar()
}

document.getElementById('atualizar').onclick = () => carregar(true)
window.addEventListener('hashchange', () => { atual = location.hash.slice(1) || 'visao'; desenhar() })
carregar()
// Sozinho de dois em dois minutos. Não é tempo real de propósito: colher custa
// vinte segundos de VPS, e uma página que se atualiza sem parar vira ela mesma
// uma carga na máquina que ela deveria estar vigiando.
setInterval(() => carregar(), 120_000)
