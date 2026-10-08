# O tradutor local da Fiolib (06/10/2026).
#
# O dono não quer gastar um centavo e não quer API de fora. O MinT (NLLB-600M
# da Wikimedia) é grátis, mas é fraco e cai (502 em 3 de 30 frases no teste).
# Este serviço roda o Opus-MT (Universidade de Helsinque, inglês -> português
# do Brasil) DENTRO da VPS, em CTranslate2 com int8: ~100 palavras por
# segundo em dois núcleos, sem rede.
#
# Ele NÃO decide nada. Devolve, para cada frase, as 4 melhores traduções do
# modelo e, em cada uma, as palavras que ficaram iguais ao original e não
# existem em português ("hale", "sinewy", "charitably"). Quem escolhe é a
# esteira (servidor/servicos/tradutor-local.mjs), com as mesmas travas de
# sempre — escolher no Node deixa a regra num lugar só, e testada.
#
# Duas armadilhas pagas no teste:
#   - o Marian precisa de '</s>' no fim da entrada; sem isso o decodificador
#     não para ("Sr. Sr. Sr.") e corta frase longa;
#   - o modelo serve duas variantes: o prefixo '>>pob<<' pede o português do
#     Brasil ('>>por<<' seria o de Portugal).
#
#   POST /traduzir {"de": "en", "frases": [...], "n": 4}
#        -> {"saida": [[{"t": "...", "restos": ["hale"]}, ...], ...]}
#   POST /voltar   {"frases": [...]}   (português -> inglês, para medir)
#   GET  /saude

import json, os, re, subprocess, threading, time, unicodedata
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import ctranslate2
import sentencepiece as spm

PASTA = os.environ.get('MT_PASTA', '/mt')
FIOS = int(os.environ.get('MT_FIOS', '2'))
PORTA = int(os.environ.get('MT_PORTA', '8095'))

class Modelo:
    def __init__(self, pasta, prefixo=None):
        self.tr = ctranslate2.Translator(pasta, device='cpu', compute_type='int8', inter_threads=1, intra_threads=FIOS)
        self.s = spm.SentencePieceProcessor(model_file=pasta + '/source.spm')
        self.t = spm.SentencePieceProcessor(model_file=pasta + '/target.spm')
        self.prefixo = prefixo

    def traduzir(self, frases, n=1):
        toks = [([self.prefixo] if self.prefixo else []) + self.s.encode(f, out_type=str) + ['</s>'] for f in frases]
        # teto de tamanho pela frase: um laço que escapar morre no teto, e não em 512 tokens
        teto = min(512, max(len(x) for x in toks) * 3 + 20) if toks else 64
        r = self.tr.translate_batch(toks, beam_size=max(4, n), num_hypotheses=n, max_decoding_length=teto)
        return [[self.t.decode(h) for h in x.hypotheses] for x in r]

    def traduzir_rapido(self, frases):
        """Uma alternativa, feixe 2, lote grande: a passada de todo mundo."""
        toks = [([self.prefixo] if self.prefixo else []) + self.s.encode(f, out_type=str) + ['</s>'] for f in frases]
        teto = min(512, max(len(x) for x in toks) * 3 + 20) if toks else 64
        r = self.tr.translate_batch(toks, beam_size=2, num_hypotheses=1, max_decoding_length=teto, max_batch_size=LOTE)
        return [[self.t.decode(x.hypotheses[0])] for x in r]

MODELOS = {}
if os.path.isdir(PASTA + '/en-pt'):
    MODELOS['en'] = Modelo(PASTA + '/en-pt', '>>pob<<')
VOLTA = Modelo(PASTA + '/romance-en') if os.path.isdir(PASTA + '/romance-en') else None
# um modelo de cada vez: dois núcleos, e o CTranslate2 já usa os dois
TRAVA = threading.Lock()

