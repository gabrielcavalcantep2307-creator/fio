# Auditoria do login e do cadastro — 11/09/2026

A de 09/09 ([`AUDITORIA-2026-09-09.md`](AUDITORIA-2026-09-09.md)) olhou o
sistema inteiro. Esta olha só a porta de entrada, com calma, rota por rota — e
ela mudou de forma no meio: o login deixou de ser por e-mail e passou a ser
por **nome de usuário**.

Nove achados. Oito corrigidos, um aceito por escolha.

---

## O que mudou de forma, e por quê

Entrar por e-mail tem dois defeitos que não se consertam ajustando código.

O primeiro é que **o e-mail é o mesmo em toda a internet**. Quem descobre o
seu aqui sabe onde te procurar em todo lugar, e o vazamento de uma lista de
endereços daqui vale para todos os outros serviços que você usa.

O segundo é que **ele obriga a ter um**, numa casa que não manda e-mail
nenhum desde que a recuperação virou pergunta de segurança. Pedir um dado que
não se usa é coletar por hábito.

Nome de usuário resolve os dois. E traz um risco novo, que é onde estava o
trabalho de verdade.

---

## 1. Nome que se disfarça de outro — o achado que definiu o desenho

Numa biblioteca de amigos, o nome é o **rosto**: ele aparece embaixo de cada
resenha. Se `gabriel` existe e alguém cria algo que se **lê** como `gabriel`,
essa pessoa assina com a cara do dono da casa.

Comparar as letras cruas deixa passar de quatro jeitos:

| | |
|---|---|
| Caixa | `Gabriel`, `GABRIEL` |
| Separador | `ga.briel`, `ga_briel`, `ga-briel` |
| Acento | `gabriél` |
| Alfabeto | `gаbriel`, com o `а` cirílico |

O último é o pior porque **é invisível**. O caractere é outro, o desenho é
igual, e nenhuma revisão humana pega isso lendo a tela.

**Conserto.** Duas colunas. `usuario` guarda o que a pessoa escreveu, com a
caixa que ela escolheu — é como ela assina. `usuario_chave` guarda o que o
nome *parece*, sem caixa, sem acento e sem separador, e é **essa** que tem o
índice único.

O conjunto de letras aceito é fechado em ASCII. Não é frescura de teclado: um
nome que ninguém consegue digitar olhando não serve como nome, e um nome que
se disfarça de outro serve para o que não deve.

---

## 2. Nomes reservados, conferidos sobre a chave

`admin`, `suporte`, `fio`, `api`, `contato` — metade da lista é para não
confundir gente, e metade é para não confundir máquina: um nome igual a uma
rota atrapalha no dia em que existir `/u/<nome>`, e descobrir isso depois
custa uma migração.

A conferência é sobre a **chave**, então `AdMiN` e `a.d.m.i.n` caem junto.

---

## 3. Quatro baldes de tentativa para a mesma conta

O freio contava pelo que foi **digitado**. Com quatro jeitos de escrever o
mesmo nome — `Gabriel`, `gabriel`, `ga.briel`, e o e-mail — a mesma conta
tinha quatro contadores, e o teto de oito tentativas em quinze minutos virava
trinta e dois.

**Conserto.** O freio conta pela chave da conta, resolvida antes.

---

## 4. Um e-mail produz uma chave de nome não-vazia

O mais sutil dos nove, e ele quase passou.

`chaveDe` tira tudo que não é letra ou número. Então
`gabriel@exemplo.com` vira `gabrielexemplocom` — uma chave perfeitamente
válida e **não-vazia**.

O código perguntava, nesta ordem: *tem chave? senão, é e-mail?* Como a
resposta da primeira era sempre sim, **o ramo do e-mail nunca era
consultado**. Quem digitasse o próprio endereço simplesmente não existia para
o sistema, e a mensagem de volta era "usuário ou senha não conferem".

**Conserto.** O e-mail é testado primeiro, porque é reconhecível pela forma:
o que tem arroba e ponto é e-mail, o resto é nome.

---

## 5. `email = NULL` não é falso

Com o e-mail virando opcional, a consulta de login precisava comparar contra
um valor impossível quando a pessoa tinha digitado um nome. A primeira versão
passou `null`.

Em SQL, `email = NULL` não é falso: é **desconhecido**. A linha sumia — pelo
motivo errado, e por um caminho que nenhum teste percorria.

