# Auditoria de 19/09/2026 — depois da reorganização

Feita logo depois de a esteira virar serviço da VPS e de a API ser reorganizada
(núcleo HTTP + rotas por assunto + camada de serviços). Pergunta: com tanta
mudança, abriu alguma brecha? Houve tentativa de invasão, e alguma deu certo?

## Resposta curta

Nenhum sinal de invasão com êxito. Muitas tentativas, todas barradas. Quatro
coisas corrigidas, uma delas grave (o Caddy).

## O que foi olhado, e o que se achou

| Onde | Achado |
|---|---|
| SSH | Senha desligada, root só por chave. **66 mil tentativas** de robôs nos logs — impossíveis de dar certo sem senha. Logins aceitos: só as chaves conhecidas (dono, Nathan, deploy do Wallt, deploy da Fiolib). |
| Firewall | ufw ativo, INPUT em DROP; abertas só 22, 80, 443 e as portas de vídeo do Wallt. A 7880 do LiveKit escuta mas não é alcançável de fora (testado). fail2ban ativo. |
| Sistema | `dpkg -V`: nenhum binário diferente do pacote oficial; as mudanças em /usr/bin vêm das atualizações automáticas. Nenhuma atualização de segurança pendente. Cron: só os dois backups. Nenhum serviço estranho. |
| Contas do site | 2 contas: `curador` (admin) e uma conta Google criada do IP do dono. Nenhum ataque de senha nos últimos 7 dias, nenhuma denúncia, nenhum erro 500. |
| Código | Contrato das rotas (234 casos, `servidor/contrato-rotas.mjs`): nenhuma rota de admin responde a leitor; CSRF (x-fio e origem) em todas; caminhos `../`, `%2e%2e`, `\` crus não vazam nada. IP do leitor tirado do último salto do X-Forwarded-For (o que o Caddy põe), sem como forjar. |
| Git | Nenhuma chave ou senha em nenhum commit do histórico. |

## Corrigido

1. **O Caddy estava lendo um arquivo velho** (grave). O `Caddyfile` é montado
   por arquivo; um `sed -i` antigo trocou o inode, e o container seguia vendo a
   versão SEM a Fiolib. O site só funcionava porque a configuração tinha sido
   carregada à mão. **Um reinício do Caddy ou da VPS teria derrubado o
   fiolib.com.br.** Reiniciado o container (segundos fora, Wallt e Fiolib
   voltaram 200). Regra: editar só com `cat novo > /opt/picord/Caddyfile`.
2. **A primeira conta vira admin — sempre.** A regra era "é a única conta do
   banco": um banco esvaziado daria o painel ao próximo cadastro. Agora vale uma
   vez na vida do banco (`ajuste.casa_fundada`, `contas.casaFundada`).
3. **Backups legíveis por qualquer usuário** (644, com as contas). Agora 600 em
   pasta 700, e o `backup.sh` grava com `umask 077`.
4. **Sessões antigas de admin** abertas por `curl` em 15–16/09 (válidas até
   outubro): encerradas.

E dois ganhos de separação:

- **Deploy com chave própria** (`~/.ssh/fiolib-deploy`): a Fiolib usava a chave
  do deploy automático do Wallt. Agora cada projeto pode ser revogado sozinho.
- **Registro de acesso** da Fiolib no Caddy (`/data/fiolib-acesso.log`), para
  haver rastro numa próxima investigação: só o começo do IP (/16), sem cookie,
  30 dias. Declarado na página de privacidade.

## Fiolib × Wallt

Separados: containers, rede do Docker, volumes, `.env` (600), usuário dos
processos (a Fiolib roda sem root), backups, e agora a chave de deploy.
Compartilhados: a máquina (2 GB, **sem swap** — a soma dos tetos de memória
passa da memória real), o Caddy (é o do Wallt; os blocos da Fiolib moram no
Caddyfile dele) e o acesso root por SSH.

## Feito depois, no mesmo dia (separação e controle)

- **Caddyfile da Fiolib em arquivo próprio** (`/opt/fio/caddy/fiolib.caddy`),
  importado pelo do Wallt; registro de acesso em `/opt/fio/logs`. Os dois
  sites voltaram 200 depois da troca.
- **Prioridade da Fiolib** na máquina: `oom_score_adj` -500 no site e -200 na
  esteira (o sistema mata outros processos antes), e o dobro da fatia de CPU
  para o site.
- **Painel → aba Controle**: tudo que roda num retrato (site, esteira, backup,
  cópia no PC, memória, disco, tentativas de invasão, sessões do painel). Sem
  acesso ao Docker, de propósito.
- **A administração entra só pelo Google** quando ele está ligado e vinculado;
  a senha certa digitada fora dele é barrada e vira alerta no painel. Sessão de
  administração vale 7 dias, sem renovar. `FIO_ADMIN_SENHA=permitida` reabre a
  senha em emergência.
- **Defeito antigo corrigido**: usar uma sessão renovava OUTRA (a de número igual
  ao da conta), porque `l.*` encobria `s.id` na consulta.
- **O login com Google já está num projeto separado do Wallt** (números de
  projeto diferentes nos dois Client IDs). O que falta é só o NOME do projeto e
  do app na tela de consentimento, no console do Google.

## Fica para decidir

- **Swap de 2 GB** (a VPS não tem nenhuma): precisa ser feito pelo dono.
- **Acesso root por SSH** continua compartilhado entre os dois projetos.
