# A biblioteca de descoberta — o que foi pedido, e em que pé está

Base: o direcionamento que o dono trouxe em 16/09/2026 (escrito com o GPT, a
partir do gosto dele). A ideia central: a home não é catálogo por gênero; é
uma porta para "que experiência você quer ter agora?", e um livro leva a outro.

Onde mora:
- curadoria (seções, ordem, Antes de ler, conexões): `ingestao/descoberta.mjs`
- gravar seções no banco: `node ingestao/secoes.mjs --banco /dados/catalogo.db --gravar`
- catálogo do site: `ingestao/publicar.mjs` (ordena, esconde coleção sem legível, põe as fichas)
- remendos no site no ar: `infra/remendar-bundle.mjs` (base: `/opt/fio/site/ativos/index-DBmeFHaL.js`, o original)

Regra que não muda: só entra livro que se lê aqui (domínio público, tradução
nossa ou texto oficial). Duna, Tolkien, Mistborn, Cradle, Witcher, Camus,
Huxley, Hesse, Borges, Clarice, Guimarães Rosa, Kelsen, Hart, Dworkin têm dono.

## Estado, item por item

| # | Pedido | Estado |
|---|---|---|
| 1 | Home com cara própria ("Leia algo que vale a pena lembrar") | **pendente** — frase e topo novos |
| 1 | "Continuar explorando" personalizado pelo histórico | **parcial** — existe "Você parou aqui" e "Para ler depois"; recomendação por histórico falta (tabelas `perfil_leitor`/`recomendacao` já existem) |
| 2 | Livros que mudam a maneira de ver o mundo | **feito** |
| 3 | Antes de ler (o que é, encontra, dificuldade, ritmo, gostou de, não espere) | **feito para 28 livros**; os demais é curadoria contínua |
| 4 | Entre impérios, reis e conspirações | **feito** como "Poder, reis e impérios" (sem os protegidos) |
| 5 | Quero entrar em um mundo | **feito**; "escala do mundo" (regional → galáctico) **pendente** |
| 6 | Construção de mundo com notas (mundo, história, política…) | **pendente** — precisa de campo e de tela |
| 7 | Sensação de RPG com atributos | **pendente** (tela); LitRPG é todo protegido |
| 8 | Progressão | **feito** ("de ninguém a lenda"); barra visual **pendente** |
| 9 | Livros que parecem anime | **fundido** em Progressão e "Se você gostou de Baki"; web novels são protegidas |
| 10 | "O que você quer entender?" por perguntas | **parcial** — "Como devo viver?" e "Rota: entender o Estado"; faltam "Quem sou eu?", "O que é verdade?", "O que é justiça?" |
| 11 | Direito, Estado e poder | **feito** (rota + "A lei, na íntegra", 24 leis); Weber é livre mas sem fonte confiável |
| 12 | Linha do tempo navegável | **parcial** — "Como chegamos até aqui" em ordem; navegação por período **pendente** |
| 13 | Entre na cabeça de alguém | **feito** |
| 14 | O homem contra ele mesmo | **feito** |
| 15 | "Você gostou de…" | **feito** (Baki, Vincenzo, Fundação); mais **pendente** |
| 16 | Termina rápido / faixas de tempo | **parcial** — botão "tenho meia hora" e "Cabe numa tarde" |
| 17 | Calhamaços | **feito** ("Um livro para morar dentro" + botão) |
| 18 | Brasil que merece ser descoberto | **feito**; sub-coleções (profundo, político…) **pendente**; Graciliano é livre desde 2024 mas sem fonte limpa |
| 19 | Livros estranhos | **feito**; visual escuro próprio **pendente** |
| 20 | Rotas de leitura | **feito** 3 (Nietzsche, Estado, ficção científica) como seções em ordem; página de rota com passos **pendente** |
| 21 | Tags conceituais | **feito** nas 28 fichas ("ideias"); página por tag e ligação automática **pendente** |
| 22 | Identidade visual das capas por coleção | **pendente** (dá para fazer como as capas das leis) |
| 23 | "O que você quer sentir hoje?" | **feito** — 10 botões de humor |
| — | Conexões ("este livro conversa com…") | **feito para 28 livros** |
| — | Tirar "O que ainda não podemos servir" | **feito** |
| — | Link do painel no site, só para admin | **feito** |

## Livros na esteira para as seções

Enfileirados em 16/09 (fonte conferida, tradutor livre quando havia):
Além do Bem e do Mal, Crepúsculo dos Ídolos, O Nascimento da Tragédia, Ecce
Homo (alemão original), Memórias do Subsolo (Garnett), Leviatã, Segundo
Tratado sobre o Governo, O Espírito das Leis I–V e Da Democracia na América I
(francês original), Bushido, Contos do Japão Antigo, O Grande Gatsby, Cândido
(francês), O Livro da Selva, Odisseia (Butler), O Homem Que Era Quinta-Feira —
mais os 12 de história de 15/09. Ficaram de fora por fonte: O Anticristo e
Genealogia da Moral (só há a tradução de Mencken, m. 1956), O Idiota
(tradutora sem data de morte confirmada).

## O que destrava o resto

Os itens de tela (barras, notas, escala, linha do tempo navegável, página de
rota e de tag, visual por coleção) cabem mal em remendo de bundle. O caminho
é reconstruir `web/src` até alcançar o site no ar e voltar a publicar pelo
build — ver a trava em `infra/publicar.sh`.

Cuidado: `generos.mjs --gravar` republica as prateleiras de gênero antigas.
Se rodá-lo, rode `secoes.mjs --gravar` depois.
