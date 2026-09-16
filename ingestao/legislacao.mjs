// A lei, que é livre por lei.
//
//   node ingestao/legislacao.mjs
//
// **Por que isto existe.** Direito era o maior tema do acervo — 247 obras — e
// NENHUMA dava para ler: são todas manuais comerciais, protegidos. A
// categoria que mais interessa ao dono da biblioteca era a mais vazia.
//
// A saída não é jurídica-criativa, é literal: a **Lei 9.610/98, art. 8º, IV**
// diz que "os textos de tratados ou convenções, leis, decretos, regulamentos,
// decisões judiciais e demais atos oficiais" **não são objeto de proteção**.
// Não há zona cinzenta, não há prazo a esperar, não há tradutor com direito
// próprio. É o único acervo em português que nasce inteiramente livre.
//
// A fonte é o Planalto, que é o texto oficial compilado — com as alterações
// já aplicadas, que é a versão que se lê para valer.

import { abrir, fechar, recriarDerivada } from '../servidor/banco/base.mjs'

const PAUSA = 1500

// O Planalto fecha a conexão na cara de quem não parece navegador — o `fetch`
// do Node, com o cabeçalho mínimo dele, leva "other side closed" e nenhuma
// explicação. Não é bloqueio de robô com aviso: é a porta batendo. Estes
// cabeçalhos são os de um navegador comum, e nada além disso.
const CABECALHOS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9',
  'accept-encoding': 'gzip, deflate',
  connection: 'keep-alive',
}