**Conserto.** A consulta deixou de ter o ramo do e-mail: a resolução acontece
antes, em JavaScript, e o SQL recebe sempre uma chave.

---

## 6. O freio que eu escrevi no comentário e esqueci no código

`GET /api/nome-livre` responde se um nome está tomado. Isso é **de
propósito**: nome de usuário é público, aparece embaixo de cada resenha, e
esconder aqui só faria a tela de cadastro mentir.

O comentário que escrevi dizia, com todas as letras, que o freio existia
porque varrer nomes continua sendo varredura. **Não havia freio nenhum.** A
rota respondia a milhares por minuto, e montar a lista de quem tem conta aqui
era um laço de dez linhas.

Achado na releitura, o que é exatamente para isso que a releitura serve.

**Conserto.** Sessenta consultas por dez minutos por faixa de IP — folgado
para quem preenche um cadastro, apertado para quem varre.

---

## 7. A senha viajando mais vezes do que precisa

Criei uma rota `POST /api/forca-da-senha` para a tela poder dizer "essa senha
é fraca" enquanto a pessoa digita. Ela viveu vinte minutos.

O problema é que isso manda a senha pela rede **a cada tecla**, e a senha só
precisa atravessar uma vez, no envio. A régua é uma função pura: ela roda no
navegador sem pedir nada a ninguém.

**Conserto.** A rota saiu. O servidor continua avaliando na hora de gravar,
porque a régua do navegador é aviso e a do servidor é a que vale — mas o
aviso não é motivo para a senha viajar mais.

---

## 8. A régua da senha, que ele pediu para afrouxar

O pedido foi "senha forte ou fraca". Ele está certo, e o motivo é bom.

Dez caracteres é número de quem protege banco. Isto é uma biblioteca fechada
por convite, onde o que se perde numa invasão é o que alguém marcou num
livro. Régua alta demais num lugar assim **não produz senha forte**: produz
senha anotada no papel, e a mesma de sempre com um `1` no fim.

**Conserto.** O piso desceu para oito, e a força passou a ser **dita**:
`avaliarSenha` devolve `fraca`, `razoavel` ou `forte` junto com um recado. A
pessoa escolhe uma senha fraca sabendo que é fraca, que é muito diferente de
escolher no escuro.

O que **não** desceu é a recusa do que já é público por construção: só
dígitos, uma letra repetida, a lista das mais usadas do mundo, e — nova — a
senha ser o próprio nome de usuário, porque quem descobre um descobre os dois
de uma vez.

A conta de força ignora a exigência de símbolo, que é teatro: `S3nh@!` tem os
quatro tipos de caractere e cai antes de `a casa de matacavalos`, que não tem
nenhum.

---

## 9. A conta duplicada por e-mail — ACEITO, e é escolha

`criar` responde **"Já existe conta com esse e-mail"**, e isso conta a quem
perguntar que aquele endereço tem conta aqui.

Fica como está, por três razões. Criar conta exige convite, então quem
pergunta já foi convidado. A alternativa é a pessoa não entender por que o
cadastro não funciona. E o e-mail agora é opcional: quem não quiser ser
descoberto por ele simplesmente não põe.

Registrado como escolha, e não como esquecimento.

---

## O que foi conferido e não tinha achado

- **Sessão.** Token sorteado com 32 bytes de aleatório real, guardado no banco
  só como resumo, opaco e revogável apagando a linha. Trocar a senha derruba
  todas as outras e devolve um cookie novo na mesma resposta.
- **Cookie.** Prefixo `__Host-`, `HttpOnly`, `SameSite=Lax`, `Secure`.
- **CSRF.** Cabeçalho `x-fio` obrigatório em toda escrita, mais conferência de
  `Origin` quando ela vem.
- **Tempo.** `gastarTempoAtoa` mantém a resposta com a mesma duração exista a
  conta ou não; `fingirTrabalho` faz o mesmo na recuperação.
- **Hash.** scrypt com N=2¹⁵, sal por pessoa, parâmetros gravados junto, e
  comparação em tempo constante.
- **Primeira conta é admin**, para uma instalação nova não nascer sem ninguém
  que possa convidar.

---

## A migração, e a parte que exigiu cuidado

Três mudanças em `leitor`: entram `usuario` e `usuario_chave`, e `email`
deixa de ser obrigatório. As duas primeiras caberiam num `ALTER TABLE`; a
terceira não, porque o SQLite **não sabe afrouxar um `NOT NULL`**. A única
saída é reconstruir a tabela.

