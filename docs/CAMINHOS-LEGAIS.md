# Caminhos legais para crescer o acervo — 17/09/2026

Pedido do dono: "procurar brechas na lei" para ter mangá, manhwa, anime e
histórias de todas as formas de obtenção, zerar o estoque de ideias, e ver a
viabilidade de embed e vídeo.

Isto não é parecer de advogado. É o mapa do que a Lei 9.610/98 (LDA), o Marco
Civil e os termos de cada fonte permitem, para decidir o que vale levar a um
advogado antes de ligar o pagamento.

---

## 0. O fato que muda tudo: a partir das assinaturas, o Fio é comercial

Enquanto tudo era grátis, várias fontes estavam liberadas por serem "uso não
comercial". Com plano pago, **três coisas do projeto precisam ser revistas
antes de cobrar o primeiro real**:

| O quê | Regra | O que fazer |
|---|---|---|
| Catálogo de mangás (AniList) | Uso comercial é livre até US$ 150/mês de receita; acima disso exige licença comercial. Guardar ou coletar em massa continua proibido. | Até lá, sem problema. Ao passar desse valor, escrever para contact@anilist.co. |
| Tradução automática da esteira (MinT / modelos NLLB e OPUS) | Parte dos modelos saiu com licença não comercial (o NLLB-200 é CC-BY-NC). | Confirmar com a Wikimedia se o texto traduzido pode ser usado num site com assinatura; se não, deixar os livros traduzidos sempre fora do que é pago (o plano já prevê: ler nunca é pago). |
| Obras CC-BY-NC | O "NC" proíbe uso comercial. | Não entrar com NC. Pepper&Carrot é CC-BY (sem NC) e continua valendo. |

E uma regra que fica mais séria: **pirataria com fim de lucro é crime com pena
de reclusão de 2 a 4 anos** (Código Penal, art. 184, §1º e §2º). Enquanto o
site era grátis, hospedar mangá alheio já era ilícito; com assinatura, passa a
ser a forma qualificada do crime.

## 1. O que NÃO é brecha (e parece)

Dito uma vez só, para não gastar mais tempo nisso:

- **"Hospedar e tirar do ar quando reclamarem."** O Marco Civil (art. 19, §2º)
  deixa direitos autorais de fora da regra da ordem judicial. Na prática,
  quem hospeda responde quando sabe e não tira, e quem *escolhe* hospedar mangá
  comercial já sabe.
- **Servidor em outro país.** A VPS do Fio já está nos EUA (DigitalOcean, New
  Jersey), e isso piora: soma a lei americana (DMCA) à brasileira.
- **Scan de fã, tradução de fã, "só para divulgar", "sem fins lucrativos",
  "crédito ao autor".** Nenhum desses é exceção na LDA. Tradução de obra
  protegida é obra derivada e precisa de autorização (art. 29, IV).
- **Embed ou link para site pirata.** A jurisprudência europeia (caso GS Media)
  presume que quem tem fim de lucro sabe que o link é pirata. Não há decisão
  brasileira que proteja isso.
- **Obra "abandonada" ou "órfã".** O Brasil não tem exceção para obra órfã.

## 2. Os caminhos que funcionam, do mais forte ao mais trabalhoso

### 2.1 Autores publicando no Fio — FEITO HOJE

Obra nova, moderna, colorida, em português, e legal: a de quem é dono dela.
Seção **Comunidade** e **Publicar**, só a partir do plano Trama, com revisão
prévia, declaração de autoria, denúncia e suspensão automática (ver
`servidor/publicacoes.mjs`).

Para crescer de verdade:
- **Convite ativo a quadrinistas brasileiros independentes**: quem já publica
  webtoon ou mangá em redes sociais e não tem onde reunir. Oferecer o plano
  Tear de cortesia aos primeiros 20.
- **Repasse por leitura** (ideia 1 de `docs/IDEIAS-2026-09-17.md`): é o que faz um autor preferir
  publicar aqui.
- **Termos de uso escritos** antes de abrir para desconhecidos: licença que o
  autor dá ao Fio (não exclusiva, revogável ao apagar a obra), canal de
  notificação de direitos, política de reincidência (quem publica obra alheia
  duas vezes perde o plano).

### 2.2 Licenciar direto de estúdios pequenos

