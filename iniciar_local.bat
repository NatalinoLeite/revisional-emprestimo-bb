@echo off
chcp 65001 > nul
title Sistema Revisional de Emprestimo BB - Servidor Local

echo ========================================================
echo  Iniciando Sistema Revisional de Emprestimo BB
echo ========================================================
echo.

if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado. Copiando de .env.example...
    copy .env.example .env
)

echo [OK] Iniciando servidor Node.js em http://localhost:3000...
echo.

start "" "http://localhost:3000"

node server.js
pause
