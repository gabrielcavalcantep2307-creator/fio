# Auditoria — 16/09/2026

Escopo: tudo o que entrou em 15 e 16/09 (painel e configurações, portão de
leitura, login por usuário, leis, capas, seções de descoberta, gosto,
recomendações e avisos, quadrinhos e mangá, remendos do bundle) e os caminhos de
deploy que tocam produção.

Método: 84 testes automatizados (6 novos), sondas contra o site no ar, leitura
do código novo e dos scripts de deploy, e verificação das telas no navegador.

## Achados corrigidos

| # | Gravidade | Achado | Correção |
|---|---|---|---|
| 1 | **alta** | `servidor/fundir.mjs` substituiria o catálogo de produção (leis, capas, seções, traduções feitas direto na VPS) por um catálogo local mais velho, sem aviso. | Trava: recusa catálogo mais velho ou menor que o de produção (`FIO_FUNDIR_FORCAR=1` passa por cima). Testada com dois bancos. As tabelas de gente novas foram listadas. |
| 2 | **alta (LGPD)** | Conta criada só com nome de usuário **não conseguia se apagar**: servidor e duas telas exigiam o e-mail, que é opcional desde 11/09. | Servidor aceita o usuário ou o e-mail; 6 remendos nas duas telas. Provado no ar: texto errado recusado, usuário correto apaga, sessão morre. |
| 3 | média | O deploy do servidor extraía por cima e nunca apagava: a VPS ainda carregava o `email.mjs` removido em 41cb983. | `publicar-so-servidor.sh` troca a pasta inteira (a cópia fica em `servidor.antes`). |
| 4 | média | Link do painel levava a `/obra/N`, que abria a home com o endereço errado. | Link corrigido para `/#/obra/N`, e o servidor redireciona (302) qualquer `/obra`, `/autor`, `/ler`, `/tema`… para o endereço de hash. Sem redirecionamento aberto. |
| 5 | média | A busca de capas morreu no meio: o deploy recria o container e leva o `/tmp`. | Progresso e lista em `/dados`, que sobrevive; rodar de novo retoma sem refazer busca. |
| 6 | média | O leitor de quadrinhos em modo rolagem dependia de `IntersectionObserver`, que não dispara em aba escondida: nenhuma imagem carregava. | Carregamento preguiçoso nativo (`loading=lazy`), as 3 primeiras imediatas. |
| 7 | baixa | Metade do acervo japonês sumia da busca: títulos do Internet Archive vêm com mácron decomposto. | Normalização NFC antes de comparar (19 → 34 séries). |
| 8 | baixa | Álbuns japoneses creditados ao editor (Eirakuya, Tanaka) em vez do artista. | Lista de mestres tem prioridade no crédito. |
| 9 | baixa | A central escrevia "null" no topo; o resumo dizia "pelo que você disse gostar" para quem só tinha leitura. | Filtro dos nós vazios; resumo pelo sinal real. |
| 10 | baixa | O destaque da home sorteava leis ("Lei de Drogas" como sugestão de leitura). | Leis fora do sorteio; livros da curadoria entram com o "você vai encontrar". |
| 11 | baixa | Cabeçalho mostrava "sr." para o nome "Sr. Livrario". | Pula abreviação. |
| 12 | baixa | Seis bundles remendados antigos acumulados na VPS. | Removidos; ficam o original (base dos remendos) e o atual. |

## Verificado e sem problema

