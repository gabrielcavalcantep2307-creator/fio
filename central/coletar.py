#!/usr/bin/env python3
"""Tudo que dá para saber sobre a VPS, num JSON só.

    python3 coletar.py

Roda NA VPS. Não muda nada — só lê e conta. É a metade "olhar" da central; a
metade "mexer" mora em `acoes.mjs`, separada de propósito, porque um arquivo
que só lê pode ser rodado sem medo a qualquer hora e por qualquer motivo.

── por que Python, e não Node ──

O resto do projeto é Node sem dependência nenhuma, e este arquivo destoa. O
motivo é simples: a VPS não tem node no host. Tem dentro do contêiner do Fio, e
o contêiner não enxerga o host — não vê `docker ps`, não vê as portas abertas,
não vê o disco da máquina. Um coletor que rodasse lá dentro seria cego para
justamente aquilo que se quer ver.

Python 3 já vem no Ubuntu e está lá. Zero dependências, como o resto.

── por que um JSON só, e não um pedido por seção ──

Cada chamada custa um SSH: abrir conexão, autenticar, fechar. São uns dois
segundos. Quinze seções seriam trinta segundos de espera e trinta handshakes
para dizer a mesma coisa. Um JSON só custa os mesmos dois segundos e chega
inteiro — e a página, tendo tudo de uma vez, pode mostrar as ligações entre as
coisas, que é metade da graça de ter um panorama.
"""

import json
import os
import re
import subprocess
import time

FIO = "infra-fio-1"
BANCO = "/dados/catalogo.db"
SITE = "https://fiolib.duckdns.org"


def rodar(cmd, timeout=25):
    """O que o comando disse, ou string vazia. Nunca levanta.

    Um coletor que quebra na décima seção não entrega as nove primeiras, e as
    nove primeiras é que iam explicar a décima. Cada pedaço falha sozinho.
    """
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (p.stdout or "").strip()
    except Exception:
        return ""


def numero(s, padrao=0):
    try:
        return float(s)
    except (TypeError, ValueError):
        return padrao


# ─────────────────────────────────────────────────────────────
# A máquina
# ─────────────────────────────────────────────────────────────

def maquina():
    with open("/proc/uptime") as f:
        segundos = numero(f.read().split()[0])
    with open("/proc/loadavg") as f:
        carga = f.read().split()[:3]

    mem = {}
    with open("/proc/meminfo") as f:
        for linha in f:
            chave, _, resto = linha.partition(":")
            mem[chave] = numero(resto.strip().split()[0]) / 1024  # MiB

    disco = rodar("df -B1 --output=size,used,avail,pcent / | tail -1").split()
    nucleos = os.cpu_count() or 1

    return {
        "nome": rodar("hostname"),
        "sistema": rodar(". /etc/os-release 2>/dev/null && echo $PRETTY_NAME"),
        "kernel": rodar("uname -r"),
        "de_pe_segundos": segundos,
        # A carga é por NÚCLEO: 1.0 numa máquina de 1 núcleo é lotação, e numa
        # de 4 é folga. Sem os núcleos junto, o número não quer dizer nada.
        "carga": [numero(c) for c in carga],
        "nucleos": nucleos,
        "memoria_mb": {
            "total": round(mem.get("MemTotal", 0)),
            "disponivel": round(mem.get("MemAvailable", 0)),
            "usada": round(mem.get("MemTotal", 0) - mem.get("MemAvailable", 0)),
        },
        "troca_mb": {
            "total": round(mem.get("SwapTotal", 0)),
            "livre": round(mem.get("SwapFree", 0)),
        },
        "disco": {
            "total": int(numero(disco[0])) if len(disco) > 3 else 0,
            "usado": int(numero(disco[1])) if len(disco) > 3 else 0,
            "livre": int(numero(disco[2])) if len(disco) > 3 else 0,
        },
    }


# ─────────────────────────────────────────────────────────────
# Docker: o que está rodando, e quanto está custando
# ─────────────────────────────────────────────────────────────

