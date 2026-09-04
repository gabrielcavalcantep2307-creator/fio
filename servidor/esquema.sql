-- Fio — esquema do banco
--
-- SQLite. Uma decisão explicada em docs/ARQUITETURA.md.
--
-- As três separações que sustentam tudo, e que não podem ser desfeitas
-- sem quebrar o produto:
--
--   1. OBRA  ≠  TEXTO         a obra é abstrata; o texto é um idioma concreto,
--                             com um tradutor que tem dono.
--   2. CATÁLOGO ≠ ARQUIVO     ter a ficha da obra não é ter o direito de servir
--                             o arquivo. Trilho A/B/C decide.
--   3. DIREITO é por PAÍS     não existe "é domínio público". Existe "é domínio
--                             público no Brasil".

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════════
-- PESSOAS DA OBRA — autores, tradutores, organizadores
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE pessoa (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL,
  nome_ordem    TEXT,                    -- "Orwell, George"
  nascimento    INTEGER,
  morte         INTEGER,                 -- o número que decide o domínio público
  wikidata      TEXT UNIQUE,             -- Q3335
  olid          TEXT UNIQUE,             -- OL118077A
  resumo        TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pessoa_nome ON pessoa(nome_ordem);

-- ═══════════════════════════════════════════════════════════════════
-- OBRA — a coisa abstrata. "Animal Farm, de Orwell, 1945."
-- Não tem idioma de leitura, não tem arquivo, não tem editora.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE obra (
  id              INTEGER PRIMARY KEY,
  titulo          TEXT NOT NULL,           -- no idioma original
  titulo_pt       TEXT,                    -- como é conhecida em português
  subtitulo       TEXT,
  ano             INTEGER,
  idioma_original TEXT,                    -- 'en', 'pt', 'fr'
  pais_origem     TEXT,
  wikidata        TEXT UNIQUE,
  olid_work       TEXT UNIQUE,             -- OL46125W

  -- classificação editorial (seção 15 da proposta)
  nivel           TEXT CHECK (nivel IN ('iniciante','intermediario','avancado','academico')),
  densidade       INTEGER CHECK (densidade BETWEEN 1 AND 5),
  paginas         INTEGER,
  minutos_leitura INTEGER,

  -- o trilho: o que a tela mostra no lugar de "Ler"
  trilho          TEXT NOT NULL DEFAULT 'B' CHECK (trilho IN ('A','B','C')),

  publicada       INTEGER NOT NULL DEFAULT 0,   -- 0 = rascunho, invisível no site
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_obra_trilho ON obra(trilho, publicada);
CREATE INDEX idx_obra_ano ON obra(ano);

CREATE TABLE obra_pessoa (
  obra_id   INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  pessoa_id INTEGER NOT NULL REFERENCES pessoa(id) ON DELETE CASCADE,
  papel     TEXT NOT NULL CHECK (papel IN ('autor','coautor','organizador','ilustrador')),
  PRIMARY KEY (obra_id, pessoa_id, papel)
);

-- ═══════════════════════════════════════════════════════════════════
-- TEXTO — uma manifestação legível da obra, num idioma.
-- "Animal Farm em inglês, do Gutenberg" e "A Revolução dos Bichos,
-- tradução da Companhia das Letras" são DOIS textos da MESMA obra,
-- e o segundo tem um dono que o primeiro não tem.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE texto (
  id           INTEGER PRIMARY KEY,
  obra_id      INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  idioma       TEXT NOT NULL,
  tradutor_id  INTEGER REFERENCES pessoa(id),   -- NULL = é o original
  editora      TEXT,
  ano_edicao   INTEGER,
  isbn13       TEXT,

  -- de onde veio, e o que é
  fonte        TEXT NOT NULL,                   -- 'gutenberg','standard_ebooks','archive','dominio_publico','proprio','leitor'
  fonte_id     TEXT,                            -- id na origem
  fonte_url    TEXT,
  formato      TEXT CHECK (formato IN ('epub','pdf','html','txt')),
  hash_arquivo TEXT,                            -- sha256; é a defesa contra duplicata

  -- privado do trilho C: se preenchido, este texto é de UMA pessoa e de
  -- mais ninguém. Toda consulta de leitura filtra por isto.
  dono_id      INTEGER REFERENCES leitor(id) ON DELETE CASCADE,

  normalizado  INTEGER NOT NULL DEFAULT 0,      -- já virou capítulos?
  palavras     INTEGER,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_texto_obra ON texto(obra_id, idioma);
CREATE INDEX idx_texto_dono ON texto(dono_id);
CREATE UNIQUE INDEX idx_texto_hash ON texto(hash_arquivo) WHERE hash_arquivo IS NOT NULL;
CREATE UNIQUE INDEX idx_texto_fonte ON texto(fonte, fonte_id) WHERE fonte_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- DIREITO — por (texto, jurisdição). Nunca um booleano no livro.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE direito (
  texto_id    INTEGER NOT NULL REFERENCES texto(id) ON DELETE CASCADE,
  jurisdicao  TEXT NOT NULL,                    -- 'BR', 'US', 'PT', '*'
  estado      TEXT NOT NULL CHECK (estado IN ('dominio_publico','licenca_livre','licenciado','protegido','desconhecido')),
  livre_em    INTEGER,                          -- ano em que cai em domínio público
  motivo      TEXT NOT NULL,                    -- "Orwell morreu em 1950; Lei 9.610/98 art. 41"
  licenca     TEXT,                             -- 'CC0','CC-BY-SA-4.0', contrato
  verificado_por TEXT,                          -- 'calculo','humano','fonte'
  verificado_em  TEXT,
  PRIMARY KEY (texto_id, jurisdicao)
);

-- ═══════════════════════════════════════════════════════════════════
-- ONDE ENCONTRAR — o trilho B em forma de tabela
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE disponibilidade (
  id         INTEGER PRIMARY KEY,
  obra_id    INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('compra','biblioteca','emprestimo_digital','previa','leitura_externa','audiolivro')),
  provedor   TEXT NOT NULL,                     -- 'Companhia das Letras', 'Internet Archive'
  rotulo     TEXT,                              -- "tradução de Heloisa Jahn, 2021"
  url        TEXT NOT NULL,
  idioma     TEXT,
  jurisdicao TEXT DEFAULT '*',
  preco_dica TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_disp_obra ON disponibilidade(obra_id, ativo);

-- ═══════════════════════════════════════════════════════════════════
-- CAPÍTULO — o texto já normalizado. É a unidade de leitura,
-- de posição, de progresso e de spoiler.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE capitulo (
  id        INTEGER PRIMARY KEY,
  texto_id  INTEGER NOT NULL REFERENCES texto(id) ON DELETE CASCADE,
  ordem     INTEGER NOT NULL,                   -- 1, 2, 3... é o eixo do spoiler
  titulo    TEXT,
  corpo     TEXT NOT NULL,                      -- HTML já limpo e sanitizado
  palavras  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (texto_id, ordem)
);

-- ═══════════════════════════════════════════════════════════════════
-- A CAMADA DE CONTEXTO
--
-- Tudo o que a proposta chama de "por que este livro existe", "como ler",
-- "observe", "pense", personagem, conceito e evento é UMA tabela de
-- fragmentos. O que muda é o tipo e o ponto em que pode aparecer.
--
-- `revela_ate` é o motor anti-spoiler inteiro:
--   0  = seguro antes de abrir o livro
--   n  = só aparece para quem já leu o capítulo n
-- Uma cláusula WHERE, e o spoiler acabou.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE tema (
  id     INTEGER PRIMARY KEY,
  nome   TEXT NOT NULL UNIQUE,                  -- 'Poder', 'Propaganda', 'Liberdade'
  resumo TEXT
);

CREATE TABLE obra_tema (
  obra_id INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  tema_id INTEGER NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
  peso    REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (obra_id, tema_id)
);

CREATE TABLE conceito (
  id      INTEGER PRIMARY KEY,
  nome    TEXT NOT NULL UNIQUE,                 -- 'totalitarismo'
  resumo  TEXT NOT NULL,                        -- definição geral, sem obra
  wikidata TEXT
);

CREATE TABLE entidade (
  id       INTEGER PRIMARY KEY,
  obra_id  INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  tipo     TEXT NOT NULL CHECK (tipo IN ('personagem','lugar','evento','grupo')),
  nome     TEXT NOT NULL,
  apelidos TEXT,                                -- JSON de nomes alternativos, para o realce no leitor
  UNIQUE (obra_id, tipo, nome)
);

CREATE TABLE relacao_entidade (
  de_id   INTEGER NOT NULL REFERENCES entidade(id) ON DELETE CASCADE,
  para_id INTEGER NOT NULL REFERENCES entidade(id) ON DELETE CASCADE,
  tipo    TEXT NOT NULL,                        -- 'aliado','conflito','lidera','trai'
  desde   INTEGER NOT NULL DEFAULT 0,           -- só aparece no mapa a partir deste capítulo
  PRIMARY KEY (de_id, para_id, tipo)
);

CREATE TABLE fragmento (
  id          INTEGER PRIMARY KEY,
  obra_id     INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN (
                'chamada','porque_existe','como_ler','observe','pense','conexao',
                'conceito','entidade','evento','pos_leitura','interpretacao')),
  titulo      TEXT,
  corpo       TEXT NOT NULL,

  -- a quem se prende
  conceito_id INTEGER REFERENCES conceito(id),
  entidade_id INTEGER REFERENCES entidade(id),
  capitulo_ord INTEGER,                         -- onde o cartão aparece na leitura

  -- ANTI-SPOILER
  revela_ate  INTEGER NOT NULL DEFAULT 0,

  -- honestidade epistêmica (seção 23 da proposta)
  natureza    TEXT NOT NULL DEFAULT 'fato' CHECK (natureza IN ('fato','interpretacao','hipotese')),

  -- procedência
  gerado_por  TEXT NOT NULL DEFAULT 'humano',   -- 'humano','ia','importado'
  revisado    INTEGER NOT NULL DEFAULT 0,       -- fragmento de IA só publica revisado
  modelo      TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_frag_obra ON fragmento(obra_id, tipo, revela_ate);
CREATE INDEX idx_frag_cap ON fragmento(obra_id, capitulo_ord);

CREATE TABLE fonte_ref (
  id            INTEGER PRIMARY KEY,
  fragmento_id  INTEGER NOT NULL REFERENCES fragmento(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,                  -- 'livro','artigo','enciclopedia','site'
  referencia    TEXT NOT NULL,
  url           TEXT,
  acessado_em   TEXT
);

-- ═══════════════════════════════════════════════════════════════════
-- CONEXÕES E TRILHAS — "o que ler depois", que é metade do produto
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE relacao_obra (
  de_id   INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  para_id INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  tipo    TEXT NOT NULL CHECK (tipo IN (
            'mesma_tematica','contraponto','mais_dificil','mais_facil',
            'complementar','influenciou','mesmo_autor','adaptacao')),
  porque  TEXT NOT NULL,                        -- a frase que a tela mostra
  peso    REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (de_id, para_id, tipo)
);

CREATE TABLE trilha (
  id       INTEGER PRIMARY KEY,
  nome     TEXT NOT NULL,                       -- 'Poder e sociedade'
  resumo   TEXT,
  criterio TEXT,                                -- por que estas obras, nesta ordem
  publicada INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE trilha_item (
  trilha_id INTEGER NOT NULL REFERENCES trilha(id) ON DELETE CASCADE,
  obra_id   INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  ordem     INTEGER NOT NULL,
  porque    TEXT,                               -- por que vem depois da anterior
  PRIMARY KEY (trilha_id, obra_id)
);

-- ═══════════════════════════════════════════════════════════════════
-- O LEITOR
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE leitor (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome          TEXT NOT NULL,

  -- Senha: scrypt, com sal por pessoa. O hash e o sal ficam separados de
  -- propósito — e os parâmetros vão junto, porque endurecer o scrypt daqui
  -- a dois anos não pode invalidar a senha de ninguém: a gente lê os
  -- parâmetros que estavam valendo quando ela foi criada.
  senha_hash    BLOB NOT NULL,
  senha_sal     BLOB NOT NULL,
  senha_params  TEXT NOT NULL,            -- JSON {N,r,p,tam}
  senha_mudou   TEXT NOT NULL DEFAULT (datetime('now')),

  jurisdicao    TEXT NOT NULL DEFAULT 'BR',   -- decide o que ele pode ler aqui
  papel         TEXT NOT NULL DEFAULT 'leitor' CHECK (papel IN ('leitor','editor','admin')),
  nivel_spoiler TEXT NOT NULL DEFAULT 'ate_aqui'
                CHECK (nivel_spoiler IN ('nenhum','ate_aqui','liberado','completo')),
  cartoes_ativos INTEGER NOT NULL DEFAULT 1,

  -- login pelo Google, quando existir. A coluna nasce agora para que ligar
  -- depois não seja uma migração no meio de um banco com gente dentro.
  google_sub    TEXT UNIQUE,

  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  visto_em      TEXT,
  desativado    INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════════
-- SESSÃO — o que prova quem você é
--
-- O que vai no cookie é um segredo aleatório. O que fica no banco é o
-- RESUMO dele. Quem roubar o banco não consegue entrar como ninguém —
-- do resumo não se volta para o segredo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE sessao (
  id         INTEGER PRIMARY KEY,
  leitor_id  INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,        -- sha256 do token que está no cookie
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  visto_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  agente     TEXT,                        -- para a pessoa reconhecer o aparelho
  ip_dica    TEXT                         -- só os dois primeiros octetos
);
CREATE INDEX idx_sessao_leitor ON sessao(leitor_id);
CREATE INDEX idx_sessao_expira ON sessao(expira_em);

-- ═══════════════════════════════════════════════════════════════════
-- CONVITE — a biblioteca é fechada, e isso mora no banco
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE convite (
  id          INTEGER PRIMARY KEY,
  codigo_hash BLOB NOT NULL UNIQUE,       -- nem o código fica em claro
  criado_por  INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
  usado_por   INTEGER REFERENCES leitor(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em   TEXT NOT NULL,
  usado_em    TEXT,
  nota        TEXT                        -- "para o Ravi"
);

-- ═══════════════════════════════════════════════════════════════════
-- RECUPERAÇÃO DE SENHA — uso único, meia hora, e derruba as sessões
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE recuperacao (
  id         INTEGER PRIMARY KEY,
  leitor_id  INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT NOT NULL,
  usado_em   TEXT
);
CREATE INDEX idx_recup_leitor ON recuperacao(leitor_id);

-- ═══════════════════════════════════════════════════════════════════
-- FREIO — quantas vezes tentaram, e de onde
--
-- No banco, e não só na memória: reiniciar o servidor não pode ser o
-- jeito de zerar o contador de quem está tentando adivinhar senha.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE tentativa (
  chave    TEXT NOT NULL,                 -- 'entrar:email' ou 'entrar:ip'
  quando   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tentativa ON tentativa(chave, quando);

CREATE TABLE progresso (
  leitor_id     INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  texto_id      INTEGER NOT NULL REFERENCES texto(id) ON DELETE CASCADE,
  capitulo_ord  INTEGER NOT NULL DEFAULT 1,     -- o número que o spoiler engine lê
  fracao        REAL NOT NULL DEFAULT 0,        -- 0..1 dentro do capítulo
  ancora        TEXT,                           -- para voltar ao ponto exato
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (leitor_id, texto_id)
);

CREATE TABLE sessao_leitura (
  id        INTEGER PRIMARY KEY,
  leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  texto_id  INTEGER NOT NULL REFERENCES texto(id) ON DELETE CASCADE,
  inicio    TEXT NOT NULL,
  fim       TEXT,
  palavras  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE estante (
  leitor_id INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  obra_id   INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  estado    TEXT NOT NULL CHECK (estado IN ('quero_ler','lendo','concluido','abandonado')),
  nota      INTEGER CHECK (nota BETWEEN 1 AND 5),
  mudou_em  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (leitor_id, obra_id)
);

CREATE TABLE marcacao (
  id           INTEGER PRIMARY KEY,
  leitor_id    INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  capitulo_id  INTEGER NOT NULL REFERENCES capitulo(id) ON DELETE CASCADE,
  inicio       INTEGER NOT NULL,                -- deslocamento no texto do capítulo
  fim          INTEGER NOT NULL,
  trecho       TEXT NOT NULL,
  cor          TEXT NOT NULL DEFAULT 'importante'
               CHECK (cor IN ('importante','conceito','duvida','conexao')),
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_marc_leitor ON marcacao(leitor_id, capitulo_id);

CREATE TABLE nota (
  id          INTEGER PRIMARY KEY,
  leitor_id   INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  obra_id     INTEGER REFERENCES obra(id) ON DELETE CASCADE,
  marcacao_id INTEGER REFERENCES marcacao(id) ON DELETE CASCADE,
  corpo       TEXT NOT NULL,
  etiquetas   TEXT,                             -- JSON
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════
-- PERFIL E RECOMENDAÇÃO — com o "porquê" gravado junto
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE perfil_leitor (
  leitor_id   INTEGER PRIMARY KEY REFERENCES leitor(id) ON DELETE CASCADE,
  pesos_tema  TEXT NOT NULL DEFAULT '{}',       -- JSON {tema_id: peso}
  pesos_epoca TEXT NOT NULL DEFAULT '{}',
  nivel_medio REAL,
  evidencias  TEXT NOT NULL DEFAULT '[]',       -- JSON: o que sustenta cada peso
  calculado_em TEXT
);

CREATE TABLE recomendacao (
  id         INTEGER PRIMARY KEY,
  leitor_id  INTEGER NOT NULL REFERENCES leitor(id) ON DELETE CASCADE,
  obra_id    INTEGER NOT NULL REFERENCES obra(id) ON DELETE CASCADE,
  eixo       TEXT NOT NULL CHECK (eixo IN (
               'tematica','filosofia','impacto','complementar','mais_dificil','contraponto','trilha')),
  motivo     TEXT NOT NULL,                     -- "porque você leu X e marcou Y"
  escore     REAL NOT NULL,
  gerada_em  TEXT NOT NULL DEFAULT (datetime('now')),
  vista      INTEGER NOT NULL DEFAULT 0,
  aceita     INTEGER
);
CREATE INDEX idx_rec_leitor ON recomendacao(leitor_id, escore DESC);

-- ═══════════════════════════════════════════════════════════════════
-- BUSCA
-- ═══════════════════════════════════════════════════════════════════

CREATE VIRTUAL TABLE busca_obra USING fts5(
  titulo, titulo_pt, autores, temas, resumo,
  conteudo_obra_id UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE VIRTUAL TABLE busca_capitulo USING fts5(
  corpo,
  capitulo_id UNINDEXED,
  texto_id UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);

-- ═══════════════════════════════════════════════════════════════════
-- REGISTRO — auditoria do painel e da ingestão
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE registro (
  id        INTEGER PRIMARY KEY,
  quando    TEXT NOT NULL DEFAULT (datetime('now')),
  quem      TEXT,
  acao      TEXT NOT NULL,
  alvo      TEXT,
  detalhe   TEXT
);