- **Rotas novas** (`/api/gosto`, `/api/recomendacoes`, `/api/avisos`, `/api/avisos/contagem`, `/api/avisos/lido`): 401 sem sessão; POST sem `x-fio` ou de outra origem → 403. Toda consulta presa ao id da sessão; nenhuma aceita id de leitor vindo de fora.
- **Questionário:** só aceita escolha de lista fechada. Teste com `<img onerror>`, autor inventado e id fora da vitrine: tudo descartado.
- **Avisos:** o de um leitor nunca aparece para outro (teste); links montados só no servidor; a central só segue link que começa com `/` e não com `//`.
- **Recomendação:** nunca devolve o que a pessoa já lê; a leitura real passa na frente do questionário; sem sinal, não inventa (testes).
- **XSS nas páginas próprias:** painel, central, estante e leitor de quadrinhos escrevem texto só por nó de texto. Imagem de quadrinho só com caminho `/quadrinhos/`.
- **Travessia de pasta:** `/quadrinhos/../../etc/passwd` e variações codificadas devolvem o `index.html` do app, nunca o arquivo.
- **Cabeçalhos:** CSP, `X-Frame-Options: DENY` e `nosniff` presentes nas páginas novas.
- **Log do servidor:** nenhum erro nas últimas 6 horas.
- **Exclusão em cascata:** apagar conta leva gosto e avisos (conferido: zero órfãos).
- **Direito:** cada volume de quadrinho conferido na ficha da instituição; Pepper&Carrot com o crédito CC-BY em cada episódio; manhwa "traduzido PT-BR" identificado como pirata e excluído.

## Riscos conhecidos, não corrigidos agora

- **Esteira depende do PC ligado.** Mitigado com retomada pelo caderno; a solução é tirá-la do PC.
- **Site no ar sem fonte versionado.** Mitigado pelos remendos registrados e pela trava; a solução é reconstruir `web/src`.
- **Portão de leitura por faixa de IP:** conta igual quem divide a mesma rede (escola, operadora). Aceito para o tamanho atual.
- **Progresso de quadrinhos só no navegador:** não sincroniza entre aparelhos.
- **Cache de `/api/livro` para anônimo:** o cabeçalho `public, max-age` é sobrescrito por `no-store` em `responder()`. É desempenho, não segurança.
- **Cadastro aberto:** decisão do dono (15/09), exigida pelo portão de leitura. Um clique no painel fecha.

## Adendo — catálogo de mangás (16/09, tarde)

- **Consulta ao AniList:** variável enviada como null vira filtro "campo vazio" e zerava a lista. A consulta agora é montada só com os filtros escolhidos.
- **Entrada do leitor:** tipo, cor, gênero, status e ordem só de listas fechadas; busca saneada e cortada em 60 caracteres; página limitada a 200 (teste).
- **Proxy de capas:** só aceita `/file/anilistcdn/media/manga/cover/(medium|large)/<arquivo>` do CDN do AniList, sem seguir redirecionamento, só `image/jpeg|png|webp`, até 2 MB, com cache em memória de até 40 MB. Caminho estranho → 404 (teste e sonda no ar).
- **Links "onde ler":** só https, sem redes sociais (teste com `javascript:` e Twitter).
- **Abuso:** freio de 90/min por faixa de IP; teto global de 25 chamadas/min ao AniList, servindo o cache antigo quando o teto estoura. POST na rota → 405.
- **Termos do AniList:** uso não comercial; nada do catálogo é guardado em disco; crédito na página e em cada ficha.

## Adendo 2 — assinaturas, publicações e o filtro dos quadrinhos (17/09)

93 testes (6 novos), sondas no ar, 400 imagens reais passadas pela limpeza e
decodificadas de novo, e o fluxo inteiro feito no navegador (criar obra, capa,
capítulo com páginas JPG/PNG/WebP, enviar, aprovar no painel, filtrar, ler).

### Corrigidos

| # | Gravidade | Achado | Correção |
|---|---|---|---|
| 13 | média | **Filtro dos quadrinhos não marcava** (relatado pelo dono): o painel era montado uma vez e o clique mudava o filtro sem remarcar os botões — "Todos" ficava aceso. | Os botões do grupo se remarcam a cada clique (Descobrir e Ler aqui). |
| 14 | média | **Segundo filtro rápido era ignorado:** clicar em "Manhwa" e logo em "Colorido" descartava o segundo enquanto a primeira busca carregava; a lista mostrava só o primeiro filtro. | Filtro novo passa sempre; a resposta velha é descartada pelo contador de pedidos. Conferido no ar. |
| 15 | baixa | "null" escrito na ficha da obra (mesmo defeito da central em 16/09). | Todo redesenho das páginas novas passa por `por()`, que tira nulos. |
| 16 | baixa | Trocar de "Quadrinhos" para "Tudo" deixava o filtro de cor valendo, escondido. | Trocar de tipo limpa formato e cor. |
| 17 | baixa | Classificação 10+ aparecia antes de "Livre"; campos de quadrinho apareciam para livro (`display:grid` vencia `hidden`). | Ordem fixa; `[hidden]` com `!important`. |

