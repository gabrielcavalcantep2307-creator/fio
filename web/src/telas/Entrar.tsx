import { useState } from 'react'
import * as conta from '../lib/conta'

// Entrar, criar conta e recuperar senha — uma tela só, três estados.
//
// O acervo é reservado: quem cria conta precisa de um convite. Isso é o que
// faz "meu e dos meus amigos" ser uma regra do sistema, e não um combinado.
//
// O botão do Google está aqui e desligado de propósito: o lugar dele na tela
// já existe, e ligar depois não muda o desenho.

type Modo = 'entrar' | 'criar' | 'esqueci'

export function Entrar() {
  const eu = conta.useConta()
  const [modo, setModo] = useState<Modo>('entrar')
  const [campos, setCampos] = useState({ nome: '', email: '', senha: '', convite: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const muda = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos(c => ({ ...c, [k]: e.target.value }))

  const forca = modo === 'criar' ? conta.forcaDaSenha(campos.senha) : null

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setFeito(null); setEnviando(true)
    try {
      if (modo === 'entrar') {
        await conta.entrar(campos.email, campos.senha)
      } else if (modo === 'criar') {
        if (!forca?.ok) throw new Error(forca?.aviso ?? 'senha fraca')
        await conta.criar(campos.nome, campos.email, campos.senha, campos.convite)
      } else {
        await conta.esqueci(campos.email)
        setFeito('Se existir uma conta com esse e-mail, o link de troca de senha chegou nele. O link vale por 30 minutos.')
      }
    } catch (x) {
      setErro(x instanceof Error ? x.message : 'não deu')
    } finally {
      setEnviando(false)
    }
  }

  if (eu) {
    return (
      <div className="max-w-sm mx-auto py-16 text-center flex flex-col gap-5">
        <h1 className="text-2xl" style={{ fontFamily: 'Literata, serif' }}>Olá, {eu.nome}</h1>
        <p className="miudo">{eu.email}</p>
        <button onClick={() => conta.sair()} className="px-5 py-2.5 rounded text-sm mx-auto"
          style={{ border: '1px solid var(--linha)' }}>Sair</button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto py-10 sm:py-16">
      <h1 className="text-2xl" style={{ fontFamily: 'Literata, serif' }}>
        {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar a senha'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--tinta-2)' }}>
        {modo === 'criar'
          ? 'A biblioteca é fechada: para criar conta é preciso um convite de quem já está dentro.'
          : 'A conta guarda seu progresso, suas marcações e suas notas entre aparelhos. Para só ler, ela não é necessária.'}
      </p>

      {!conta.temServidor() && (
        <p className="mt-5 p-3 rounded text-xs leading-relaxed"
          style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta-2)' }}>
          <b>O servidor de contas ainda não está no ar.</b> O site é publicado como
          página estática, e conta exige um processo rodando. O código do servidor
          já existe em <code>servidor/</code>; falta hospedá-lo e apontar{' '}
          <code>VITE_API</code> para ele. Enquanto isso, ler, marcar e anotar
          funcionam — só ficam guardados neste navegador.
        </p>
      )}

      <form onSubmit={enviar} className="flex flex-col gap-3 mt-7">
        {modo === 'criar' && (
          <Campo rotulo="nome" valor={campos.nome} muda={muda('nome')} auto="name" obrigatorio />
        )}
        <Campo rotulo="e-mail" tipo="email" valor={campos.email} muda={muda('email')} auto="email" obrigatorio />

        {modo !== 'esqueci' && (
          <>
            <Campo
              rotulo="senha" tipo="password" valor={campos.senha} muda={muda('senha')}
              auto={modo === 'criar' ? 'new-password' : 'current-password'} obrigatorio
            />
            {forca && campos.senha && (
              <p className="text-xs -mt-1" style={{ color: forca.ok ? 'var(--tinta-2)' : 'var(--acento)' }}>
                {forca.aviso}
              </p>
            )}
          </>
        )}

        {modo === 'criar' && (
          <Campo rotulo="código do convite" valor={campos.convite} muda={muda('convite')} obrigatorio />
        )}

        {erro && <p className="text-sm" style={{ color: 'var(--acento)' }}>{erro}</p>}
        {feito && <p className="text-sm" style={{ color: 'var(--tinta-2)' }}>{feito}</p>}

        <button
          type="submit"
          disabled={enviando || !conta.temServidor()}
          className="py-2.5 rounded text-sm mt-1 disabled:opacity-40"
          style={{ background: 'var(--acento)', color: '#fff' }}
        >
          {enviando ? 'um instante…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar o link'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px" style={{ background: 'var(--linha)' }} />
        <span className="miudo">ou</span>
        <div className="flex-1 h-px" style={{ background: 'var(--linha)' }} />
      </div>

      <button
        disabled
        title="ainda não"
        className="w-full py-2.5 rounded text-sm flex items-center justify-center gap-2 opacity-45 cursor-not-allowed"
        style={{ border: '1px solid var(--linha)' }}
      >
        <span aria-hidden>◯</span> Entrar com o Google
        <span className="miudo">em breve</span>
      </button>

      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-7 miudo">
        {modo !== 'entrar' && <button onClick={() => setModo('entrar')} className="hover:opacity-70">já tenho conta</button>}
        {modo !== 'criar' && <button onClick={() => setModo('criar')} className="hover:opacity-70">criar conta</button>}
        {modo !== 'esqueci' && <button onClick={() => setModo('esqueci')} className="hover:opacity-70">esqueci a senha</button>}
      </div>
    </div>
  )
}

function Campo({ rotulo, valor, muda, tipo = 'text', auto, obrigatorio }: {
  rotulo: string
  valor: string
  muda: (e: React.ChangeEvent<HTMLInputElement>) => void
  tipo?: string
  auto?: string
  obrigatorio?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="miudo">{rotulo}</span>
      <input
        type={tipo} value={valor} onChange={muda} autoComplete={auto} required={obrigatorio}
        className="px-3 py-2.5 rounded outline-none"
        style={{ background: 'var(--papel-2)', border: '1px solid var(--linha)', color: 'var(--tinta)' }}
      />
    </label>
  )
}
