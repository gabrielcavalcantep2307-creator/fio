@echo off
rem Abre a Central do Fio. Clique duas vezes neste arquivo.
rem
rem A janela preta que aparece E o programa: fechar ela fecha a central.
rem Pode minimizar a vontade.
rem
rem O chcp 65001 poe o console em UTF-8. Sem ele, os acentos e as linhas do
rem quadro saem como lixo -- o Windows abre o console em code page 850, e o
rem programa escreve em UTF-8.

chcp 65001 > nul
cd /d "%~dp0"
title Central do Fio
node central\servidor.mjs

echo.
echo A central foi fechada.
pause
