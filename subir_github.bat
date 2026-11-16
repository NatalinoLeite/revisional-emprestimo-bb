@echo off
chcp 65001 > nul
echo ========================================================
echo 🚀 ENVIANDO PROJETO REVISIONAL PARA O GITHUB
echo ========================================================
echo.
echo Repositório: https://github.com/NatalinoLeite/revisional-emprestimo-bb.git
echo Branch: main
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo ✅ PROJETO ENVIADO COM SUCESSO PARA O GITHUB!
    echo ========================================================
    echo.
    echo Agora acesse https://vercel.com/new e importe o projeto:
    echo NatalinoLeite/revisional-emprestimo-bb
    echo.
) else (
    echo ========================================================
    echo ❌ Ocorreu um erro no envio. Verifique a autenticação.
    echo ========================================================
)
pause