def containers():
    #  O separador é \x1f (unit separator), e não "|", porque nome de imagem e
    #  linha de portas têm "|" e ":" à vontade. Um separador que não aparece em
    #  texto normal é a diferença entre partir certo e partir quase sempre.
    F = "\x1f".join(["{{.Names}}", "{{.Image}}", "{{.State}}", "{{.Status}}", "{{.Ports}}", "{{.CreatedAt}}"])
    fora = rodar(f"docker ps -a --format '{F}'")

    uso = {}
    for linha in rodar("docker stats --no-stream --format '{{.Name}}\x1f{{.CPUPerc}}\x1f{{.MemUsage}}\x1f{{.MemPerc}}'").splitlines():
        p = linha.split("\x1f")
        if len(p) >= 4:
            uso[p[0]] = {"cpu": p[1], "memoria": p[2], "memoria_pct": p[3]}

    saida = []
    for linha in fora.splitlines():
        p = linha.split("\x1f")
        if len(p) < 6:
            continue
        nome = p[0]
        detalhe = rodar(
            "docker inspect --format "
            "'{{.RestartCount}}\x1f{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}"
            "\x1f{{.HostConfig.RestartPolicy.Name}}' " + nome).split("\x1f")
        saida.append({
            "nome": nome,
            "imagem": p[1],
            "estado": p[2],
            "situacao": p[3],
            "portas": p[4],
            "criado": p[5],
            # Reinícios é o número que denuncia um serviço que cai e volta sem
            # ninguém perceber: por fora ele está "Up", e "Up" pela décima vez.
            "reinicios": int(numero(detalhe[0])) if detalhe else 0,
            "saude": detalhe[1] if len(detalhe) > 1 else "-",
            "politica": detalhe[2] if len(detalhe) > 2 else "-",
            "uso": uso.get(nome),
        })
    return saida


def volumes():
    saida = []
    for nome in rodar("docker volume ls --format '{{.Name}}'").splitlines():
        caminho = f"/var/lib/docker/volumes/{nome}/_data"
        bytes_ = rodar(f"du -sb {caminho} 2>/dev/null | cut -f1", timeout=60)
        saida.append({
            "nome": nome,
            "caminho": caminho,
            "bytes": int(numero(bytes_)),
            "usado_por": [c for c in rodar(
                f"docker ps -a --filter volume={nome} --format '{{{{.Names}}}}'").splitlines() if c],
        })
    return sorted(saida, key=lambda v: -v["bytes"])


# ─────────────────────────────────────────────────────────────
# A rede: o que está aberto, e para quem
# ─────────────────────────────────────────────────────────────

def portas():
    """Cada porta que escuta, e — o que importa — se escuta para a internet.

    A diferença entre `127.0.0.1:8787` e `0.0.0.0:8787` é a diferença entre um
    serviço que só a própria máquina alcança e um que o mundo inteiro alcança.
    Nos dois casos o `ss` mostra "LISTEN", e é por isso que esta coluna existe
    separada: é a única que decide se uma porta aberta é normal ou é um susto.
    """
    saida = []
    for linha in rodar("ss -tlnpH").splitlines():
        campos = linha.split()
        if len(campos) < 4:
            continue
        endereco = campos[3]
        ip, _, porta = endereco.rpartition(":")
        quem = re.search(r'users:\(\("([^"]+)",pid=(\d+)', linha)
        publica = ip in ("0.0.0.0", "*", "[::]", "::")
        saida.append({
            "porta": int(numero(porta)),
            "endereco": ip,
            "publica": publica,
            "programa": quem.group(1) if quem else "?",
            "pid": int(quem.group(2)) if quem else 0,
        })
    return sorted(saida, key=lambda p: (not p["publica"], p["porta"]))


