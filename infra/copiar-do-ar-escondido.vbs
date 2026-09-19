' Roda infra/copiar-do-ar.mjs SEM abrir janela. É o que o Agendador de
' Tarefas do Windows chama ("Fiolib - copia do site no ar", 12:30 e quando o
' notebook liga depois de ter perdido a hora).
'
' Por que existe: chamar o node.exe direto abre uma janela preta de console —
' e quem abre o notebook vê "um cmd" rodando sem saber o que é. Este arquivo
' só esconde a janela; a saída vai para backups-do-ar\ultima-copia.log.
Set fso = CreateObject("Scripting.FileSystemObject")
infra = fso.GetParentFolderName(WScript.ScriptFullName)
raiz = fso.GetParentFolderName(infra)
If Not fso.FolderExists(raiz & "\backups-do-ar") Then fso.CreateFolder(raiz & "\backups-do-ar")
cmd = "cmd /c node """ & infra & "\copiar-do-ar.mjs"" > """ & raiz & "\backups-do-ar\ultima-copia.log"" 2>&1"
CreateObject("WScript.Shell").Run cmd, 0, True