# ── o LOTE (06/10/2026, segunda leva) ──
# Medido na VPS, 240 frases de O Morro dos Ventos Uivantes:
#   4 alternativas, lote de 8 ....  79 palavras/s
#   1 alternativa,  lote de 32 ... 182 palavras/s (feixe 2)
# A esteira manda um parágrafo por pedido (5 frases): lote pequeno, núcleo
# ocioso. Aqui os pedidos de 1 alternativa que chegam juntos viram UM lote, e
# cada um recebe de volta as suas frases. As 4 alternativas só são pedidas,
# separadamente, para a frase que falhou nas travas da primeira vez.
LOTE = int(os.environ.get('MT_LOTE', '48'))
fila_lote = []           # (frases, evento, caixa)
fila_cond = threading.Condition()

def juntador():
    m = MODELOS.get('en')
    while True:
        with fila_cond:
            while not fila_lote:
                fila_cond.wait()
            # espera um instante para os pedidos de quem trabalha em paralelo chegarem
            fila_cond.wait(0.05)
            pegos, n = [], 0
            while fila_lote and (not pegos or n + len(fila_lote[0][0]) <= LOTE):
                p = fila_lote.pop(0); pegos.append(p); n += len(p[0])
        todas = [f for p in pegos for f in p[0]]
        try:
            with TRAVA:
                r = m.traduzir_rapido(todas)
            i = 0
            for frases, ev, caixa in pegos:
                caixa['saida'] = r[i:i + len(frases)]; i += len(frases); ev.set()
        except Exception as e:
            for _, ev, caixa in pegos:
                caixa['erro'] = str(e); ev.set()

def traduzir_em_lote(frases):
    ev, caixa = threading.Event(), {}
    with fila_cond:
        fila_lote.append((frases, ev, caixa)); fila_cond.notify()
    ev.wait(600)
    if 'erro' in caixa or 'saida' not in caixa:
        raise RuntimeError(caixa.get('erro', 'sem resposta do lote'))
    return caixa['saida']

if 'en' in MODELOS:
    threading.Thread(target=juntador, daemon=True).start()

# ── o que ficou no original ──
# Palavra da tradução que aparece igual na frase de origem, com 4 letras ou
# mais, em minúscula, e que o dicionário pt_BR não conhece. "Hotel", "animal",
# "final" existem nos dois e passam; "hale" e "sinewy" não.
PAL = re.compile(r"[A-Za-zÀ-ÿ]+(?:'[A-Za-z]+)?")
def conhecidas_pt(palavras):
    if not palavras:
        return set()
    p = subprocess.run(['hunspell', '-d', 'pt_BR', '-i', 'utf-8', '-l'], input='\n'.join(palavras),
                       capture_output=True, text=True, timeout=20)
    desconhecidas = set(p.stdout.split())
    return set(palavras) - desconhecidas

# ── a letra que o modelo não tem (07/10/2026) ──
# O vocabulário do Opus não tem "ü" nem maiúscula acentuada: sai "⁇" no lugar
# ("freq ⁇ entemente", "HIST ⁇ RIA", " ⁇ ndia", "H ⁇ chi"). 3.552 vezes em 59
# livros antes de alguém ver. O conserto: (1) a palavra que está no ORIGINAL
# com o mesmo esqueleto ("Hōchi"); (2) a letra que dá palavra do dicionário.
TROCA_UNK = ['u', 'í', 'ó', 'á', 'é', 'ú', 'ã', 'õ', 'ç', 'ê', 'â', 'ô', 'çã', 'çõ', 'ü', 'ō', 'ū']
UNK = re.compile(r"(\w*)\s?⁇\s?(\w*)")