Manhwa e manhua de estúdios menores são licenciados por país e por idioma. Os
grandes (Kakao, Naver, Shueisha) estão fora de alcance; estúdios e autores
independentes coreanos, chineses e indonésios costumam aceitar licença digital
para português por valor fixo ou por participação.

- Quando: com as assinaturas pagando o servidor.
- Como: e-mail com proposta de participação na receita + prazo de 2 anos +
  exclusão garantida ao fim. Um modelo de proposta pode entrar em `docs/`.

### 2.3 Tradução autorizada de webcomics independentes

Autores do Webtoon Canvas, Tapas e Pixiv muitas vezes nunca foram traduzidos e
aceitam uma tradução para o português **com autorização por escrito**. É
exatamente o "scanlation", só que legal.

- Custo: a tradução (a esteira faz o texto; o balão precisa de alguém que
  edite a imagem) e um e-mail por autor.
- A autorização fica guardada; a obra entra pela seção Publicar em nome do Fio.

### 2.4 Licença livre moderna

- **Pepper&Carrot** (CC-BY 4.0) — já está.
- ***Say Hello to Black Jack***, de Shuho Sato — o autor liberou uso livre,
  inclusive comercial e tradução. 13 volumes, drama médico, em japonês.
  Precisa de OCR + tradução + redesenho dos balões.
- Antes de cada nova: conferir que a licença não é NC (ver §0).

### 2.5 Quadrinhos em domínio público — com tradução nossa

Aqui a resposta para "dá para traduzir?" é **sim**: obra em domínio público
pode ser traduzida livremente, e a tradução é nossa. O que funciona melhor é o
que tem texto nos balões e é bonito, e **muita coisa é colorida**.

A regra que importa, porque o servidor está nos EUA: preferir obra livre **nos
dois países** — autor morto até 1955 (Brasil) **e** publicada até 1930 (EUA).

| Obra | Autor (morte) | Por que vale | Onde está |
|---|---|---|---|
| *Little Nemo in Slumberland* (1905–1914) | Winsor McCay (1934) | Páginas de domingo coloridas, o quadrinho mais bonito de todos os tempos | Library of Congress, Wikimedia Commons |
| *Tokyo Puck* e *Tonda Haneko* (1905–1930) | Kitazawa Rakuten (1955) | "Pai do mangá moderno"; revista **colorida**; *Tonda Haneko* é uma das primeiras heroínas de mangá | Coleções digitais da Biblioteca Nacional da Dieta (Japão) |
| Mangás de Okamoto Ippei (1910–1930) | Okamoto Ippei (1948) | Crônica de Tóquio em quadrinhos | Internet Archive, NDL |
| *Krazy Kat* (1913–1930) | George Herriman (1944) | Clássico absoluto, com páginas coloridas | Library of Congress |
| *The Yellow Kid*, *Buster Brown* | R. F. Outcault (1928) | Os primeiros quadrinhos de jornal, coloridos | Library of Congress |
| *As Aventuras de Nhô Quim* (1869), *Zé Caipora* | Angelo Agostini (1910) | Primeira história em quadrinhos brasileira | Hemeroteca Digital (Biblioteca Nacional) |
| *O Tico-Tico*, J. Carlos | J. Carlos (1950) | Revista infantil brasileira, colorida | Hemeroteca Digital — **conferir autor por autor** (revista com muitos autores) |
| *La Famille Fenouillard* (1889) | Christophe (1945) | Precursor francês do quadrinho | Wikimedia Commons (o Gallica restringe uso comercial das digitalizações) |
| *Max und Moritz* | Wilhelm Busch (1908) | Clássico alemão | Wikimedia Commons |

Cuidado com a digitalização: preferir acervos que declaram a imagem livre
(Library of Congress, Smithsonian, Wikimedia Commons, Internet Archive com
marca de domínio público). O Gallica e alguns museus cobram uso comercial da
foto, mesmo com a obra em domínio público.

### 2.6 Cinema e animação antiga: a regra do art. 44 (a brecha de verdade)

A LDA conta o prazo de **obra audiovisual pela data de lançamento**, não pela
morte do autor: 70 anos a partir de 1º de janeiro do ano seguinte (art. 44).
Então **todo filme e desenho lançado até 1955 está em domínio público no
Brasil em 2026** — inclusive animação japonesa antiga, como *Momotarō: Umi no
Shinpei* (1945), o primeiro longa de anime.

