# Abrir a Fiolib para todo mundo — o que aguenta e o que falta

19/09/2026, refeito em 20/09 na máquina nova. Este é o retrato medido, não
estimado: teste de carga numa cópia do site com o banco de verdade, na própria
VPS, sem tocar no site no ar.

**A casa mudou de máquina em 20/09/2026**: saiu de 1 núcleo e 2 GB divididos
com outro projeto, e foi para uma VPS só dela — **2 núcleos, 8 GB de memória,
100 GB de disco e 8 TB de tráfego por mês**.

## Quanto aguenta (medido na máquina nova)

| O que foi medido | Máquina nova | Máquina antiga |
|---|---|---|
| Visitante sem conta navegando (home, catálogo, fichas, amostras) | **752 pedidos/s**; 0,06 s típico com 50 simultâneos | 175 pedidos/s; 0,25 s |
| Tráfego misto (5% buscando dentro dos livros), 50 simultâneos | **643 pedidos/s**; 0,21 s no pior de 95% | 175 pedidos/s; 0,57 s |
| O mesmo com 150 simultâneos | **770 pedidos/s**; 0,65 s no pior de 95% | não media (travava) |
| Criar conta (4 senhas embaralhadas com scrypt) | **4,8 por segundo** (~17 mil por hora) | 1,7 por segundo |
| Memória do site sob carga | ~100 MB de 2 GB | ~105 MB de 320 MB |

**Em gente:** quem está lendo quase não custa nada — o livro chega inteiro de
uma vez e depois só a marca de onde parou vai ao servidor a cada 2 minutos.
Quem custa é quem está chegando e navegando (uns 10 pedidos para abrir o site,
1 a cada 5–10 s navegando). Daí:

- **5 a 8 mil pessoas navegando AO MESMO TEMPO**, com folga;
- **centenas de milhares com o site aberto lendo** (ler quase não custa nada);
- uma onda de 20 mil pessoas chegando em 10 minutos (um vídeo que viraliza)
  dá ~330 pedidos/s — menos da metade da capacidade.

O que acaba primeiro continua sendo o processador. Se um dia faltar, o plano
da Hostinger sobe de tamanho em minutos, sem mudar código. O tráfego incluído
(8 TB/mês) dá para umas 8 milhões de visitas: não é ele que limita.

## O que foi consertado para aguentar (19/09)

1. **A busca dentro dos livros travava o site inteiro.** O `node:sqlite` é
   síncrono: cada busca (0,3 a 2 s) congelava todo mundo. Agora roda num
   trabalhador à parte, lembra as buscas repetidas por 10 minutos e, com mais
   de 8 esperando, responde "tente em alguns segundos" em vez de empilhar
   (servidor/busca-paralela.mjs).
2. **Os freios contavam por pedaço de operadora.** Contavam por `187.45.x.x`
   (um /16). No celular, no Brasil, milhares de pessoas dividem esse pedaço
   (CGNAT): as 12 primeiras contas criadas numa hora pela mesma operadora de
   uma região trancariam as outras. Agora contam por endereço inteiro, sem
   guardar o endereço (servidor/seguranca.mjs, `chaveDeIp`). Criar conta:
   20 por hora por endereço (uma sala de aula no mesmo Wi-Fi cabe).
3. **O livro formatado fica guardado na memória** (até 48 MB): um livro
   popular é arrumado uma vez, não mil.

## Quem entra hoje, sem conta e sem assinatura

| | Sem conta | Conta grátis |
|---|---|---|
| Ver o catálogo, fichas, capas, "por que ler" | sim | sim |
| Buscar (título, autor, dentro dos livros) | sim | sim |
| Ler | o primeiro capítulo de cada livro | **3 livros novos a cada 30 dias** (livro aberto fica aberto) |
| Leis e códigos | inteiros | inteiros |
| Quadrinhos livres e obras da comunidade | sim | sim |
| Progresso e marcações em todos os aparelhos | não | sim |
| Ouvir, EPUB, pedir tradução | não | não (planos pagos) |

**O ponto que precisa de decisão do dono:** o pagamento ainda não existe
(`planos.mjs`, `DISPONIVEL = false`). Quem chega pela divulgação e gasta os
3 livros do mês bate numa parede sem porta: os planos aparecem, mas não dá
para assinar. Até o pagamento existir, a sugestão é subir o número no painel
(campo "Plano grátis: livros novos por mês", chave `gratis_livros_mes`, até 100) — por exemplo
para 10, ou para um número alto durante o lançamento. Não mudei: é decisão de
negócio.

## Login com Google

- **Não tem limite de pessoas** para os dados que pedimos (`openid email
  profile` — escopos "não sensíveis"). O limite de 100 usuários só vale para
  app em modo **Teste**, e aí só entra quem está na lista de testadores.
- **Conferir no console:** Google Cloud → APIs e serviços → Tela de
  permissão OAuth (ou "Google Auth Platform" → Público-alvo). Se o status
  estiver **"Em teste"**, clicar em **"Publicar aplicativo"** → "Em produção".
  Sem isso, quem não é testador vê "Acesso bloqueado".
- Com esses escopos o Google não exige revisão. Se um dia puser logotipo na
  tela de permissão, ele pede verificação da marca (alguns dias).
- O login próprio (usuário, senha e 3 perguntas) não tem limite nenhum.

## Antes de divulgar (lista curta)

1. [ ] Publicar o app no console do Google (acima).
2. [ ] Decidir os livros grátis por mês (acima).
3. [ ] Google Search Console: ver docs/GOOGLE-BUSCA.md.
4. [ ] Cópia do banco FORA da VPS. Hoje o backup diário (03:20) fica na
       própria VPS; se o disco morrer, vão junto as contas. O mais simples:
       ligar os "Backups" da DigitalOcean no painel dela (uns US$ 2,40/mês
       nessa VPS), ou rodar `bash infra/fio.sh copia` de vez em quando.
5. [ ] Aviso de site fora do ar: um monitor grátis externo (ex.: UptimeRobot)
       olhando `https://fiolib.com.br/api/saude` e mandando e-mail.