def processos_fora_do_docker():
    """Os programas que rodam soltos na máquina, sem contêiner.

    Esta seção existe por uma descoberta: havia um `node server.js` de pé há
    doze dias, na porta 3000, como usuário `ubuntu`, e ninguém sabia o que era.
    Um panorama que só mostra o Docker teria continuado sem mostrar.
    """
    saida = []
    fora = rodar("ps -eo pid,user,etimes,rss,args --sort=-rss --no-headers")
    for linha in fora.splitlines()[:60]:
        campos = linha.split(None, 4)
        if len(campos) < 5:
            continue
        pid, usuario, segundos, rss, args = campos
        # O que roda dentro de contêiner aparece aqui também, porque é tudo o
        # mesmo kernel. O `cgroup` é quem sabe a diferença.
        cgroup = rodar(f"cat /proc/{pid}/cgroup 2>/dev/null | head -1")
        if "docker" in cgroup or "containerd" in cgroup:
            continue
        if args.startswith("[") or int(numero(rss)) < 8000:
            continue
        saida.append({
            "pid": int(numero(pid)),
            "usuario": usuario,
            "segundos": int(numero(segundos)),
            "memoria_mb": round(numero(rss) / 1024, 1),
            "comando": args[:160],
        })
    return saida[:20]


# ─────────────────────────────────────────────────────────────
# O Fio: o banco, o catálogo, as contas
# ─────────────────────────────────────────────────────────────

CONSULTA = r"""
const {DatabaseSync} = require('node:sqlite')
// argv[2], e não argv[1]: rodando como ARQUIVO, o argv[1] é o próprio script.
// Com argv[1] ele abria o .js como se fosse um banco, toda consulta falhava, e
// o JSON.stringify engolia os `undefined` e devolvia `{}` — um objeto vazio e
// perfeitamente válido, que não parece erro nenhum.
const db = new DatabaseSync(process.argv[2], {readOnly: true})
const um = (sql) => { try { return db.prepare(sql).get() } catch (e) { return {erro: e.message} } }
console.log(JSON.stringify({
  obras:      um('SELECT COUNT(*) n FROM obra').n,
  publicadas: um('SELECT COUNT(*) n FROM obra WHERE publicada = 1').n,
  textos:     um('SELECT COUNT(*) n FROM texto').n,
  nossos:     um("SELECT COUNT(*) n FROM texto WHERE fonte = 'fio_traducao'").n,
  vazios:     um('SELECT COUNT(*) n FROM texto t WHERE NOT EXISTS (SELECT 1 FROM capitulo c WHERE c.texto_id = t.id)').n,
  capitulos:  um('SELECT COUNT(*) n FROM capitulo').n,
  palavras:   um('SELECT SUM(palavras) n FROM capitulo').n,
  pessoas:    um('SELECT COUNT(*) n FROM pessoa').n,
  leitores:   um('SELECT COUNT(*) n FROM leitor').n,
  sessoes:    um('SELECT COUNT(*) n FROM sessao').n,
  convites:   um('SELECT COUNT(*) n FROM convite').n,
}))
"""


def fio():
    dados = {}

    # `stat`, e não `ls -l`: o contêiner é Alpine, e o `ls` do BusyBox não tem
    # `--time-style`. O `ls` dele aceita a opção, imprime a ajuda inteira e sai
    # com sucesso — então quem parasse na saída vazia acharia que a pasta é que
    # estava vazia, e não que o comando não existia.
    bruto = rodar(f"""docker exec {FIO} sh -c 'for f in /dados/*; do stat -c "%n %s %Y" "$f"; done'""")
    arquivos = []
    for linha in bruto.splitlines():
        c = linha.split()
        if len(c) == 3:
            arquivos.append({
                "nome": os.path.basename(c[0]),
                "bytes": int(numero(c[1])),
                "mexido": int(numero(c[2])),
            })
    dados["arquivos_do_banco"] = arquivos

    # O WAL merece linha própria. Ele é o diário de escrita do SQLite, e cresce
    # até alguém fechar o ciclo. Um WAL de 80 MB não é defeito; um WAL maior que
    # o banco é sinal de que ninguém está fazendo checkpoint, e o disco paga.
    wal = next((a for a in arquivos if a["nome"].endswith("-wal")), None)
    principal = next((a for a in arquivos if a["nome"].endswith(".db")), None)
    dados["wal_bytes"] = wal["bytes"] if wal else 0
    dados["banco_bytes"] = principal["bytes"] if principal else 0

    # A consulta vai para um ARQUIVO, e não por `node -e`.
    #
    # Entre este script e o node há três camadas que mordem aspas: o `sh` do
    # subprocess, o `sh` do `docker exec` e o próprio shell de dentro do
    # contêiner. Uma consulta com aspas, chaves e parênteses atravessa as três e
    # chega irreconhecível — e o sintoma é saída vazia, que é indistinguível de
    # "o banco não respondeu". Foi assim que esta seção veio vazia na primeira
    # vez, culpando o banco por um problema de aspas.
    with open("/tmp/fio-consulta.js", "w") as f:
        f.write(CONSULTA)
    rodar(f"docker cp /tmp/fio-consulta.js {FIO}:/tmp/fio-consulta.js")
    saida = rodar(f"docker exec {FIO} node /tmp/fio-consulta.js {BANCO} 2>/dev/null", timeout=120)
    try:
        dados["catalogo"] = json.loads(saida.splitlines()[-1])
    except Exception:
        dados["catalogo"] = {"erro": "não deu para ler o banco", "saida": saida[-300:]}

    return dados