### Verificado e sem problema

- **Upload:** SVG, HTML, GIF, `win.ini`, JPEG falso (`FFD8FF` + HTML), PNG com CRC adulterado e imagem de 20.000 px → recusados. PNG com `tEXt` + HTML colado depois do `IEND` e JPEG com EXIF/GPS + comentário `<script>` + ZIP colado → saem sem nada disso (testes).
- **Sem sessão, sem `x-fio` ou de outra origem:** upload recusado (401/403). Corpo acima de 5 MB → 413 enquanto chega.
- **Arquivo de obra em revisão:** 404 para anônimo e para outra conta; dono e admin veem com `private, no-store`. Publicado: `public`, `nosniff`, `content-security-policy: default-src 'none'; sandbox`.
- **Travessia:** `/api/pub-arquivo/..%2f..%2fcatalogo.db` → 404 (nome precisa ser 32 hex + extensão e ter linha no banco).
- **Página de outra obra** ou caminho inventado num capítulo → recusado; imagem na obra alheia → 404 (testes).
- **Limites do plano** conferidos no servidor (obras, capítulos, páginas, caracteres, espaço); conta sem plano → 403. Rota de admin → 404 para leitor.
- **Denúncia:** uma por conta por obra; três contas → suspensa e fora da vitrine (teste).
- **LGPD:** exportação leva assinatura e publicações com os capítulos; apagar a conta leva tudo em cascata, e a faxina apaga os arquivos que ficaram no disco.

### Riscos conhecidos

- **A limpeza é estrutural, não redecodifica a imagem.** Um conteúdo escondido *dentro* dos dados comprimidos continuaria lá — mas só como bytes de imagem, servidos com o tipo certo, `nosniff` e CSP `sandbox`, por uma rota que nunca executa nada. Redecodificar exigiria biblioteca de imagem.
- **O servidor está nos EUA** (DigitalOcean, New Jersey): vale também a lei americana. Ver `docs/CAMINHOS-LEGAIS.md`.
- **Antes de cobrar:** licença comercial do AniList acima de US$ 150/mês de receita, e a licença dos modelos de tradução (NLLB é CC-BY-NC). Ver `CAMINHOS-LEGAIS.md` §0.
- **Revisão é manual:** com muitos autores, a fila cresce. Hoje só publica quem o dono escolhe, então o volume é pequeno.

## Adendo 3 — planos com limite real, barra única, esteira ao vivo, voz, correções e Little Nemo (17/09, tarde)

96 testes (3 novos: limite do plano grátis, pulso da esteira, correções; 2 ampliados: denúncia não suspende, edição pendente não sai do ar). Sondas no ar depois do deploy.

### Corrigidos ou mudados por decisão do dono

| # | Gravidade | Achado | Correção |
|---|---|---|---|
| 18 | **alta** | Sem ajuste gravado, o limite do plano grátis virava **0 livros** (`Number(null)` é 0) e trancaria todo mundo. Pego pelo teste novo antes do deploy. | Sem ajuste, vale o padrão (3). |
| 19 | média | Denúncia suspendia a obra sozinha (3 contas). | Vai para a fila do painel; só a administração suspende. |
| 20 | média | Editar capítulo publicado o tirava do ar até a revisão. | A edição espera em colunas `*_pendente`; a versão publicada segue no ar; página nova da edição não é servida ao público até aprovar (teste). |
| 21 | média | A fila do painel mostrava "29 na esteira" com a esteira parada havia dias: só mudava quando alguém rodava `puxar-fila.mjs`. | Pulso da esteira + reconciliação da fila a cada leitura do painel. |
| 22 | baixa | "null" escrito na barra do celular das páginas soltas. | Nós nulos fora do `replaceChildren`. |

### Verificado no ar