def consertar_unk(origem, t):
    if '⁇' not in t:
        return t
    palavras_origem = re.findall(r'\w+', origem)
    sem_acento = lambda s: ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    origem_nua = set(sem_acento(w).lower() for w in palavras_origem)
    def troca(m):
        a, b = m.group(1), m.group(2)
        antes = t[:m.start()].rstrip()[-1:]
        # (1) nome com letra especial no original ("Hōchi", "Tōkyō")
        if a or b:
            esq = re.compile('^' + re.escape(a) + r'\w{1,2}' + re.escape(b) + '$', re.I)
            for w in palavras_origem:
                if esq.match(w) and not w.isascii(): return w.upper() if (a + b).isupper() else w
        # (2) a letra que falta. O espaço em volta do "⁇" é do modelo: "a ⁇ ndia"
        # pode ser "aXndia" ou "a" + "Xndia". Tenta as duas leituras.
        leituras = [(a, '')] + ([('', a + ' ')] if a else [])
        for pre, fica in leituras:
            # palavra toda maiúscula: maiúscula acentuada ("HISTÓRIA"); começo de
            # palavra: as duas caixas (nome "Índia", substantivo "ímã"); "u" só
            # no meio (o "ü" de "frequente"), e a maiúscula sem acento nunca
            # falta, o modelo a tem
            tudo_maius = (pre + b).isupper() and len(pre + b) > 1
            letras = [c for c in TROCA_UNK if not (not pre and c == 'u')]
            if tudo_maius: cands = [pre + c.upper() + b for c in letras if c != 'u']
            elif not pre: cands = [c.upper() + b for c in letras] + [c + b for c in letras]
            else: cands = [pre + c + b for c in letras]
            # (2a) a forma acentuada do que está no original ("Ursula" -> "Úrsula", "India" -> "Índia")
            for c in cands:
                if sem_acento(c).lower() in origem_nua and len(c) > 2: return fica + c
            # (2b) a palavra do dicionário; no começo, a minúscula se vem no meio da frase
            validas = conhecidas_pt(sorted(set(c.lower() for c in cands)))
            boas = [c for c in cands if c.lower() in validas]
            if boas:
                meio = (fica or antes).strip()[-1:].isalpha() or antes == '-'
                if not pre and not tudo_maius:
                    mins = [c for c in boas if c[:1].islower()]
                    if meio and mins: return fica + mins[0]
                return fica + boas[0]
        return m.group(0)
    s = UNK.sub(troca, t)
    return s

def restos(origem, hipoteses):
    o = set(w.lower() for w in PAL.findall(origem))
    cand = []
    for h in hipoteses:
        cand.append([w for w in PAL.findall(h) if len(w) >= 4 and w.islower() and w in o])
    todas = sorted(set(w for c in cand for w in c))
    ok = conhecidas_pt(todas)
    return [[w for w in c if w not in ok] for c in cand]

class Pedido(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def responder(self, cod, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == '/saude':
            return self.responder(200, {'ok': True, 'de': sorted(MODELOS), 'volta': bool(VOLTA), 'fios': FIOS})
        self.responder(404, {'erro': 'não existe'})

    def do_POST(self):
        try:
            d = json.loads(self.rfile.read(int(self.headers.get('content-length', 0))) or b'{}')
            frases = [str(f) for f in d.get('frases', [])][:64]
            if self.path == '/traduzir':
                m = MODELOS.get(d.get('de', 'en'))
                if not m:
                    return self.responder(400, {'erro': 'não traduzo do ' + str(d.get('de'))})
                n = max(1, min(int(d.get('n', 4)), 6))
                t0 = time.time()
                if not frases:
                    hips = []
                elif n == 1 and d.get('de', 'en') == 'en':
                    hips = traduzir_em_lote(frases)
                else:
                    with TRAVA:
                        hips = m.traduzir(frases, n)
                saida = []
                for f, hs in zip(frases, hips):
                    hs = [consertar_unk(f, h) for h in hs]
                    rs = restos(f, hs)
                    saida.append([{'t': h, 'restos': r} for h, r in zip(hs, rs)])
                return self.responder(200, {'saida': saida, 'ms': int((time.time() - t0) * 1000)})
            if self.path == '/voltar':
                if not VOLTA:
                    return self.responder(400, {'erro': 'sem modelo de volta'})
                with TRAVA:
                    v = VOLTA.traduzir(frases, 1) if frases else []
                return self.responder(200, {'saida': [x[0] for x in v]})
            self.responder(404, {'erro': 'não existe'})
        except Exception as e:
            self.responder(500, {'erro': str(e)[:300]})

if __name__ == '__main__':
    print('tradutor de pé:', sorted(MODELOS), 'volta' if VOLTA else '', 'porta', PORTA, flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORTA), Pedido).serve_forever()