def site():
    saida = {}
    for nome, caminho in [("saude", "/api/saude"), ("catalogo", "/dados/catalogo.json"), ("raiz", "/")]:
        t0 = time.time()
        codigo = rodar(f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 15 {SITE}{caminho}")
        saida[nome] = {"codigo": codigo, "ms": round((time.time() - t0) * 1000)}

    cabeca = rodar(f"curl -s --max-time 15 {SITE}/dados/catalogo.json | head -c 200")
    m = re.search(r'"geradoEm"\s*:\s*"([^"]+)"', cabeca)
    saida["catalogo_gerado_em"] = m.group(1) if m else None

    cert = rodar("echo | openssl s_client -servername fiolib.duckdns.org "
                 "-connect fiolib.duckdns.org:443 2>/dev/null | openssl x509 -noout -enddate")
    m = re.search(r"notAfter=(.+)", cert)
    saida["certificado_ate"] = m.group(1).strip() if m else None
    return saida


# ─────────────────────────────────────────────────────────────
# As cópias de segurança — e o que NÃO tem nenhuma
# ─────────────────────────────────────────────────────────────

def backups():
    """Onde estão as cópias, de quando são, e de quem NÃO existe cópia.

    A parte que importa é a última. Uma tela de backup que lista o que existe
    deixa passar exatamente o caso perigoso: a pasta `/opt/fio/backups` existe,
    está no lugar certo, e está vazia. Listar o que existe mostraria "nada" e
    seguiria em frente. Por isso aqui se pergunta o contrário — quais bancos
    estão de pé sem nenhuma cópia — e essa lista é a resposta que assusta.
    """
    pastas = []
    projetos_com_copia = []
    for caminho in ["/opt/fio/backups", "/opt/picord/backups"]:
        lista = []
        for linha in rodar(f"find {caminho} -maxdepth 1 -type f -printf '%s\\t%T@\\t%f\\n' 2>/dev/null").splitlines():
            p = linha.split("\t")
            if len(p) == 3:
                lista.append({"nome": p[2], "bytes": int(numero(p[0])), "quando": int(numero(p[1]))})
        lista.sort(key=lambda a: -a["quando"])
        # O projeto é o nome da pasta em /opt: /opt/fio/backups guarda o Fio.
        # Só conta se tiver arquivo dentro — pasta vazia no lugar certo foi
        # exatamente o que enganou aqui antes.
        if lista:
            projetos_com_copia.append(caminho.split("/")[2])
        pastas.append({
            "caminho": caminho,
            "quantos": len(lista),
            "bytes": sum(a["bytes"] for a in lista),
            "mais_novo": lista[0] if lista else None,
        })

    # Todo banco SQLite de pé na máquina, dentro dos volumes do Docker.
    #
    # ── como se liga um banco à cópia dele ──
    #
    # Pelo nome do volume não dá. O banco da biblioteca mora em `infra_dados` —
    # batizado pela pasta `infra/` do compose, e não pelo projeto — enquanto a
    # cópia dele se chama `fio-20260914.db.gz`. "infra" e "fio" não se parecem,
    # e a primeira versão disto declarou "sem cópia" um banco que tinha 629 MB
    # de cópia feita cinco minutos antes.
    #
    # Pelo nome do ARQUIVO também não: o banco é `catalogo.db` e a cópia nunca
    # vai se chamar "catalogo" — cópia se chama pelo projeto e pela data.
    #
    # Quem liga os dois é o CONTÊINER. `infra_dados` é montado por `infra-fio-1`,
    # e "fio" está ali no meio do nome. Então as pistas de um banco são o volume
    # mais os contêineres que o usam, e a pergunta é se o nome de algum projeto
    # com cópia aparece em alguma delas.
    bancos = []
    for linha in rodar("find /var/lib/docker/volumes -maxdepth 4 -name '*.db' "
                       "-size +100k -printf '%s\\t%p\\n' 2>/dev/null", timeout=60).splitlines():
        tamanho, _, caminho = linha.partition("\t")
        partes = caminho.split("/")
        volume = partes[5] if len(partes) > 5 else ""
        usuarios = [c for c in rodar(
            f"docker ps -a --filter volume={volume} --format '{{{{.Names}}}}'").splitlines() if c]
        pistas = " ".join([volume] + usuarios)
        projeto = next((p for p in projetos_com_copia if p in pistas), "")
        bancos.append({
            "caminho": caminho,
            "nome": os.path.basename(caminho),
            "volume": volume,
            "usado_por": usuarios,
            "projeto": projeto or re.split(r"[_-]", volume)[0],
            "tem_copia": bool(projeto),
            "bytes": int(numero(tamanho)),
        })

    return {
        "pastas": pastas,
        "bancos": sorted(bancos, key=lambda b: -b["bytes"]),
        "cron": [l for l in rodar("crontab -l 2>/dev/null").splitlines() if l and not l.startswith("#")],
    }


# ─────────────────────────────────────────────────────────────
# Segurança, no que dá para ver de fora do código
# ─────────────────────────────────────────────────────────────

def seguranca():
    sshd = rodar("sshd -T 2>/dev/null")
    def conf(chave):
        m = re.search(rf"^{chave}\s+(.+)$", sshd, re.M | re.I)
        return m.group(1).strip() if m else "?"

    return {
        "ssh_senha_permitida": conf("passwordauthentication"),
        "ssh_root_permitido": conf("permitrootlogin"),
        "ssh_porta": conf("port"),
        "fail2ban": rodar("systemctl is-active fail2ban 2>/dev/null"),
        "fail2ban_banidos": rodar("fail2ban-client status sshd 2>/dev/null | grep -c 'Banned IP'"),
        "firewall": rodar("ufw status 2>/dev/null | head -1") or "ufw não instalado",
        "atualizacoes_pendentes": rodar(
            "apt-get -s upgrade 2>/dev/null | grep -c '^Inst'") or "0",
        "reiniciar_pendente": os.path.exists("/var/run/reboot-required"),
        "entradas_recusadas_hoje": rodar(
            "journalctl -u ssh --since today --no-pager 2>/dev/null | grep -c 'Failed password'") or "0",
    }


def pastas_do_disco():
    saida = []
    for linha in rodar("du -sb /opt/* /var/log /var/lib/docker 2>/dev/null", timeout=120).splitlines():
        tamanho, _, caminho = linha.partition("\t")
        saida.append({"caminho": caminho, "bytes": int(numero(tamanho))})
    return sorted(saida, key=lambda p: -p["bytes"])[:14]


if __name__ == "__main__":
    print(json.dumps({
        "colhido_em": int(time.time()),
        "maquina": maquina(),
        "containers": containers(),
        "volumes": volumes(),
        "portas": portas(),
        "processos": processos_fora_do_docker(),
        "fio": fio(),
        "site": site(),
        "backups": backups(),
        "seguranca": seguranca(),
        "pastas": pastas_do_disco(),
    }, ensure_ascii=False))