- Sem conta: `/api/livro/1050` sai com 2 capítulos (1º + convite); lei (`/api/livro/660`) sai inteira; `/api/livro/…/epub` → 302 para os planos; volume 2 de quadrinho → 401, volume 1 → 200.
- Pulso sem chave → 404; com a chave → gravado. Chave só no `.env` (modo 600) e em `dados/traducoes/.chave-esteira` (fora do git).
- "ouvir" sem plano leva a `/assinaturas.html?por=voz`. Busca aberta a partir das páginas soltas.
- Correção entra só como texto (HTML escapado, teste com `<img onerror>`), só se o trecho for único no capítulo.
- Little Nemo: 260 páginas, todas marcadas domínio público no Commons, baixadas com user-agent identificado.

### Riscos conhecidos

- Voz e velocidade são conferidas no navegador (o custo é zero para o servidor; quem burlar só usa a voz do próprio aparelho).
- O limite do grátis conta por conta; quem criar várias contas lê mais. Aceitável enquanto o cadastro não tem verificação.
- OCR do Windows não lê letra desenhada à mão; a tradução de Little Nemo depende da chave do Google Vision.

## Adendo 4 — curadoria, estúdio, conta, controle de fluxo e acervo novo (18/09)

101 testes (5 novos: curadoria, controle de fluxo, meta/quadrinhos na conta/seguir obra, regra de todos os autores e tradutores; os da esteira ampliados). Sondas no ar depois do deploy.

### Corrigidos

| # | Gravidade | Achado | Correção |
|---|---|---|---|
| 23 | **alta** (legal) | A checagem de domínio público dos pedidos de tradução olhava **só o primeiro autor** e ignorava o tradutor. "Washington Confidential" (Lait † 1954, Mortimer † 1963) passava; uma tradução inglesa recente de um clássico também passaria. | `fichaGutenberg` lê todos os `dcterms:creator` e todos os `marcrel:trl`/`adp`; vale a última morte; tradutor sem data ou morto depois de 1955 barra. Teste com os dois casos. |
| 24 | média | Nenhum teto global de pedidos: um script podia martelar a API (cada `/api/livro` lê o banco síncrono). | `fluxoPassa`: 300 pedidos de API e 1.500 de arquivo por minuto por IP → 429 com `retry-after`. No ar: 330 pedidos em rajada → 300 × 200 e 30 × 429; arquivos seguem servidos. |
| 25 | média | Livro aberto em amostra (sem conta) ficava no cache do app; depois de entrar, continuava mostrando só o 1º capítulo até recarregar. | Remendo: resposta `limitado` não entra no cache. |
| 26 | média | Rascunho de capítulo se perdia ao fechar ou recarregar a aba do estúdio. | Rascunho salvo no aparelho a cada tecla (com aviso para recuperar) e aviso antes de sair com texto não enviado. |
| 27 | baixa | Progresso de quadrinho só no navegador: trocar de aparelho perdia o ponto. | Sincronizado na conta a cada 15 s e ao sair da página; o mais recente vence. |
| 28 | baixa | Trava do SQLite sob escrita concorrente virava erro 500. | `busy_timeout = 4000`. |
| 29 | baixa | "null" escrito na meta da estante e na revisão do caderno; plural errado. | Nós nulos fora do `replaceChildren`. |
| 30 | baixa | Leitor de manuscrito: .docx de zip feito no Windows (`word\document.xml`) não abria; capítulo curto com título do EPUB era descartado como "capa". | Barra invertida normalizada; capítulo com título entra a partir de 15 palavras; sumário (`<nav>`) sai. |

### Verificado e sem problema

- **Curadoria**: todas as rotas passam por `exigirAdmin` (401/404 para os outros — conferido no ar). Capa de livro só muda por upload (mesma limpeza das publicações: bytes decidem o tipo, só os blocos que desenham, nome sorteado de 24 hex, gravado com `wx`) ou volta ao original; capa de série só pode ser uma página da própria série. `/capas/cur-*` só casa `cur-[0-9a-f]{24}.(jpg|png|webp)`. Texto editado aparece por nó de texto no app e nas páginas.
- **Conta**: trocar e-mail pede a senha atual (conferida no servidor) e não diz de quem é um e-mail já usado; sair de um aparelho só apaga sessão da **própria** conta (`WHERE id = ? AND leitor_id = ?`).
- **Estúdio**: o manuscrito é lido no navegador e nunca sobe como arquivo; o texto vira nós (`marcacaoParaNos`), nunca HTML.
- **Progresso de quadrinhos**: série validada por `^[a-z0-9-]{2,80}$`, números com teto, até 500 séries por conta, data do futuro cortada.
- **Seguir obra**: só obra publicada; teto de 500; aviso com chave única (não duplica).
- **Limites do plano no ar**: sem conta → 401 nas rotas de conta; `/api/minha-conta`, `/api/meta`, `/api/quadrinhos/progresso` → 401 anônimo.
- **Peso do site**: catálogo (1,1 MB) sai com gzip (233 KB) e revalida com 304 (0 bytes); bundle com cache eterno (nome com hash). O foco do leitor pergunta o plano no máximo 1 vez por minuto; a barra guarda a identidade 10 s.