Por que ainda não é "liberado geral":
- **O servidor está nos EUA**, onde o prazo é 95 anos da publicação: só o que
  saiu até 1930 é livre lá, mais o que nunca teve o registro renovado (os
  desenhos do *Superman* dos estúdios Fleischer, 1941–43; *As Viagens de
  Gulliver*, 1939). Para obra livre só no Brasil, seria preciso servidor no
  Brasil e bloqueio por país.
- **A música** do filme é obra separada e pode estar protegida pelo prazo do
  compositor.
- **Dublagem e legendas antigas** têm direito próprio. A legenda tem que ser
  nossa — e isso a esteira faz.
- **Personagem virou marca** em alguns casos (ex.: Disney). Não usar o nome
  como marca nem na divulgação.

Viável como **Cine Fio** (ideia 2 de `docs/IDEIAS-2026-09-17.md`), começando pelo que é livre nos dois
países.

### 2.7 Vídeo por embed: viável, com uma condição

**Tecnicamente é simples.** O YouTube permite embutir qualquer vídeo cujo dono
deixou o embed ligado. No Fio muda uma linha da política de segurança do Caddy
(`frame-src https://www.youtube-nocookie.com`), uma tabela de vídeos e uma
página "Assistir". Umas duas horas de trabalho.

**Legalmente só vale para vídeo publicado pelo dono dos direitos.** Embutir o
episódio que a própria distribuidora postou no canal oficial é o uso para o
qual o botão "incorporar" existe. Embutir o upload de um terceiro é pirataria
com um passo a mais (ver §1).

Como fazer:
1. Lista fechada de **canais oficiais** (distribuidoras e estúdios), escolhida
   no painel pelo dono. O sistema só aceita vídeo desses canais.
2. Guardar só o ID do vídeo. Nada é baixado nem copiado.
3. Aceitar que vídeo some: canal apaga, restringe a região ou desliga o embed.
   A página mostra "indisponível" em vez de erro.
4. Não pôr vídeo embutido atrás do plano pago (o dono do vídeo não autorizou
   revenda).

O que dá para montar assim: trailers e episódios de estreia oficiais, as
séries que distribuidoras soltam inteiras no YouTube, e a filmografia livre do
§2.6 que já estiver no YouTube em canal de acervo (Internet Archive, cinematecas).

**A segunda ferramenta:** o mesmo AniList que já alimenta o catálogo de mangás
tem o catálogo de **anime com links oficiais de onde assistir** (Crunchyroll,
Netflix etc.). Uma aba "Descobrir anime", igual à de mangá, custa pouco e é
legal pelo mesmo motivo.

### 2.8 Pequenos, mas legais

- **Links de afiliado** para os volumes físicos e digitais oficiais (Panini,
  JBC, NewPOP, Amazon): a ficha de cada mangá já tem "onde ler". Gera receita
  sem hospedar nada.
- **Resenha com citação** (LDA, art. 46, III): uma crítica pode mostrar um ou
  dois quadros, na medida do necessário para a crítica. Nunca capítulo inteiro.
- **Prévia oficial**: quando a editora oferece capítulo 1 grátis, o link direto
  para ele.

---

## 3. Antes de ligar o pagamento (checklist)

- [ ] Termos de uso e política de privacidade publicados (inclui a licença que
      o autor dá ao publicar e o canal de notificação de direitos).
- [ ] CNPJ e nota fiscal de serviço — conferir com contador se MEI cobre
      "provedor de conteúdo" (em geral não).
- [ ] Gateway com Pix e cartão, e **7 dias de arrependimento** (CDC, art. 49).
- [ ] Revisar §0: AniList (licença comercial acima de US$ 150/mês) e licença
      dos modelos de tradução.
- [ ] Repasse aos autores escrito no contrato de publicação.

## 4. Ordem recomendada

1. Convidar autores independentes para a Comunidade (plano de cortesia).
2. Quadrinhos em domínio público com tradução: começar por *Little Nemo* e
   *Tokyo Puck* (coloridos, livres nos dois países).
3. Aba "Descobrir anime" com onde assistir oficialmente.
4. Página Assistir com embed de canais oficiais.
5. Licenciamento de estúdios pequenos, com a receita das assinaturas.
6. Cine Fio (art. 44), se um dia houver servidor no Brasil.
