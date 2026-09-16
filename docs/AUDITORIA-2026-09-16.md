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