### Riscos conhecidos

- O teto de fluxo é por IP: muita gente atrás do mesmo NAT (uma escola) divide os 300/min. Folgado para leitura; rever se aparecer 429 legítimo no log.
- A revisão do dia fica no navegador (não sincroniza entre aparelhos) — escolha consciente para não guardar trecho marcado no servidor.
- Quadrinhos do Internet Archive: 3 páginas de *Plish and Plum* (Busch) dão 404 lá; como só volume inteiro é publicado, ele ficou de fora (Busch saiu com Max und Moritz, Fipps e Julchen).

## Adendo 5 — dados que passavam de uma conta para outra, Google, DeepL (18/09, tarde)

101 testes (1 novo: Google — conta nova, nunca juntar pelo e-mail, vincular, senha, desligar, `state` de uso único e preso ao navegador).

| # | Gravidade | Achado | Correção |
|---|---|---|---|
| 31 | **alta** (privacidade) | Sair da conta não limpava a estante, o progresso e as marcações guardados no navegador; a sincronia mandava tudo para a PRÓXIMA conta que entrasse. O dono saiu da conta A, criou a B, e a B nasceu com os livros lidos da A (no servidor). As duas contas de administração têm os mesmos 17 itens: aconteceu antes também. Mesmo defeito no progresso dos quadrinhos. | `/fio-dono.js` guarda de quem são os dados do navegador; conta diferente (ou dados de antes da correção, marcados "legado") → apaga antes da primeira sincronia. Sair apaga. Remendos no bundle (sincronia e `sair`), no leitor e na lista de quadrinhos (`/api/quadrinhos/progresso` diz o dono), na barra das páginas soltas, na página de conta e no painel. Testado com duas contas. |
| 32 | média | "Apagar dados de leitura" na página de conta apagava no servidor, e a sincronia seguinte trazia tudo de volta do navegador. | Apaga os dois lados. |
| 33 | média | A pasta `Sen Apis/` (chave do DeepL) estava dentro do repositório e fora do `.gitignore`. | Ignorada antes de qualquer commit; chave movida para `.env` (local e VPS, 600). |
| 34 | baixa | "Onde encontrar" na ficha era `<a href="#onde">`: no app o `#` é a rota, e o clique ia para uma tela inexistente. | Rola até a lista, que ganhou `id`. |
| 35 | baixa | Capas dos volumes 2+ dos quadrinhos davam 401 sem conta (só `capa.*` era livre), e a vitrine/lista mostrava quadrados vazios. | As imagens usadas como capa (série, volume, curadoria) são públicas; as páginas continuam fechadas (conferido no ar: capa 200, página 401). |

**Entrar com o Google** (`servidor/google.mjs`): código de autorização com PKCE; `state` na memória do servidor, de uso único, preso a um cookie do navegador (contra login CSRF); id_token pelo canal de trás, conferidos emissor, público e validade. Nunca junta com conta existente pelo e-mail (o e-mail do Fio não é verificado: quem cadastrasse o e-mail de outra pessoa antes ficaria com a conta do Google dela). Vincular só com a pessoa entrada e a mesma conta na ida e na volta. Conta criada pelo Google nasce com senha sorteada e define a primeira pela página de conta; só desliga o Google depois de ter senha. Respeita o cadastro aberto/fechado. **Desligado** (`FIO_GOOGLE`) até os endereços de volta serem cadastrados no console do Google — conferido: hoje o Google responde `redirect_uri_mismatch`.