E aí mora o perigo: `DROP TABLE leitor` com as chaves estrangeiras ligadas
levaria junto, por cascata, sessões, perguntas de segurança, marcações,
progresso e avaliações. A conta sobreviveria vazia.

`PRAGMA foreign_keys = OFF` é a técnica. O `foreign_key_check` **depois** é o
que prova que ela não quebrou nada — sem a segunda, a primeira é só uma
aposta. E a diretiva não funciona dentro de uma transação: o SQLite a ignora
em silêncio, que é a pior maneira de não funcionar.

Rodou em produção às 12h40 de 11/09: uma conta, um nome distinto, a sessão de
pé, as três perguntas intactas, nenhuma linha órfã.

**Uma coisa que eu devia ter feito e não fiz:** a cópia de segurança das
tabelas de conta falhou antes da migração, por um nome de tabela que eu
supus e não conferi, e eu segui mesmo assim. Deu certo, e a migração se
confere sozinha — mas seguir foi sorte, não método.

---

# Rascunho: entrar com o Google, mais para a frente

Não é para agora. Fica escrito enquanto o desenho está fresco.

## O que já existe

A coluna `leitor.google_sub` está no esquema desde o primeiro dia, `UNIQUE`,
criada **antes de haver conta nenhuma**. O motivo está no comentário dela:
ligar OAuth depois costuma exigir mexer na tabela de gente, que é a única que
não dá para recriar.

## A regra que o dono pediu

> Quando a pessoa entrar com o Google, se o e-mail que ela está usando já
> estiver cadastrado aqui, conecta as duas contas.

Ela é a certa, e tem uma armadilha grande dentro.

## A armadilha: e-mail não é identidade

Casar por e-mail é o caminho por onde quase toda invasão de OAuth entra.
Endereço muda de dono — empresa some, domínio expira, provedor recicla conta
abandonada. Quem receber `gabriel@empresa-que-fechou.com` daqui a três anos
entra na conta do Gabriel se o casamento for por e-mail.

Por isso a regra é:

> **`google_sub` é a identidade. O e-mail é só uma dica de que pode ser a
> mesma pessoa — e uma dica precisa ser confirmada.**

`sub` é o identificador do Google para aquela conta. Ele nunca muda e nunca é
reaproveitado.

## Os três casos, e o que cada um faz

**1. Já ligado.** `google_sub` bate com uma conta. Entra, e pronto. É o caso
de todo dia depois da primeira vez.

**2. Ninguém tem esse `sub`, e o e-mail também não existe aqui.** É gente
nova. Cai na regra da casa: **exige convite**, como qualquer cadastro. Entrar
com o Google não pode ser a porta dos fundos de uma biblioteca fechada.

**3. Ninguém tem esse `sub`, mas o e-mail existe numa conta nossa.** É o caso
que ele descreveu, e o único que precisa de cuidado.

A tentação é ligar na hora. Não dá: quem chega com um e-mail do Google ainda
não provou ser dono da conta **daqui**. Provou ser dono da conta **de lá**.

Então:

- não liga nada;
- pede **a senha do Fio** daquela conta, uma vez;
- acertando, grava `google_sub` e liga as duas para sempre.

São dois cliques uma vez na vida, e é o que separa "juntar contas" de "entrar
na conta dos outros com um e-mail parecido".

## O que conferir no `id_token`, e por que cada um

Nada disso é opcional, e é por aqui que as implementações erradas passam:

| Conferir | Porque, se não |
|---|---|
| A assinatura, contra as chaves públicas do Google | qualquer um forja um token |
| `aud` igual ao nosso cliente | um token emitido para OUTRO site entra aqui |
| `iss` do Google | idem |
| `exp` ainda no futuro | token velho serve para sempre |
| `email_verified` verdadeiro | dá para pôr o e-mail de qualquer um numa conta Google nova |

O `aud` é o mais esquecido e o mais grave: sem ele, qualquer site que use
Google faz login aqui.

## Desligar também tem que existir

Quem liga precisa poder desligar — e quem desliga não pode ficar trancado do
lado de fora. Então só se desliga uma conta que **tenha senha**, e trocar a
senha continua derrubando as sessões dos dois caminhos.

## O que isto NÃO resolve

Não resolve a recuperação. As perguntas de segurança continuam sendo o
caminho de quem esqueceu a senha, porque depender do Google para voltar à
própria biblioteca seria trocar uma dependência de terceiro — o e-mail — por
outra igual.
