@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Projyn Playout - Inicializador

REM Garante que o diretorio atual de execucao seja a pasta onde o iniciar.bat esta
cd /d "%~dp0"

echo ================================================================
echo               PROJYN PLAYOUT - INICIALIZADOR
echo ================================================================
echo.

REM -----------------------------------------------------------------
REM 0. VERIFICACOES DE ADMINISTRADOR
REM -----------------------------------------------------------------
net session >nul 2>&1
if %errorlevel% equ 0 (
    set "IS_ADMIN=1"
) else (
    set "IS_ADMIN=0"
)

REM -----------------------------------------------------------------
REM 1. VERIFICACAO DO PYTHON 3.10+
REM -----------------------------------------------------------------
echo [1/5] Verificando instalacao do Python 3.10+...

set "PYTHON_CMD="
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
) else (
    where py >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_CMD=py"
    )
)

set "NEED_PYTHON=0"
if "!PYTHON_CMD!"=="" (
    set "NEED_PYTHON=1"
) else (
    !PYTHON_CMD! -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [AVISO] A versao do Python encontrada e inferior a 3.10.
        set "NEED_PYTHON=1"
    )
)

if "!NEED_PYTHON!"=="1" (
    echo [INFO] Python 3.10+ nao foi detectado no sistema.
    if "!IS_ADMIN!"=="0" (
        echo.
        echo ================================================================
        echo  [ERRO] E NECESSARIO EXECUTAR EM MODO ADMINISTRADOR!
        echo.
        echo  Para instalar o Python automaticamente, feche esta janela,
        echo  clique com o BOTAO DIREITO no arquivo iniciar.bat e escolha:
        echo  --^> Executar como Administrador
        echo ================================================================
        echo.
        pause
        exit /b 1
    )
    
    echo [INSTALACAO] Instalando Python 3.11 via Winget...
    winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao instalar Python via Winget. Instale manualmente em https://www.python.org/
        pause
        exit /b 1
    )
    
    if exist "%LOCALAPPDATA%\Programs\Python\Python311" set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;!PATH!"
    if exist "%ProgramFiles%\Python311" set "PATH=%ProgramFiles%\Python311;%ProgramFiles%\Python311\Scripts;!PATH!"
    set "PYTHON_CMD=python"
)

for /f "delims=" %%v in ('!PYTHON_CMD! --version 2^>^&1') do echo [OK] %%v detectado.

REM -----------------------------------------------------------------
REM 2. VERIFICACAO DO NODE.JS 18+ E NPM
REM -----------------------------------------------------------------
echo.
echo [2/5] Verificando instalacao do Node.js 18+ e NPM...

set "NEED_NODE=0"
where node >nul 2>&1
if %errorlevel% neq 0 (
    set "NEED_NODE=1"
) else (
    node -e "process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [AVISO] A versao do Node.js encontrada e inferior a 18.
        set "NEED_NODE=1"
    )
)

if "!NEED_NODE!"=="1" (
    echo [INFO] Node.js 18+ nao foi detectado no sistema.
    if "!IS_ADMIN!"=="0" (
        echo.
        echo ================================================================
        echo  [ERRO] E NECESSARIO EXECUTAR EM MODO ADMINISTRADOR!
        echo.
        echo  Para instalar o Node.js automaticamente, feche esta janela,
        echo  clique com o BOTAO DIREITO no arquivo iniciar.bat e escolha:
        echo  --^> Executar como Administrador
        echo ================================================================
        echo.
        pause
        exit /b 1
    )
    
    echo [INSTALACAO] Instalando Node.js LTS via Winget...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao instalar Node.js via Winget. Instale manualmente em https://nodejs.org/
        pause
        exit /b 1
    )
    
    if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;!PATH!"
    if exist "%ProgramFiles(x86)%\nodejs" set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
)

for /f "delims=" %%v in ('node -v 2^>^&1') do echo [OK] Node.js %%v detectado.
for /f "delims=" %%v in ('npm -v 2^>^&1') do echo [OK] NPM v%%v detectado.

REM -----------------------------------------------------------------
REM 3. AMBIENTE VIRTUAL PYTHON (.venv) E DEPENDENCIAS BACKEND
REM -----------------------------------------------------------------
echo.
echo [3/5] Configurando ambiente virtual Python e dependencias...

if not exist ".venv\Scripts\activate.bat" (
    echo [INFO] Criando ambiente virtual Python .venv...
    !PYTHON_CMD! -m venv .venv
    if !errorlevel! neq 0 (
        echo [ERRO] Nao foi possivel criar o ambiente virtual .venv.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

python -c "import fastapi, uvicorn, sqlalchemy, jwt, PIL, requests, webview, yt_dlp" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INSTALACAO] Instalando/atualizando dependencias do backend - requirements.txt...
    python -m pip install --upgrade pip --quiet
    pip install -r requirements.txt
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao instalar dependencias do backend.
        pause
        exit /b 1
    )
    echo [OK] Dependencias do backend instaladas com sucesso.
) else (
    echo [OK] Dependencias do backend estao prontas.
)

REM -----------------------------------------------------------------
REM 4. DEPENDENCIAS FRONTEND E BUILD (DIST)
REM -----------------------------------------------------------------
echo.
echo [4/5] Verificando dependencias e build do frontend...

if not exist "frontend\node_modules" (
    echo [INSTALACAO] Instalando modulos do frontend - npm install...
    cd /d "%~dp0frontend"
    call npm install
    if !errorlevel! neq 0 (
        echo [ERRO] Falha no npm install do frontend.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK] Modulos do frontend instalados com sucesso.
) else (
    echo [OK] Modulos do frontend - node_modules ja estao instalados.
)

if not exist "frontend\dist\index.html" (
    echo [BUILD] Compilando frontend para producao - npm run build...
    cd /d "%~dp0frontend"
    call npm run build
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao compilar frontend - npm run build.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo [OK] Frontend compilado em frontend\dist com sucesso.
) else (
    echo [OK] Build do frontend - dist ja existe e esta pronto.
)

REM -----------------------------------------------------------------
REM 5. INICIALIZACAO DO SERVIDOR PROJYN
REM -----------------------------------------------------------------
echo.
echo ================================================================
echo  PROJYN PLAYOUT PRONTO PARA USO!
echo ================================================================
echo  * Servidor: http://localhost:8797
echo  * Para encerrar o sistema, feche esta janela ou pressione CTRL+C
echo ================================================================
echo.

REM Abre o navegador automaticamente apos 2 segundos em segundo plano
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8797'"

REM Inicia o backend FastAPI
python -m backend.main