const LEIS = [
  {
    url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
    titulo: 'Constituição da República Federativa do Brasil',
    ano: 1988,
    chamada: 'O texto que organiza tudo o mais — e que quase ninguém leu inteiro.',
    porque: 'Promulgada em 5 de outubro de 1988, depois de vinte e um anos de ditadura e de uma assembleia constituinte de vinte meses. É chamada de "Constituição Cidadã" porque abriu com direitos, e não com a estrutura do Estado — a ordem dos capítulos é uma declaração de prioridade. Já foi emendada mais de cem vezes, e é a versão compilada que está aqui.',
    observar: 'Leia o art. 5º inteiro, uma vez. São 78 incisos, e quase todo debate público brasileiro sobre direitos passa por um deles. Depois repare em quantas vezes aparece "na forma da lei": é ali que a Constituição delega, e é ali que a disputa continua.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',
    titulo: 'Código Civil',
    ano: 2002,
    chamada: 'Nascer, casar, comprar, dever, morrer e herdar — a vida privada em artigos.',
    porque: 'Substituiu o Código de 1916, que tinha sido escrito para um país agrário e patriarcal. O de 2002 abre pela pessoa, e não pelos bens, e leva vinte e seis anos de tramitação no Congresso. É o texto que decide o que acontece quando duas pessoas combinam alguma coisa e uma delas não cumpre.',
    observar: 'Compare o art. 1º ("toda pessoa é capaz de direitos e deveres") com o que vem depois sobre incapacidade. A tensão entre os dois é onde mora metade do Direito Civil.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm',
    titulo: 'Código Penal',
    ano: 1940,
    chamada: 'O que o Estado pode fazer com alguém, e a partir de quê.',
    porque: 'É de 1940, do Estado Novo, com a Parte Geral reescrita em 1984. Essa costura entre duas épocas está visível no texto: a parte que fala de culpabilidade e pena é moderna, a que descreve os crimes carrega o vocabulário dos anos 40 — e vários artigos foram revogados sem que o número saísse do lugar.',
    observar: 'O art. 1º é o princípio da legalidade: não há crime sem lei anterior. Tudo o que vem depois só vale por causa dele. Repare também nos artigos marcados como revogados: eles contam o que o país deixou de considerar crime.',
    temas: ['Direito', 'Investigação e crime'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm',
    titulo: 'Código de Processo Penal',
    ano: 1941,
    chamada: 'Como se apura, como se acusa e como se defende.',
    porque: 'Do mesmo ano e do mesmo espírito autoritário do Código Penal, e por isso o mais remendado de todos: décadas de reformas tentaram encaixar um processo de inspiração fascista dentro de uma Constituição garantista. A costura aparece, e é justamente o que se estuda nele.',
    observar: 'Procure onde o texto trata da prisão e compare com o art. 5º da Constituição. Onde os dois discordam, quem vence é a Constituição — e saber por quê é metade do processo penal.',
    temas: ['Direito', 'Investigação e crime'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm',
    titulo: 'Código de Processo Civil',
    ano: 2015,
    chamada: 'As regras do jogo quando duas pessoas discordam e vão ao juiz.',
    porque: 'O primeiro código processual brasileiro escrito inteiramente sob a Constituição de 1988. Trocou o de 1973 tentando resolver a lentidão — e o fez apostando em precedente, em cooperação entre as partes e em resolver o conflito antes do julgamento.',
    observar: 'Os doze primeiros artigos são "normas fundamentais" e não existiam no código anterior. Leia-os primeiro: eles dizem em que espírito o resto deve ser lido.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm',
    titulo: 'Consolidação das Leis do Trabalho',
    ano: 1943,
    chamada: 'O que separa um emprego de um favor.',
    porque: 'A CLT de 1943 reuniu leis esparsas num texto só, no governo Vargas, e virou o eixo da relação de trabalho no Brasil por oito décadas. A reforma de 2017 mexeu em mais de cem artigos e é a maior mudança que ela já sofreu — o texto compilado aqui já a inclui.',
    observar: 'O art. 3º define empregado por quatro requisitos. Guarde-os: quase toda discussão trabalhista, inclusive sobre aplicativo, é sobre se eles estão presentes.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm',
    titulo: 'Código de Defesa do Consumidor',
    ano: 1990,
    chamada: 'A lei que parte do princípio de que os dois lados não são iguais.',
    porque: 'Veio de uma ordem expressa da Constituição de 1988 e é o texto brasileiro mais copiado no exterior. A ideia central é simples e radical: quando alguém compra de uma empresa, os dois não estão em pé de igualdade, e a lei corrige isso de saída.',
    observar: 'Procure o que o código chama de "prática abusiva" e leia a lista inteira. É a parte que mais aparece na vida de qualquer pessoa.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9610.htm',
    titulo: 'Lei de Direitos Autorais',
    ano: 1998,
    chamada: 'A lei que decide o que este acervo pode e não pode servir — e que, por si mesma, é livre.',
    porque: 'É a norma que organiza toda a decisão de arquitetura desta biblioteca: o art. 41 dá setenta anos após a morte do autor, o art. 7º trata a tradução como obra nova com dono próprio, e o art. 8º diz que a própria lei não é protegida. Os três artigos juntos explicam por que Machado de Assis está aqui inteiro, por que Foucault não, e por que este texto pode estar.',
    observar: 'Leia o art. 8º e depois o art. 41. O primeiro é a razão de esta lei estar no acervo; o segundo é a razão de a maior parte dos livros não estar.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm',
    titulo: 'Lei Maria da Penha',
    ano: 2006,
    chamada: 'Uma lei com nome de pessoa, porque foi uma pessoa que a arrancou do Estado.',
    porque: 'Maria da Penha Maia Fernandes levou vinte anos e uma condenação do Brasil na Comissão Interamericana de Direitos Humanos para que a violência doméstica deixasse de ser tratada como infração de menor potencial ofensivo. A lei de 2006 criou medidas protetivas de urgência — que agem antes do julgamento, e é aí que está a diferença.',
    observar: 'O art. 7º lista cinco formas de violência doméstica, e só uma delas é física. Essa lista mudou o que a palavra "violência" significa no Direito brasileiro.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm',
    titulo: 'Lei Geral de Proteção de Dados',
    ano: 2018,
    chamada: 'O que uma empresa pode fazer com o que sabe sobre você.',
    porque: 'Inspirada no regulamento europeu, entrou em vigor em 2020 e obriga qualquer sistema que trate dado de brasileiro — inclusive este. As decisões de guardar só o começo do IP, de deixar apagar a conta de verdade e de explicar o que fica no navegador saíram daqui.',
    observar: 'O art. 18 lista o que você pode exigir de quem tem seus dados. Leia como uma lista de botões que todo site deveria ter.',
    temas: ['Direito', 'Tecnologia e IA'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l8069compilado.htm',
    titulo: 'Estatuto da Criança e do Adolescente',
    ano: 1990,
    chamada: 'A criança deixou de ser objeto de tutela e virou sujeito de direito — num texto só.',
    porque: 'O ECA rompeu com o Código de Menores de 1979, que tratava a criança pobre como caso de polícia. A palavra que muda tudo é "sujeito": a criança passa a ter direitos que o Estado deve garantir, e não favores que ele pode conceder. É a lei que criou o conselho tutelar e a medida socioeducativa.',
    observar: 'Compare como o texto trata a criança "em situação de risco" e o adolescente "em conflito com a lei". A diferença de tom entre as duas partes é o debate brasileiro sobre menoridade inteiro.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
    titulo: 'Código Tributário Nacional',
    ano: 1966,
    chamada: 'Quando o Estado pode tirar dinheiro de você, e até onde.',
    porque: 'De 1966, é anterior à Constituição atual e mesmo assim continua de pé, recebido como lei complementar. Define o que é tributo, quando ele nasce e quando prescreve — a gramática de toda cobrança que o governo faz.',
    observar: 'Procure a definição de "tributo" no art. 3º. Cada palavra dela foi escolhida para excluir alguma coisa; saber o que ela exclui é meio Direito Tributário.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm',
    titulo: 'Código de Trânsito Brasileiro',
    ano: 1997,
    chamada: 'As regras de dividir a rua — e de quem responde quando elas falham.',
    porque: 'Trocou o Código Nacional de Trânsito de 1966 e trouxe a ideia de que a via é um espaço compartilhado, com o pedestre no topo da prioridade. É a lei que mais gente encosta na vida sem nunca ter lido.',
    observar: 'Repare em quem o código coloca como responsável pela segurança: não é só o motorista, é também o órgão que cuida da via. Essa divisão de culpa aparece em todo acidente.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l7210compilado.htm',
    titulo: 'Lei de Execução Penal',
    ano: 1984,
    chamada: 'O que acontece depois da condenação — e o que a pena não pode virar.',
    porque: 'De 1984, ainda sob a ditadura, e mesmo assim uma das leis penais mais avançadas do mundo no papel. Define a pena como caminho de volta, com progressão de regime e direitos do preso. A distância entre o que ela promete e o que o sistema prisional cumpre é o assunto dela.',
    observar: 'Leia o art. 1º: a execução deve "proporcionar condições para a harmônica integração social". Guarde a frase e compare com qualquer notícia sobre presídio.',
    temas: ['Direito', 'Investigação e crime'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741compilado.htm',
    titulo: 'Estatuto do Idoso',
    ano: 2003,
    chamada: 'Uma idade vira um conjunto de direitos exigíveis.',
    porque: 'Reuniu num texto só a proteção de quem tem sessenta anos ou mais, de prioridade em fila a crime de abandono. Nasceu da constatação de que a velhice, num país que envelhece rápido, estava desprotegida por leis espalhadas.',
    observar: 'Note quantos artigos tratam da família, e não do Estado. A lei aposta que o primeiro responsável pelo idoso é quem mora perto — e diz o que acontece quando esse alguém falha.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm',
    titulo: 'Lei Brasileira de Inclusão da Pessoa com Deficiência',
    ano: 2015,
    chamada: 'A deficiência sai do corpo e passa a ser da barreira que o cerca.',
    porque: 'Também chamada Estatuto da Pessoa com Deficiência, traduziu para o Brasil a Convenção da ONU sobre o tema. A virada é conceitual: a pessoa não é "incapaz", o ambiente é que é inacessível — e a lei manda mudar o ambiente.',
    observar: 'Procure o conceito de "acessibilidade" e o de "desenho universal". Eles transformam obrigação de tratamento especial em obrigação de projetar para todos desde o começo.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm',
    titulo: 'Marco Civil da Internet',
    ano: 2014,
    chamada: 'A constituição da internet brasileira: o que a rede garante e o que ela não pode fazer.',
    porque: 'Feito depois de uma consulta pública aberta, fixou neutralidade de rede, proteção à privacidade e a regra de que um site só responde por conteúdo de terceiro depois de ordem judicial. É a base sobre a qual toda discussão de internet no Brasil acontece.',
    observar: 'O art. 19 é o mais disputado do país hoje: ele decide quando uma plataforma responde pelo que o usuário publica. Leia-o sabendo que o Supremo o revisita.',
    temas: ['Direito', 'Tecnologia e IA'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm',
    titulo: 'Lei de Acesso à Informação',
    ano: 2011,
    chamada: 'O padrão virou o avesso: o dado público é aberto, e o sigilo é que precisa de justificativa.',
    porque: 'Inverteu a lógica do Estado brasileiro: antes, tudo era fechado até alguém liberar; agora, tudo é aberto até alguém provar que precisa ser sigiloso. É a ferramenta de qualquer pessoa que queira saber o que o governo faz com o dinheiro dela.',
    observar: 'Veja os prazos de resposta que ela impõe ao poder público. O direito só é real por causa do prazo — sem ele, "vou verificar" seria resposta suficiente.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11343.htm',
    titulo: 'Lei de Drogas',
    ano: 2006,
    chamada: 'A mesma substância, dois caminhos: tratamento para quem usa, prisão para quem vende — e a linha tênue entre os dois.',
    porque: 'Separou o usuário do traficante e tirou a prisão do horizonte de quem só porta para consumo. Mas deixou ao juiz decidir de que lado a pessoa está sem fixar quantidade — e é nessa lacuna que mora a maior crítica à lei.',
    observar: 'Leia o art. 28 (uso) ao lado do art. 33 (tráfico) e procure o critério que separa um do outro. A ausência de um número exato ali é a discussão inteira.',
    temas: ['Direito', 'Investigação e crime'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l8429compilada.htm',
    titulo: 'Lei de Improbidade Administrativa',
    ano: 1992,
    chamada: 'O que acontece com o agente público que trai a coisa pública sem necessariamente cometer crime.',
    porque: 'Criou uma responsabilidade própria, entre o crime e a mera falta: enriquecer às custas do cargo, causar prejuízo ao erário ou ferir os princípios da administração. A reforma de 2021 apertou as exigências e é o texto compilado que está aqui.',
    observar: 'Repare que a lei pune também quem age por vaidade ou desídia, não só por ganância. A categoria "atenta contra os princípios" é a mais aberta — e a mais debatida.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm',
    titulo: 'Lei de Licitações e Contratos Administrativos',
    ano: 2021,
    chamada: 'Como o Estado compra — e por que comprar mal é tão difícil de evitar.',
    porque: 'Substituiu a Lei 8.666/93 depois de quase trinta anos. Tenta casar duas coisas que puxam para lados opostos: dar velocidade à compra pública e blindá-la contra fraude. Cada artigo é uma aposta sobre onde está o maior risco.',
    observar: 'Procure as modalidades de licitação e o "diálogo competitivo", que é novo. Ele deixa o Estado conversar com o mercado antes de comprar — algo que a lei antiga tratava como suspeito.',
    temas: ['Direito'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12288.htm',
    titulo: 'Estatuto da Igualdade Racial',
    ano: 2010,
    chamada: 'O Estado reconhece, por escrito, uma dívida — e lista como pretende pagá-la.',
    porque: 'Reuniu políticas de promoção da igualdade racial num texto de lei, do direito à saúde da população negra à proteção das religiões de matriz africana. É documento e é declaração: nomeia o racismo como problema estrutural, e não como incidente.',
    observar: 'Veja como a lei trata a cultura e a terra de quilombo. Boa parte do estatuto é sobre reconhecer o que já existe, e não sobre criar algo novo.',
    temas: ['Direito', 'Política e sociedade'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651compilado.htm',
    titulo: 'Código Florestal',
    ano: 2012,
    chamada: 'A regra de quanto da sua terra não é sua para desmatar.',
    porque: 'Substituiu o código de 1965 numa das votações mais disputadas do Congresso, entre ruralistas e ambientalistas. Define a reserva legal e a área de preservação permanente — quanto de mata cada propriedade precisa manter, e por quê.',
    observar: 'Procure "área de preservação permanente" e note que ela protege margem de rio, topo de morro e nascente. A lógica não é estética: é que mexer ali derruba o resto.',
    temas: ['Direito', 'Ciência natural'],
  },
  {
    url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del4657compilado.htm',
    titulo: 'Lei de Introdução às Normas do Direito Brasileiro',
    ano: 1942,
    chamada: 'A lei sobre as leis: como uma norma nasce, quando começa a valer e o que fazer quando ela se cala.',
    porque: 'A LINDB não trata de um assunto, trata de todos: diz o que o juiz faz quando a lei é omissa, desde quando a norma obriga, e como o Brasil aplica lei estrangeira. Uma reforma de 2018 acrescentou artigos sobre a responsabilidade de quem decide na administração pública.',
    observar: 'O art. 4º manda o juiz decidir por analogia, costume e princípios quando a lei falta. É a prova, dentro da própria lei, de que ela não prevê tudo.',
    temas: ['Direito'],
  },
]

// ─────────────────────────────────────────────────────────────
// O HTML do Planalto
//
// É HTML de editor de texto dos anos 2000: `<p class="MsoNormal">` com
// `<span style=...>` dentro, tabelas de layout, âncoras a cada artigo. A
// limpeza é a mesma da normalização de livro — lista de permissão, nenhum
// atributo — e o corte em capítulos é por ARTIGO, que é a unidade real de
// leitura de uma lei.
// ─────────────────────────────────────────────────────────────

const PERMITIDAS = new Set(['p', 'em', 'strong', 'blockquote', 'br', 'ul', 'ol', 'li', 'h3'])
const TRADUZ = { i: 'em', b: 'strong', h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' }

function limpar(html) {
  return html
    .replace(/<(script|style|table|figure|svg|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(o:p|w:[a-z]+)[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (todo, tag) => {
      const alvo = TRADUZ[tag.toLowerCase()] ?? tag.toLowerCase()
      if (!PERMITIDAS.has(alvo)) return ''
      return todo.startsWith('</') ? `</${alvo}>` : `<${alvo}>`
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*(<br>\s*)*<\/p>/g, '')
    .trim()
}

/**
 * Três codificações no mesmo site, e nenhuma anunciada direito.
 *
 * O Planalto tem quarenta anos de arquivos feitos em editores diferentes:
 * alguns em latin-1, alguns em UTF-8, e alguns — a Lei Maria da Penha, por
 * exemplo — em **UTF-16LE com marca de ordem de bytes**. O cabeçalho HTTP diz
 * `text/html` e mais nada.
 *
 * Ler UTF-16 como UTF-8 não dá erro: dá 264 KB de lixo em que nenhuma tag
 * casa, e o script conclui que "a lei só tem um pedaço". Erro que não parece
 * erro é o que custa caro.
 */
function decodificar(cru) {
  if (cru[0] === 0xff && cru[1] === 0xfe) return cru.toString('utf16le')
  if (cru[0] === 0xfe && cru[1] === 0xff) return cru.swap16().toString('utf16le')
  const comoUtf8 = cru.toString('utf8')
  // muitos caracteres de substituição = era latin-1 e não avisou
  return (comoUtf8.match(/�/g) || []).length > 20 ? cru.toString('latin1') : comoUtf8
}

const texto = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim()
const palavras = (html) => texto(html).split(' ').filter(Boolean).length

/**
 * Corta a lei em unidades de leitura.
 *
 * A unidade não é o capítulo: é o **artigo**, com os parágrafos e incisos
 * dele. É assim que se lê uma lei, é assim que se cita, e é o que faz o
 * sumário do leitor virar um índice utilizável em vez de uma lista de quatro
 * títulos gigantes.
 *
 * Artigos curtos são agrupados até formar uma tela — cem artigos de duas
 * linhas viram cem "capítulos" inúteis.
 */
function partirEmArtigos(html) {
  const miolo = limpar(html)
  const paragrafos = miolo.split(/(?=<p>)/i).filter(p => texto(p).length > 0)

  const pedacos = []
  let atual = null

  for (const p of paragrafos) {
    const t = texto(p)
    // "Art. 5º", "Art. 121.", "Artigo 1º" — e só no COMEÇO do parágrafo,
    // senão toda referência cruzada abriria um artigo novo.
    const marca = t.match(/^Art(?:igo)?\.?\s*(\d+)/i)
    const titulo = t.match(/^(T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|LIVRO|PREÂMBULO|ANEXO)\b[^.]{0,80}/i)

    if (marca) {
      if (atual && atual.palavras >= 300) { pedacos.push(atual); atual = null }
      if (!atual) atual = { titulo: `Art. ${marca[1]}`, ate: marca[1], html: '', palavras: 0 }
      else atual.ate = marca[1]
    } else if (titulo && (!atual || atual.palavras >= 200)) {
      if (atual) pedacos.push(atual)
      atual = { titulo: t.slice(0, 70), ate: null, html: '', palavras: 0 }
    } else if (!atual) {
      atual = { titulo: 'Preâmbulo', ate: null, html: '', palavras: 0 }
    }

    atual.html += p
    atual.palavras += palavras(p)
  }
  if (atual) pedacos.push(atual)

  return pedacos
    .filter(p => p.palavras >= 8)
    .map(p => ({
      // "Art. 5 a 9" quando vários couberam no mesmo pedaço
      titulo: p.ate && p.ate !== p.titulo.replace(/\D/g, '') ? `${p.titulo} a ${p.ate}` : p.titulo,
      corpo: p.html,
      palavras: p.palavras,
    }))
}

// ─────────────────────────────────────────────────────────────

const banco = abrir()

const sql = {
  achaPessoa: banco.prepare('SELECT id FROM pessoa WHERE nome = ?'),
  poePessoa: banco.prepare('INSERT INTO pessoa (nome, nome_ordem) VALUES (?,?)'),
  achaObra: banco.prepare("SELECT id FROM obra WHERE titulo = ? AND idioma_original = 'pt'"),
  poeObra: banco.prepare(
    `INSERT INTO obra (titulo, ano, idioma_original, pais_origem, trilho, publicada, nivel, assuntos)
     VALUES (?,?,'pt','BR','A',1,'academico',?)`),
  mede: banco.prepare('UPDATE obra SET paginas = ?, minutos_leitura = ? WHERE id = ?'),
  liga: banco.prepare('INSERT OR IGNORE INTO obra_pessoa (obra_id, pessoa_id, papel) VALUES (?,?,?)'),
  achaTema: banco.prepare('SELECT id FROM tema WHERE nome = ?'),
  poeObraTema: banco.prepare('INSERT OR REPLACE INTO obra_tema (obra_id, tema_id, peso) VALUES (?,?,?)'),
  poeTexto: banco.prepare(
    `INSERT INTO texto (obra_id, idioma, fonte, fonte_id, fonte_url, formato, normalizado, palavras)
     VALUES (?,'pt','planalto',?,?,'html',1,?)`),
  achaTexto: banco.prepare("SELECT id FROM texto WHERE fonte = 'planalto' AND fonte_id = ?"),
  limpaCap: banco.prepare('DELETE FROM capitulo WHERE texto_id = ?'),
  // Reprocessar uma lei já existente não pode deixar rastro dobrado: sem estas
  // três limpezas, rodar de novo duplicava o índice de busca e os cartões da
  // ficha. Assim `legislacao.mjs` é idempotente sem precisar de um reindex.
  limpaBuscaCap: banco.prepare('DELETE FROM busca_capitulo WHERE texto_id = ?'),
  limpaBuscaObra: banco.prepare('DELETE FROM busca_obra WHERE conteudo_obra_id = ?'),
  limpaFrag: banco.prepare(
    "DELETE FROM fragmento WHERE obra_id = ? AND tipo IN ('chamada','porque_existe','como_ler')"),
  poeCap: banco.prepare(
    'INSERT INTO capitulo (texto_id, ordem, titulo, corpo, palavras) VALUES (?,?,?,?,?)'),
  poeDireito: banco.prepare(
    `INSERT OR REPLACE INTO direito (texto_id, jurisdicao, estado, motivo, verificado_por, verificado_em)
     VALUES (?,?,?,?,'humano',datetime('now'))`),
  poeFrag: banco.prepare(
    `INSERT INTO fragmento (obra_id, tipo, titulo, corpo, revela_ate, natureza, gerado_por, revisado)
     VALUES (?,?,?,?,0,?,'humano',1)`),
  indexa: banco.prepare('INSERT INTO busca_capitulo (corpo, capitulo_id, texto_id) VALUES (?,?,?)'),
  busca: banco.prepare(
    'INSERT INTO busca_obra (titulo, titulo_pt, autores, temas, resumo, conteudo_obra_id) VALUES (?,?,?,?,?,?)'),
}

// "Brasil" é o autor de uma lei brasileira. Não é piada: é como a Biblioteca
// do Congresso e a Biblioteca Nacional catalogam ato normativo.
const brasil = sql.achaPessoa.get('Brasil')
  ?? { id: sql.poePessoa.run('Brasil', 'Brasil').lastInsertRowid }

const MOTIVO = 'Lei 9.610/98, art. 8º, IV: textos de leis, decretos, regulamentos, '
  + 'decisões judiciais e demais atos oficiais NÃO são objeto de proteção como direitos autorais. '
  + 'Livre por definição, em qualquer lugar e para sempre.'

// `FIO_SO_LEI=trecho` processa só as leis cujo título contém o trecho — para
// reprocessar uma que falhou sem re-baixar o acervo inteiro.
const FILTRO = process.env.FIO_SO_LEI
const AFAZER = FILTRO ? LEIS.filter(l => l.titulo.includes(FILTRO)) : LEIS

let feitas = 0, erros = 0
for (const [k, lei] of AFAZER.entries()) {
  process.stdout.write(`[${k + 1}/${AFAZER.length}] ${lei.titulo.padEnd(48)}`)
  try {
    // Com teto de tempo: o Planalto às vezes aceita a conexão e não responde,
    // e um `fetch` sem `signal` fica pendurado para sempre — uma lei travava a
    // fila inteira, sem erro, sem log. 90s é folgado até para um código grande.
    const r = await fetch(lei.url, { headers: CABECALHOS, signal: AbortSignal.timeout(90000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)

    const html = decodificar(Buffer.from(await r.arrayBuffer()))

    const artigos = partirEmArtigos(html)
    if (artigos.length < 3) throw new Error(`só ${artigos.length} pedaços`)

    const total = artigos.reduce((s, a) => s + a.palavras, 0)

    banco.exec('BEGIN')
    const obraId = Number(
      sql.achaObra.get(lei.titulo)?.id
      ?? sql.poeObra.run(lei.titulo, lei.ano, `${lei.titulo}; legislação brasileira; ato oficial`).lastInsertRowid)
    sql.mede.run(Math.round(total / 250), Math.round(total / 220), obraId)
    sql.liga.run(obraId, Number(brasil.id), 'autor')
    for (const t of lei.temas) {
      const tema = sql.achaTema.get(t)
      if (tema) sql.poeObraTema.run(obraId, Number(tema.id), t === lei.temas[0] ? 1 : 0.5)
    }

    const textoId = Number(
      sql.achaTexto.get(lei.url)?.id
      ?? sql.poeTexto.run(obraId, lei.url, lei.url, total).lastInsertRowid)
    banco.prepare('UPDATE texto SET palavras = ?, normalizado = 1 WHERE id = ?').run(total, textoId)

    sql.limpaCap.run(textoId)
    sql.limpaBuscaCap.run(textoId)
    artigos.forEach((a, i) => {
      const id = Number(sql.poeCap.run(textoId, i + 1, a.titulo, a.corpo, a.palavras).lastInsertRowid)
      sql.indexa.run(texto(a.corpo), id, textoId)
    })

    for (const j of ['BR', 'US', '*']) sql.poeDireito.run(textoId, j, 'dominio_publico', MOTIVO)

    sql.limpaFrag.run(obraId)
    sql.limpaBuscaObra.run(obraId)
    sql.poeFrag.run(obraId, 'chamada', null, lei.chamada, 'fato')
    sql.poeFrag.run(obraId, 'porque_existe', 'Por que este texto existe', lei.porque, 'fato')
    sql.poeFrag.run(obraId, 'como_ler', 'O que observar', lei.observar, 'interpretacao')
    sql.busca.run(lei.titulo, lei.titulo, 'Brasil', lei.temas.join(' ') + ' lei legislação', '', obraId)
    banco.exec('COMMIT')

    console.log(`${String(artigos.length).padStart(4)} trechos  ${(total / 1000).toFixed(0)}k palavras`)
    feitas++
  } catch (e) {
    try { banco.exec('ROLLBACK') } catch { /* nada aberto */ }
    console.log(`erro: ${e.message.slice(0, 40)}`)
    erros++
  }
  await new Promise(r => setTimeout(r, PAUSA))
}

console.log(`\nleis no acervo .. ${feitas}`)
if (erros) console.log(`falharam ........ ${erros}`)
fechar()
