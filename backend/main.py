import os
import sys
import re
import time
import json
import ctypes
import shutil
import socket
import subprocess
import threading
import urllib.request
import urllib.parse
import urllib.error

# Set explicit AppUserModelID so Windows Taskbar uses Projyn's app icon instead of Python's generic icon
try:
  myappid = "projyn.playout.app.1.0"
  ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
  pass
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from sqlalchemy.orm import Session, selectinload

from backend.database import init_db, get_db, DBUser, DBCategory, DBVideo, DBSetting, DBPreset
from backend.auth import hash_password, verify_password, create_jwt_token, decode_jwt_token
from backend.youtube import (
  direct_stream_for, search_youtube, video_id_from_url,
  saved_stream_is_fresh, STREAM_REFRESH_SECONDS, parse_duration
)

# Caminhos globais
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_PATH = os.path.join(APP_DIR, "youtube-settings.json")
LIBRARY_PATH = os.path.join(APP_DIR, "youtube-library.json")
BROWSER_PROFILE_DIR = os.path.join(APP_DIR, "browser-profile")
FRONTEND_DIST_DIR = os.path.join(APP_DIR, "frontend", "dist")

# Configuração FastAPI
app = FastAPI(title="Projyn Playout & YouTube Library API")

app.add_middleware(
  GZipMiddleware,
  minimum_size=500
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

@app.middleware("http")
async def add_performance_headers(request: Request, call_next):
  response = await call_next(request)
  path = request.url.path
  if path.startswith("/assets/") or path.endswith((".js", ".css", ".ico", ".png", ".jpg", ".woff2")):
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
  return response

# Estado Global de Playout (Exibição)
DISPLAY_COMMANDS: List[Dict[str, Any]] = []
DISPLAY_COMMAND_SEQ = 0
ACTIVE_DISPLAY_SESSION: Optional[str] = None
DISPLAY_STATE: Dict[str, Any] = {"ready": False}

# Dependência de Autenticação
def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> DBUser:
  if not authorization or not authorization.startswith("Bearer "):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Token não fornecido ou inválido."
    )
  
  token = authorization.split(" ")[1]
  payload = decode_jwt_token(token)
  if not payload or "username" not in payload:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Token inválido ou expirado."
    )
  
  user = db.query(DBUser).filter(DBUser.username == payload["username"]).first()
  if not user:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Usuário não encontrado."
    )
  return user

# Auxiliares de permissões
def require_admin(user: DBUser = Depends(get_current_user)):
  if not user.is_admin:
    raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
  return user

def require_can_create_category(user: DBUser = Depends(get_current_user)):
  if not user.can_create_category and not user.is_admin:
    raise HTTPException(status_code=403, detail="Você não tem permissão para gerenciar categorias.")
  return user

def require_can_add_songs(user: DBUser = Depends(get_current_user)):
  if not user.can_add_songs and not user.is_admin:
    raise HTTPException(status_code=403, detail="Você não tem permissão para gerenciar músicas.")
  return user

def require_can_play_control(user: DBUser = Depends(get_current_user)):
  if not user.can_play_control and not user.is_admin:
    raise HTTPException(status_code=403, detail="Você não tem permissão para controlar a reprodução.")
  return user


# ==========================================
# LÓGICA DE PLAYOUT KIOSK (MIGRADA)
# ==========================================

def append_display_command(command_type: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
  global DISPLAY_COMMAND_SEQ, DISPLAY_COMMANDS
  DISPLAY_COMMAND_SEQ += 1
  command = {
    "seq": DISPLAY_COMMAND_SEQ,
    "type": command_type,
    "payload": payload or {},
    "sentAt": time.time(),
  }
  DISPLAY_COMMANDS.append(command)
  del DISPLAY_COMMANDS[:-100] # Limite de histórico
  return command

def find_browser_executable() -> str | None:
  candidates = [
    os.environ.get("YOUTUBE_DISPLAY_BROWSER"),
    shutil.which("msedge"),
    shutil.which("chrome"),
    shutil.which("brave"),
    shutil.which("firefox"),
    shutil.which("opera"),
    shutil.which("vivaldi"),
    # Edge
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Microsoft", "Edge", "Application", "msedge.exe")),
    str(os.path.join(os.environ.get("ProgramFiles", ""), "Microsoft", "Edge", "Application", "msedge.exe")),
    str(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "Application", "msedge.exe")),
    # Chrome
    str(os.path.join(os.environ.get("ProgramFiles", ""), "Google", "Chrome", "Application", "chrome.exe")),
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Google", "Chrome", "Application", "chrome.exe")),
    str(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe")),
    # Brave
    str(os.path.join(os.environ.get("ProgramFiles", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe")),
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe")),
    str(os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe")),
    # Firefox
    str(os.path.join(os.environ.get("ProgramFiles", ""), "Mozilla Firefox", "firefox.exe")),
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Mozilla Firefox", "firefox.exe")),
    # Opera
    str(os.path.join(os.environ.get("ProgramFiles", ""), "Opera", "launcher.exe")),
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Opera", "launcher.exe")),
    str(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Opera", "launcher.exe")),
    # Vivaldi
    str(os.path.join(os.environ.get("ProgramFiles", ""), "Vivaldi", "Application", "vivaldi.exe")),
    str(os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Vivaldi", "Application", "vivaldi.exe")),
    str(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "Application", "vivaldi.exe")),
  ]
  for candidate in candidates:
    if candidate and os.path.exists(candidate):
      return candidate
  return None

def get_process_name(pid: int) -> str:
  if os.name != "nt":
    return ""
  try:
    import ctypes
    from ctypes import wintypes
    PROCESS_QUERY_INFORMATION = 0x0400
    PROCESS_VM_READ = 0x0010
    
    kernel32 = ctypes.windll.kernel32
    h_process = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h_process:
      return ""
      
    buf = ctypes.create_unicode_buffer(260)
    size = wintypes.DWORD(260)
    kernel32.QueryFullProcessImageNameW(h_process, 0, buf, ctypes.byref(size))
    kernel32.CloseHandle(h_process)
    return os.path.basename(buf.value).lower()
  except Exception:
    return ""

def keep_display_windows_topmost(pid: int = 0, attempts: int = 24, delay: float = 0.25) -> None:
  if os.name != "nt":
    return

  def worker() -> None:
    try:
      import ctypes
      from ctypes import wintypes

      user32 = ctypes.windll.user32
      enum_windows = user32.EnumWindows
      enum_windows_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
      get_window_thread_process_id = user32.GetWindowThreadProcessId
      get_window_text_length = user32.GetWindowTextLengthW
      get_window_text = user32.GetWindowTextW
      is_window_visible = user32.IsWindowVisible
      set_window_pos = user32.SetWindowPos
      bring_window_to_top = user32.BringWindowToTop
      set_foreground_window = user32.SetForegroundWindow
      get_window_thread_process_id.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
      get_window_thread_process_id.restype = wintypes.DWORD
      get_window_text_length.argtypes = [wintypes.HWND]
      get_window_text_length.restype = ctypes.c_int
      get_window_text.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
      get_window_text.restype = ctypes.c_int
      is_window_visible.argtypes = [wintypes.HWND]
      is_window_visible.restype = wintypes.BOOL
      set_window_pos.argtypes = [
        wintypes.HWND,
        wintypes.HWND,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint,
      ]
      set_window_pos.restype = wintypes.BOOL
      bring_window_to_top.argtypes = [wintypes.HWND]
      bring_window_to_top.restype = wintypes.BOOL
      set_foreground_window.argtypes = [wintypes.HWND]
      set_foreground_window.restype = wintypes.BOOL
      get_window_long = user32.GetWindowLongW
      set_window_long = user32.SetWindowLongW
      get_window_long.argtypes = [wintypes.HWND, ctypes.c_int]
      get_window_long.restype = ctypes.c_long
      set_window_long.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_long]
      set_window_long.restype = ctypes.c_long

      load_image = user32.LoadImageW
      load_image.argtypes = [
        wintypes.HINSTANCE,
        wintypes.LPCWSTR,
        ctypes.c_uint,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint
      ]
      load_image.restype = wintypes.HANDLE

      send_message = user32.SendMessageW
      send_message.argtypes = [
        wintypes.HWND,
        ctypes.c_uint,
        wintypes.WPARAM,
        wintypes.LPARAM
      ]
      send_message.restype = ctypes.c_long

      hwnd_topmost = ctypes.c_void_p(-1)
      swp_nosize = 0x0001
      swp_nomove = 0x0002
      swp_showwindow = 0x0040

      for _ in range(attempts):
        found = False

        def callback(hwnd: Any, _lparam: Any) -> bool:
          nonlocal found
          if not is_window_visible(hwnd):
            return True

          window_pid = wintypes.DWORD()
          get_window_thread_process_id(hwnd, ctypes.byref(window_pid))
          if not window_pid.value:
            return True

          # Só processa se a janela for do processo Python (nosso display nativo)
          proc_name = get_process_name(int(window_pid.value))
          if "python" not in proc_name:
            return True

          length = get_window_text_length(hwnd)
          title_buffer = ctypes.create_unicode_buffer(length + 1)
          get_window_text(hwnd, title_buffer, length + 1)
          title = title_buffer.value

          is_launched_process = bool(pid) and window_pid.value == pid
          is_display_window = "Projyn Playout" in title or "/display" in title or title.startswith("Tela YouTube")

          if is_launched_process or is_display_window:
            found = True
            
            # Apenas altera estilos de janela para processos de navegador (se houver),
            # para o Python (pywebview) a gente pula pois ele já gerencia isso nativamente
            proc_name = get_process_name(window_pid.value)
            if "python" not in proc_name:
              try:
                GWL_EXSTYLE = -20
                WS_EX_TOOLWINDOW = 0x00000080
                WS_EX_APPWINDOW = 0x00040000
                style = get_window_long(hwnd, GWL_EXSTYLE)
                new_style = (style | WS_EX_APPWINDOW) & ~WS_EX_TOOLWINDOW
                if style != new_style:
                  set_window_long(hwnd, GWL_EXSTYLE, new_style)
              except Exception:
                pass

            # Define o logotipo customizado na barra de títulos da janela e na barra de tarefas
            try:
              ico_file = os.path.join(APP_DIR, "logo-projyn-icon-clara.ico")
              if os.path.exists(ico_file):
                IMAGE_ICON = 1
                LR_LOADFROMFILE = 0x0010
                WM_SETICON = 0x0080
                ICON_SMALL = 0
                ICON_BIG = 1
                
                hicon_sm = load_image(None, ico_file, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
                hicon_lg = load_image(None, ico_file, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
                
                if hicon_sm:
                  send_message(hwnd, WM_SETICON, ICON_SMALL, hicon_sm)
                if hicon_lg:
                  send_message(hwnd, WM_SETICON, ICON_BIG, hicon_lg)
            except Exception as e:
              print(f"[ICON] Erro ao definir icone na janela do display: {e}")
              
            swp_framechanged = 0x0020
            set_window_pos(
              hwnd,
              hwnd_topmost,
              0,
              0,
              0,
              0,
              swp_nomove | swp_nosize | swp_showwindow | swp_framechanged,
            )
            bring_window_to_top(hwnd)
            set_foreground_window(hwnd)
          return True

        enum_windows(enum_windows_proc(callback), 0)
        if found:
          return
        time.sleep(delay)
    except Exception:
      return

  threading.Thread(target=worker, daemon=True).start()

def _close_display_windows_impl() -> None:
  """Core logic to find and close display windows. Runs in the calling thread."""
  try:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    enum_windows = user32.EnumWindows
    enum_windows_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    get_window_thread_process_id = user32.GetWindowThreadProcessId
    get_window_text_length = user32.GetWindowTextLengthW
    get_window_text = user32.GetWindowTextW
    is_window_visible = user32.IsWindowVisible
    post_message = user32.PostMessageW
    get_window_thread_process_id.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    get_window_thread_process_id.restype = wintypes.DWORD
    get_window_text_length.argtypes = [wintypes.HWND]
    get_window_text_length.restype = ctypes.c_int
    get_window_text.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    get_window_text.restype = ctypes.c_int
    is_window_visible.argtypes = [wintypes.HWND]
    is_window_visible.restype = wintypes.BOOL
    post_message.argtypes = [wintypes.HWND, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM]
    post_message.restype = wintypes.BOOL
    wm_close = 0x0010
    pids: set[int] = set()

    def collect_and_close() -> bool:
      found = False

      def callback(hwnd: Any, _lparam: Any) -> bool:
        nonlocal found
        if not is_window_visible(hwnd):
          return True
        length = get_window_text_length(hwnd)
        title_buffer = ctypes.create_unicode_buffer(length + 1)
        get_window_text(hwnd, title_buffer, length + 1)
        title = title_buffer.value
        if title.startswith("Tela YouTube") or "/display" in title or "Projyn Playout" in title:
          window_pid = wintypes.DWORD()
          get_window_thread_process_id(hwnd, ctypes.byref(window_pid))
          if window_pid.value:
            proc_name = get_process_name(int(window_pid.value))
            # Apenas fecha janelas do Python (nosso display nativo)
            if "python" in proc_name:
              found = True
              pids.add(int(window_pid.value))
              post_message(hwnd, wm_close, 0, 0)
        return True

      enum_windows(enum_windows_proc(callback), 0)
      return found

    if not collect_and_close():
      return
    time.sleep(1)
    if collect_and_close():
      for pid in pids:
        subprocess.run(
          ["taskkill", "/PID", str(pid), "/T", "/F"],
          stdout=subprocess.DEVNULL,
          stderr=subprocess.DEVNULL,
          check=False,
        )
      time.sleep(0.5)
  except Exception:
    return

def close_display_windows_sync() -> None:
  """Close display windows synchronously (blocks until done)."""
  if os.name != "nt":
    return
  _close_display_windows_impl()

def close_display_windows() -> None:
  """Close display windows asynchronously in a background thread."""
  if os.name != "nt":
    return
  threading.Thread(target=_close_display_windows_impl, daemon=True).start()

def get_primary_ipv4() -> str:
  try:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
      sock.connect(("8.8.8.8", 80))
      return sock.getsockname()[0]
  except OSError:
    return "127.0.0.1"


# ==========================================
# ROTAS DA API REST
# ==========================================

# 1. Autenticação

@app.post("/api/auth/login")
def login(payload: Dict[str, str], db: Session = Depends(get_db)):
  username = payload.get("username", "").strip()
  password = payload.get("password", "")
  
  if not username or not password:
    raise HTTPException(status_code=400, detail="Por favor, insira usuário e senha.")
  
  db_user = db.query(DBUser).filter(DBUser.username == username).first()
  if not db_user or not verify_password(password, db_user.password_hash):
    raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
  
  token = create_jwt_token({"username": db_user.username, "is_admin": db_user.is_admin})
  return {
    "token": token,
    "user": {
      "id": db_user.id,
      "username": db_user.username,
      "is_admin": db_user.is_admin,
      "can_create_category": db_user.can_create_category,
      "can_add_songs": db_user.can_add_songs,
      "can_play_control": db_user.can_play_control,
      "see_all_categories": db_user.see_all_categories,
      "allowed_categories": db_user.allowed_categories
    }
  }

@app.post("/api/auth/register", dependencies=[Depends(require_admin)])
def register(payload: Dict[str, Any], db: Session = Depends(get_db)):
  username = str(payload.get("username", "")).strip()
  password = str(payload.get("password", ""))
  
  if not username or not password:
    raise HTTPException(status_code=400, detail="Usuário e senha são obrigatórios.")
  
  exists = db.query(DBUser).filter(DBUser.username == username).first()
  if exists:
    raise HTTPException(status_code=400, detail="Este nome de usuário já está cadastrado.")
  
  new_user = DBUser(
    username=username,
    password_hash=hash_password(password),
    is_admin=bool(payload.get("is_admin", False)),
    can_create_category=bool(payload.get("can_create_category", True)),
    can_add_songs=bool(payload.get("can_add_songs", True)),
    can_play_control=bool(payload.get("can_play_control", True)),
    see_all_categories=bool(payload.get("see_all_categories", True))
  )
  new_user.allowed_categories = payload.get("allowed_categories", [])
  db.add(new_user)
  db.commit()
  db.refresh(new_user)
  
  return {"ok": True, "message": "Usuário registrado com sucesso."}

# 2. Gerenciamento de Usuários (Admin apenas)

@app.get("/api/users", dependencies=[Depends(require_admin)])
def get_users(db: Session = Depends(get_db)):
  users = db.query(DBUser).all()
  return [{
    "id": u.id,
    "username": u.username,
    "is_admin": u.is_admin,
    "can_create_category": u.can_create_category,
    "can_add_songs": u.can_add_songs,
    "can_play_control": u.can_play_control,
    "see_all_categories": u.see_all_categories,
    "allowed_categories": u.allowed_categories
  } for u in users]

@app.put("/api/users/{user_id}", dependencies=[Depends(require_admin)])
def update_user(user_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)):
  db_user = db.query(DBUser).filter(DBUser.id == user_id).first()
  if not db_user:
    raise HTTPException(status_code=404, detail="Usuário não encontrado.")
  
  if "is_admin" in payload:
    db_user.is_admin = bool(payload["is_admin"])
  if "can_create_category" in payload:
    db_user.can_create_category = bool(payload["can_create_category"])
  if "can_add_songs" in payload:
    db_user.can_add_songs = bool(payload["can_add_songs"])
  if "can_play_control" in payload:
    db_user.can_play_control = bool(payload["can_play_control"])
  if "see_all_categories" in payload:
    db_user.see_all_categories = bool(payload["see_all_categories"])
  if "allowed_categories" in payload:
    db_user.allowed_categories = payload["allowed_categories"]
  
  db.commit()
  return {"ok": True}

@app.delete("/api/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, db: Session = Depends(get_db)):
  db_user = db.query(DBUser).filter(DBUser.id == user_id).first()
  if not db_user:
    raise HTTPException(status_code=404, detail="Usuário não encontrado.")
  
  db.delete(db_user)
  db.commit()
  return {"ok": True}

# 3. Configurações e Presets

@app.get("/api/monitors", dependencies=[Depends(get_current_user)])
def get_monitors():
  if os.name != 'nt':
    return [{"label": "Monitor Servidor (Fallback)", "width": 1920, "height": 1080, "left": 0, "top": 0, "isPrimary": True}]
  
  monitors = []
  
  class RECT(ctypes.Structure):
    _fields_ = [
      ("left", ctypes.c_long),
      ("top", ctypes.c_long),
      ("right", ctypes.c_long),
      ("bottom", ctypes.c_long)
    ]
      
  class MONITORINFOEXW(ctypes.Structure):
    _fields_ = [
      ("cbSize", ctypes.c_ulong),
      ("rcMonitor", ctypes.c_long * 4),
      ("rcWork", ctypes.c_long * 4),
      ("dwFlags", ctypes.c_ulong),
      ("szDevice", ctypes.c_wchar * 32)
    ]
      
  def callback(hmonitor, hdc, lprect, lparam):
    rect = lprect.contents
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    
    info = MONITORINFOEXW()
    info.cbSize = ctypes.sizeof(MONITORINFOEXW)
    
    if ctypes.windll.user32.GetMonitorInfoW(hmonitor, ctypes.byref(info)):
      name = info.szDevice
      is_primary = bool(info.dwFlags & 1)
      label = f"Monitor {len(monitors) + 1} ({name})"
      if is_primary:
        label += " [Principal]"
          
      monitors.append({
        "label": label,
        "width": width,
        "height": height,
        "left": rect.left,
        "top": rect.top,
        "isPrimary": is_primary
      })
    return True

  MonitorEnumProcReal = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(RECT), ctypes.c_void_p)
  callback_func = MonitorEnumProcReal(callback)
  ctypes.windll.user32.EnumDisplayMonitors(None, None, callback_func, 0)
  return monitors

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
  # Carrega configurações globais da tabela settings
  display_setting = db.query(DBSetting).filter(DBSetting.key == "display").first()
  player_setting = db.query(DBSetting).filter(DBSetting.key == "player").first()
  
  display = display_setting.value if display_setting else {
    "name": "Tela principal", "left": 0, "top": 0, "width": 1280, "height": 720, "fullscreen": True
  }
  player = player_setting.value if player_setting else {
    "autoplay": True, "muted": False, "volume": 80, "loop": False, "showControls": False
  }
  
  # Presets
  presets = db.query(DBPreset).all()
  presets_data = [{
    "id": p.id,
    "name": p.name,
    "display": p.display,
    "player": p.player
  } for p in presets]
  
  return {
    "display": display,
    "player": player,
    "presets": presets_data
  }

@app.post("/api/settings", dependencies=[Depends(require_admin)])
def save_settings(payload: Dict[str, Any], db: Session = Depends(get_db)):
  display_val = payload.get("display")
  player_val = payload.get("player")
  
  if display_val:
    display_setting = db.query(DBSetting).filter(DBSetting.key == "display").first()
    if not display_setting:
      display_setting = DBSetting(key="display")
      db.add(display_setting)
    display_setting.value = display_val
    
  if player_val:
    player_setting = db.query(DBSetting).filter(DBSetting.key == "player").first()
    if not player_setting:
      player_setting = DBSetting(key="player")
      db.add(player_setting)
    player_setting.value = player_val
    
  db.commit()
  
  # Notifica a tela de exibição ativa sobre a mudança de configurações
  full_settings = get_settings(db)
  append_display_command("settings", full_settings)

  # Se ativou auto-minimizar e já tem vídeo tocando, minimiza a tela na hora.
  # Se desativou, restaura a tela cheia imediatamente.
  if player_val is not None:
    if player_val.get("autoMinimizeOnPlay") and DISPLAY_STATE.get("playing"):
      minimize_display()
    elif player_val.get("autoMinimizeOnPlay") is False:
      restore_display()
  
  return full_settings

@app.post("/api/presets", dependencies=[Depends(require_admin)])
def add_preset(payload: Dict[str, Any], db: Session = Depends(get_db)):
  preset_id = payload.get("id") or str(time.time())
  preset = db.query(DBPreset).filter(DBPreset.id == preset_id).first()
  
  if not preset:
    preset = DBPreset(id=preset_id)
    db.add(preset)
    
  preset.name = payload.get("name", "Novo Preset")[:80]
  preset.display = payload.get("display", {})
  preset.player = payload.get("player", {})
  
  db.commit()
  return get_settings(db)

@app.delete("/api/presets/{preset_id}", dependencies=[Depends(require_admin)])
def delete_preset(preset_id: str, db: Session = Depends(get_db)):
  preset = db.query(DBPreset).filter(DBPreset.id == preset_id).first()
  if not preset:
    raise HTTPException(status_code=404, detail="Preset não encontrado.")
  db.delete(preset)
  db.commit()
  return get_settings(db)

# 4. Biblioteca (Categorias e Músicas)

@app.get("/api/library")
def get_library(user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
  # Carrega categorias
  query = db.query(DBCategory)
  
  # Regra de permissão: "poder ver todas as categorias ou só alguma"
  if not user.see_all_categories and not user.is_admin:
    query = query.filter(DBCategory.id.in_(user.allowed_categories))
    
  categories = query.options(selectinload(DBCategory.videos)).all()
  
  # Monta biblioteca formatada
  groups_list = []
  for cat in categories:
    videos = [{
      "id": v.id,
      "title": v.title,
      "channel": v.channel,
      "duration": parse_duration(v.duration),
      "thumbnail": f"https://i.ytimg.com/vi/{v.id}/hqdefault.jpg" if (not v.thumbnail or "?" in str(v.thumbnail)) else v.thumbnail,
      "url": v.url,
      "streamUrl": v.stream_url,
      "streamExt": v.stream_ext,
      "streamProtocol": v.stream_protocol,
      "streamHeight": v.stream_height,
      "streamFormatId": v.stream_format_id,
      "streamQuality": v.stream_quality,
      "preparedAt": v.prepared_at,
      "savedAt": v.saved_at,
      "categoryId": v.category_id
    } for v in cat.videos]
    
    groups_list.append({
      "id": cat.id,
      "title": cat.title,
      "color": cat.color,
      "createdAt": cat.created_at,
      "updatedAt": cat.updated_at,
      "videos": videos
    })
    
  # Determina grupo ativo padrão
  active_group_id = ""
  if groups_list:
    active_group_id = groups_list[0]["id"]
    
  return {
    "activeGroupId": active_group_id,
    "groups": groups_list
  }

@app.post("/api/library/groups", dependencies=[Depends(require_can_create_category)])
def create_group(payload: Dict[str, Any], user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
  title = payload.get("title", "Novo Grupo").strip()
  color = payload.get("color", "#e73c55").strip()
  
  # Slugify title
  base_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", title.lower()).strip("-")
  group_id = base_id or str(time.time())
  
  # Evita duplicado
  exists = db.query(DBCategory).filter(DBCategory.id == group_id).first()
  if exists:
    group_id = f"{group_id}-{int(time.time()) % 1000}"
    
  new_cat = DBCategory(
    id=group_id,
    title=title,
    color=color,
    created_at=time.time(),
    updated_at=time.time()
  )
  db.add(new_cat)
  db.commit()
  
  return get_library(user, db)

@app.delete("/api/library/groups/{group_id}", dependencies=[Depends(require_can_create_category)])
def delete_group(group_id: str, user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
  cat = db.query(DBCategory).filter(DBCategory.id == group_id).first()
  if not cat:
    raise HTTPException(status_code=404, detail="Categoria não encontrada.")
  
  db.delete(cat)
  db.commit()
  return get_library(user, db)

@app.post("/api/library/groups/{group_id}/videos", dependencies=[Depends(require_can_add_songs)])
def add_video(group_id: str, payload: Dict[str, Any], user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
  cat = db.query(DBCategory).filter(DBCategory.id == group_id).first()
  if not cat:
    raise HTTPException(status_code=404, detail="Categoria não encontrada.")
  
  url = payload.get("url", "").strip()
  video_id = payload.get("id", "").strip()
  
  if not video_id and url:
    video_id = video_id_from_url(url)
  
  if not video_id:
    raise HTTPException(status_code=400, detail="ID ou URL de vídeo do YouTube inválido.")
    
  # Extrai stream direto via yt-dlp
  try:
    prepared = direct_stream_for(video_id, allow_hls=True)
  except Exception as exc:
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    
  # Limpa duplicado no mesmo grupo
  existing = db.query(DBVideo).filter(DBVideo.id == video_id, DBVideo.category_id == group_id).first()
  if existing:
    db.delete(existing)
    
  # Validação e resolução de título real
  final_title = (payload.get("title") or "").strip()
  if not final_title or final_title.lower() in ("video do youtube", "vídeo do youtube", "sem título"):
    final_title = prepared["title"]
    
  final_channel = (payload.get("channel") or "").strip() or prepared.get("channel", "")

  new_video = DBVideo(
    id=video_id,
    title=final_title,
    channel=final_channel,
    duration=parse_duration(prepared.get("duration") or payload.get("duration") or "0"),
    thumbnail=prepared.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
    url=url or f"https://www.youtube.com/watch?v={video_id}",
    stream_url=prepared["streamUrl"],
    stream_ext=prepared.get("streamExt", ""),
    stream_protocol=prepared.get("streamProtocol", ""),
    stream_height=prepared.get("streamHeight", 0),
    stream_format_id=prepared.get("streamFormatId", ""),
    stream_quality=prepared.get("streamQuality", ""),
    prepared_at=time.time(),
    saved_at=time.time(),
    category_id=group_id
  )
  db.add(new_video)
  db.commit()
  db.refresh(new_video)
  
  library = get_library(user, db)
  
  return {
    "library": library,
    "video": {
      "id": new_video.id,
      "title": new_video.title,
      "thumbnail": new_video.thumbnail,
      "duration": new_video.duration
    }
  }

AUTO_REFRESH_INTERVAL_SECONDS = 2 * 60 * 60  # Ciclo de 2 horas (7200 segundos)
NEXT_AUTO_REFRESH_AT = time.time() + AUTO_REFRESH_INTERVAL_SECONDS

REFRESH_ALL_PROGRESS: Dict[str, Any] = {
  "in_progress": False,
  "is_auto": False,
  "current": 0,
  "total": 0,
  "percent": 0,
  "current_title": "",
  "current_id": "",
  "updated": 0,
  "errors": 0,
  "done": False,
  "error_message": None,
  "started_at": 0,
  "finished_at": 0,
  "next_auto_refresh_at": NEXT_AUTO_REFRESH_AT
}
REFRESH_LOCK = threading.Lock()

def refresh_all_worker(is_auto: bool = False):
  global REFRESH_ALL_PROGRESS, NEXT_AUTO_REFRESH_AT
  try:
    db_worker = next(get_db())
    try:
      videos = db_worker.query(DBVideo).all()
      unique_ids = list({v.id for v in videos})
      total = len(unique_ids)
      
      with REFRESH_LOCK:
        REFRESH_ALL_PROGRESS["total"] = total
        REFRESH_ALL_PROGRESS["current"] = 0
        REFRESH_ALL_PROGRESS["percent"] = 0
        REFRESH_ALL_PROGRESS["updated"] = 0
        REFRESH_ALL_PROGRESS["errors"] = 0
        REFRESH_ALL_PROGRESS["done"] = False
        REFRESH_ALL_PROGRESS["is_auto"] = is_auto
        REFRESH_ALL_PROGRESS["in_progress"] = True
        REFRESH_ALL_PROGRESS["started_at"] = time.time()
        REFRESH_ALL_PROGRESS["error_message"] = None

      for idx, video_id in enumerate(unique_ids):
        first_record = db_worker.query(DBVideo).filter(DBVideo.id == video_id).first()
        current_title = first_record.title if first_record else f"Vídeo {video_id}"
        
        with REFRESH_LOCK:
          REFRESH_ALL_PROGRESS["current"] = idx + 1
          REFRESH_ALL_PROGRESS["percent"] = int(((idx + 1) / max(1, total)) * 100)
          REFRESH_ALL_PROGRESS["current_title"] = current_title
          REFRESH_ALL_PROGRESS["current_id"] = video_id

        try:
          prepared = direct_stream_for(video_id, allow_hls=True)
          now_ts = time.time()
          
          v_records = db_worker.query(DBVideo).filter(DBVideo.id == video_id).all()
          for v in v_records:
            v.stream_url = prepared["streamUrl"]
            v.stream_ext = prepared.get("streamExt", "")
            v.stream_protocol = prepared.get("streamProtocol", "")
            v.stream_height = prepared.get("streamHeight", 0)
            v.stream_format_id = prepared.get("streamFormatId", "")
            v.stream_quality = prepared.get("streamQuality", "")
            v.prepared_at = now_ts
            v.thumbnail = prepared.get("thumbnail") or v.thumbnail
            
            if not v.title or v.title.strip().lower() in ("video do youtube", "vídeo do youtube", "sem título", f"vídeo {v.id}".lower()):
              if prepared.get("title"):
                v.title = prepared["title"]
                
            if not v.channel and prepared.get("channel"):
              v.channel = prepared["channel"]
                
            if str(v.duration) in ("0", "0:00", "") and prepared.get("duration"):
              v.duration = parse_duration(prepared.get("duration"))
              
          db_worker.commit()
          with REFRESH_LOCK:
            REFRESH_ALL_PROGRESS["updated"] += 1
        except Exception as err:
          db_worker.rollback()
          with REFRESH_LOCK:
            REFRESH_ALL_PROGRESS["errors"] += 1
          print(f"[REFRESH-ALL] Erro ao atualizar {video_id}: {err}")
    finally:
      db_worker.close()
  except Exception as e:
    with REFRESH_LOCK:
      REFRESH_ALL_PROGRESS["error_message"] = str(e)
  finally:
    NEXT_AUTO_REFRESH_AT = time.time() + AUTO_REFRESH_INTERVAL_SECONDS
    with REFRESH_LOCK:
      REFRESH_ALL_PROGRESS["in_progress"] = False
      REFRESH_ALL_PROGRESS["done"] = True
      REFRESH_ALL_PROGRESS["finished_at"] = time.time()
      REFRESH_ALL_PROGRESS["next_auto_refresh_at"] = NEXT_AUTO_REFRESH_AT

@app.post("/api/library/refresh-all")
@app.get("/api/library/refresh-all")
def start_refresh_all_videos(user: DBUser = Depends(get_current_user)):
  """Inicia a renovação manual de todos os links da biblioteca em segundo plano com acompanhamento de progresso."""
  global REFRESH_ALL_PROGRESS
  with REFRESH_LOCK:
    if not REFRESH_ALL_PROGRESS.get("in_progress"):
      REFRESH_ALL_PROGRESS["in_progress"] = True
      REFRESH_ALL_PROGRESS["done"] = False
      REFRESH_ALL_PROGRESS["is_auto"] = False
      REFRESH_ALL_PROGRESS["error_message"] = None
      t = threading.Thread(target=refresh_all_worker, kwargs={"is_auto": False}, daemon=True)
      t.start()
      
  return {"ok": True, "started": True, "progress": dict(REFRESH_ALL_PROGRESS)}

@app.get("/api/library/refresh-progress")
def get_refresh_progress(user: DBUser = Depends(get_current_user)):
  """Retorna o progresso em tempo real da atualização de links e o temporizador para a próxima auto-renovação."""
  global NEXT_AUTO_REFRESH_AT
  with REFRESH_LOCK:
    prog = dict(REFRESH_ALL_PROGRESS)
    prog["next_auto_refresh_at"] = NEXT_AUTO_REFRESH_AT
    prog["seconds_remaining"] = max(0, int(NEXT_AUTO_REFRESH_AT - time.time()))
    return {"ok": True, "progress": prog}

@app.delete("/api/library/groups/{group_id}/videos/{video_id}", dependencies=[Depends(require_can_add_songs)])
def delete_video(group_id: str, video_id: str, user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
  video = db.query(DBVideo).filter(DBVideo.id == video_id, DBVideo.category_id == group_id).first()
  if not video:
    raise HTTPException(status_code=404, detail="Vídeo não encontrado nesta categoria.")
  db.delete(video)
  db.commit()
  return get_library(user, db)

@app.get("/api/library/videos/{video_id}/refresh")
@app.post("/api/library/videos/{video_id}/refresh")
def refresh_video(video_id: str, ifNeeded: Optional[int] = None, noHls: Optional[int] = None, db: Session = Depends(get_db)):
  # Refresh para recarregar stream URL expirada
  videos = db.query(DBVideo).filter(DBVideo.id == video_id).all()
    
  # Se ifNeeded for 1/True e a URL ainda for válida/fresca, pula a chamada lenta do yt-dlp!
  if videos:
    from backend.youtube import saved_stream_is_fresh
    first = videos[0]
    if ifNeeded and first.stream_url and saved_stream_is_fresh(
        first.prepared_at, first.stream_url, first.stream_height, first.stream_quality
    ):
      return {
        "groupId": first.category_id,
        "video": {
          "id": first.id,
          "title": first.title,
          "streamUrl": first.stream_url,
          "streamExt": first.stream_ext,
          "streamProtocol": first.stream_protocol,
          "streamHeight": first.stream_height,
          "streamQuality": first.stream_quality,
          "preparedAt": first.prepared_at,
          "prepared_at": first.prepared_at,
        }
      }
    
  try:
    allow_hls = True
    prepared = direct_stream_for(video_id, allow_hls=allow_hls)
  except Exception as exc:
    raise HTTPException(status_code=502, detail=str(exc))
    
  now_ts = time.time()
  group_id = ""
  title = prepared.get("title", "Video do YouTube")

  if videos:
    group_id = videos[0].category_id
    title = videos[0].title or title
    try:
      db.query(DBVideo).filter(DBVideo.id == video_id).update({
        "stream_url": prepared["streamUrl"],
        "stream_ext": prepared.get("streamExt", ""),
        "stream_protocol": prepared.get("streamProtocol", ""),
        "stream_height": prepared.get("streamHeight", 0),
        "stream_format_id": prepared.get("streamFormatId", ""),
        "stream_quality": prepared.get("streamQuality", ""),
        "prepared_at": now_ts,
      }, synchronize_session=False)
      db.commit()
    except Exception as e:
      db.rollback()
      print(f"[DB] Aviso ao atualizar stream no banco: {e}")
  
  # Retorna o vídeo atualizado
  return {
    "groupId": group_id,
    "video": {
      "id": video_id,
      "title": title,
      "streamUrl": prepared["streamUrl"],
      "streamExt": prepared.get("streamExt", ""),
      "streamProtocol": prepared.get("streamProtocol", ""),
      "streamHeight": prepared.get("streamHeight", 0),
      "streamQuality": prepared.get("streamQuality", ""),
      "preparedAt": now_ts,
      "prepared_at": now_ts,
    }
  }

@app.get("/api/library/groups/{group_id}/videos/{video_id}/refresh")
@app.post("/api/library/groups/{group_id}/videos/{video_id}/refresh")
def refresh_video_group(group_id: str, video_id: str, ifNeeded: Optional[int] = None, noHls: Optional[int] = None, db: Session = Depends(get_db)):
  return refresh_video(video_id, ifNeeded, noHls, db)

# 5. YouTube Busca e Extração

@app.get("/api/search", dependencies=[Depends(require_can_add_songs)])
def search(q: str):
  query = q.strip()
  if not query:
    return {"results": [], "provider": "empty"}
  try:
    results, provider = search_youtube(query)
    return {"results": results, "provider": provider}
  except Exception as exc:
    raise HTTPException(status_code=502, detail=str(exc))

@app.get("/api/stream")
def get_stream(id: str, noHls: bool = False):
  video_id = id.strip()
  allow_hls = not noHls
  try:
    return direct_stream_for(video_id, allow_hls=allow_hls)
  except Exception as exc:
    raise HTTPException(status_code=502, detail=str(exc))

@app.get("/api/hls-manifest")
def hls_manifest(url: str, request: Request):
  """Proxy para carregar manifest HLS .m3u8 contornando CORS e reescrevendo segmentos."""
  if not url:
    raise HTTPException(status_code=400, detail="URL obrigatoria")
  
  base_origin = str(request.base_url).rstrip('/')

  headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Accept": "*/*",
  }

  try:
    import requests as req_lib
    r = req_lib.get(url, headers=headers, timeout=20)
    if r.status_code != 200:
      raise HTTPException(status_code=r.status_code, detail=f"YouTube upstream manifest error: {r.status_code}")
    content = r.text
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=502, detail=f"Erro ao carregar manifest: {e}")

  rewritten_lines = []
  for line in content.splitlines():
    stripped = line.strip()
    if stripped.startswith("http://") or stripped.startswith("https://"):
      proxy_seg = f"{base_origin}/api/stream-proxy?url={urllib.parse.quote(stripped, safe='')}"
      rewritten_lines.append(proxy_seg)
    elif stripped.startswith("/"):
      parsed_target = urllib.parse.urlparse(url)
      abs_url = f"{parsed_target.scheme}://{parsed_target.netloc}{stripped}"
      proxy_seg = f"{base_origin}/api/stream-proxy?url={urllib.parse.quote(abs_url, safe='')}"
      rewritten_lines.append(proxy_seg)
    else:
      rewritten_lines.append(line)

  rewritten_body = "\n".join(rewritten_lines)
  return Response(
    content=rewritten_body,
    media_type="application/vnd.apple.mpegurl",
    headers={
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-cache",
    }
  )

@app.get("/api/stream-proxy")
def stream_proxy(url: str, request: Request):
  """Proxy de streaming em chunks com suporte total a Range e CORS."""
  if not url:
    raise HTTPException(status_code=400, detail="URL obrigatoria")
  
  headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Accept": "*/*",
  }
  
  range_header = request.headers.get("range")
  if range_header:
    headers["Range"] = range_header

  try:
    import requests as req_lib
    r = req_lib.get(url, headers=headers, stream=True, timeout=30)
  except Exception as exc:
    raise HTTPException(status_code=502, detail=f"Proxy error: {exc}")

  resp_headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Accept-Ranges": "bytes",
  }
  
  content_type = r.headers.get("Content-Type", "video/MP2T")
  resp_headers["Content-Type"] = content_type
  
  content_length = r.headers.get("Content-Length")
  if content_length:
    resp_headers["Content-Length"] = content_length

  content_range = r.headers.get("Content-Range")
  if content_range:
    resp_headers["Content-Range"] = content_range

  def iter_stream():
    try:
      for chunk in r.iter_content(chunk_size=128 * 1024):
        if chunk:
          yield chunk
    finally:
      r.close()

  return StreamingResponse(
    iter_stream(),
    status_code=r.status_code,
    headers=resp_headers,
    media_type=content_type,
  )

# 6. Playout Playout Commands e State (Comunicação)

@app.get("/api/display-command")
def get_display_commands(after: int = 0):
  commands = [cmd for cmd in DISPLAY_COMMANDS if cmd["seq"] > after]
  return {"commands": commands, "seq": DISPLAY_COMMAND_SEQ}

@app.post("/api/display-command")
def post_display_command(payload: Dict[str, Any], user: DBUser = Depends(get_current_user)):
  global DISPLAY_STATE, ACTIVE_DISPLAY_SESSION
  cmd_type = str(payload.get("type", "")).strip()
  cmd_data = payload.get("payload", {})
  
  # Validação de permissão: apenas usuários com can_play_control podem mandar comandos de playout
  if not user.can_play_control and not user.is_admin:
    raise HTTPException(status_code=403, detail="Sem permissão para controlar reprodução.")
    
  if cmd_type == "stop":
    close_display_windows()
    ACTIVE_DISPLAY_SESSION = None
    DISPLAY_STATE.update({
      "ready": False,
      "playing": False,
      "time": 0,
      "updatedAt": time.time()
    })

  elif cmd_type == "load":
    video_obj = cmd_data.get("video", {})
    video_id = video_obj.get("id")
    if video_id:
      video_obj["thumbnail"] = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
      try:
        from backend.youtube import saved_stream_is_fresh, direct_stream_for
        prepared_at = float(video_obj.get("preparedAt") or video_obj.get("prepared_at") or 0)
        stream_url = str(video_obj.get("streamUrl") or video_obj.get("stream_url") or "")
        height = int(video_obj.get("streamHeight") or video_obj.get("stream_height") or 0)
        quality = str(video_obj.get("streamQuality") or video_obj.get("stream_quality") or "")
        
        # Se não veio com stream_url ou prepared_at, busca do banco
        if not stream_url or not prepared_at:
          from backend.database import get_db, DBVideo
          db_s = next(get_db())
          try:
            db_vid = db_s.query(DBVideo).filter(DBVideo.id == video_id).first()
            if db_vid and db_vid.stream_url:
              prepared_at = db_vid.prepared_at or 0
              stream_url = db_vid.stream_url
              height = db_vid.stream_height or 0
              quality = db_vid.stream_quality or ""
              video_obj["streamUrl"] = stream_url
              video_obj["streamExt"] = db_vid.stream_ext
              video_obj["streamProtocol"] = db_vid.stream_protocol
              video_obj["streamHeight"] = height
              video_obj["streamQuality"] = quality
              video_obj["preparedAt"] = prepared_at
          finally:
            db_s.close()

        # Se ainda não tiver stream ou estiver expirada, renova
        if not stream_url or not saved_stream_is_fresh(prepared_at, stream_url, height, quality):
          fresh = direct_stream_for(video_id, allow_hls=True)
          now_ts = time.time()
          fresh["preparedAt"] = now_ts
          fresh["thumbnail"] = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
          video_obj.update(fresh)
          cmd_data["video"] = video_obj
          
          # Atualiza banco em background para acelerar próximos plays
          try:
            from backend.database import get_db, DBVideo
            db_s = next(get_db())
            try:
              db_s.query(DBVideo).filter(DBVideo.id == video_id).update({
                "stream_url": fresh["streamUrl"],
                "stream_ext": fresh.get("streamExt", ""),
                "stream_protocol": fresh.get("streamProtocol", ""),
                "stream_height": fresh.get("streamHeight", 0),
                "stream_format_id": fresh.get("streamFormatId", ""),
                "stream_quality": fresh.get("streamQuality", ""),
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "prepared_at": now_ts
              }, synchronize_session=False)
              db_s.commit()
            finally:
              db_s.close()
          except Exception:
            pass
        else:
          video_obj["preparedAt"] = prepared_at
          cmd_data["video"] = video_obj
      except Exception as e:
        print(f"[STREAM] Aviso na verificação de stream no load: {e}")
      
      # Atualiza o estado global de exibição imediatamente
      DISPLAY_STATE.update({
        "video": video_obj,
        "playing": True,
        "time": 0,
        "updatedAt": time.time()
      })
  
  command = append_display_command(cmd_type, cmd_data)
  return command

@app.get("/api/display-state")
def get_display_state():
  return DISPLAY_STATE

@app.post("/api/display-state")
def post_display_state(payload: Dict[str, Any]):
  global DISPLAY_STATE, ACTIVE_DISPLAY_SESSION
  session_id = payload.get("sessionId")
  now = time.time()
  
  if session_id:
    # Aceita se não houver sessão ativa, se for a mesma sessão, ou se a sessão ativa expirou (mais de 5 segundos sem contato)
    if (not ACTIVE_DISPLAY_SESSION 
        or ACTIVE_DISPLAY_SESSION == session_id 
        or (now - DISPLAY_STATE.get("updatedAt", 0)) > 5.0):
      ACTIVE_DISPLAY_SESSION = session_id
      DISPLAY_STATE = payload
      DISPLAY_STATE["updatedAt"] = now
  else:
    DISPLAY_STATE.update(payload)
    DISPLAY_STATE["updatedAt"] = now
    
  return DISPLAY_STATE

# 7. Controle Kiosk de Tela Principal (Abertura/Fechamento)

@app.post("/api/open-display")
def open_display(request: Request, force: bool = False, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user)):
  if not current_user.can_play_control and not current_user.is_admin:
    raise HTTPException(status_code=403, detail="Sem permissão para controlar reprodução.")
    
  global DISPLAY_STATE, ACTIVE_DISPLAY_SESSION
  now = time.time()
  
  # Obter base url do request de forma dinamica (garante a porta correta)
  base_url = str(request.base_url).rstrip('/')

  # Se a tela já estiver ativa e respondendo, não precisa fechar e abrir de novo!
  if not force and DISPLAY_STATE.get("ready") and (now - DISPLAY_STATE.get("updatedAt", 0)) < 4.0:
    keep_display_windows_topmost()
    return {"ok": True, "already_running": True, "url": f"{base_url}/display-native"}
  
  # Get token from header
  authorization = request.headers.get("Authorization")
  token = authorization.split(" ")[1] if authorization and " " in authorization else ""
  
  # Carrega configurações de monitor/display do banco
  display_setting = db.query(DBSetting).filter(DBSetting.key == "display").first()
  display = display_setting.value if display_setting else {
    "left": 0, "top": 0, "width": 1280, "height": 720, "fullscreen": True
  }
  
  # Caminho para o script Python da tela nativa
  display_script = os.path.join(APP_DIR, "backend", "display.py")
  py_exe = sys.executable
  pyw_exe = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
  if os.path.exists(pyw_exe):
    py_exe = pyw_exe
  args = [py_exe, "-u", display_script, base_url, token, json.dumps(display)]
  
  close_display_windows_sync()  # Fecha janelas antigas de forma síncrona antes de abrir nova
  
  log_path = os.path.join(APP_DIR, "display_output.log")
  try:
    log_file = open(log_path, "w", encoding="utf-8")
    process = subprocess.Popen(args, stdout=log_file, stderr=log_file)
  except Exception:
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  keep_display_windows_topmost(process.pid)
  
  ACTIVE_DISPLAY_SESSION = None
  DISPLAY_STATE["ready"] = False
  DISPLAY_STATE["updatedAt"] = time.time()
  
  # Envia configurações de inicialização
  full_settings = get_settings(db)
  append_display_command("settings", full_settings)
  
  return {"ok": True, "url": f"{base_url}/display-native"}

@app.post("/api/display-close", dependencies=[Depends(require_can_play_control)])
def close_display():
  global DISPLAY_STATE, ACTIVE_DISPLAY_SESSION
  close_display_windows()
  ACTIVE_DISPLAY_SESSION = None
  DISPLAY_STATE.update({
    "ready": False,
    "playing": False,
    "time": 0,
    "updatedAt": time.time()
  })
  append_display_command("reset", {})
  return {"ok": True}

@app.post("/api/display-minimize", dependencies=[Depends(require_can_play_control)])
def minimize_display():
  append_display_command("minimize", {})
  try:
    import win32gui
    import win32con
    hwnd = win32gui.FindWindow(None, "Projyn Playout")
    if hwnd:
      win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
  except Exception:
    pass
  return {"ok": True}

@app.post("/api/display-toggle-fullscreen", dependencies=[Depends(require_can_play_control)])
def toggle_fullscreen_display():
  append_display_command("toggle_fullscreen", {})
  return {"ok": True}

@app.post("/api/display-restore", dependencies=[Depends(require_can_play_control)])
def restore_display():
  append_display_command("restore", {})
  keep_display_windows_topmost()
  try:
    import win32gui
    import win32con
    hwnd = win32gui.FindWindow(None, "Projyn Playout")
    if hwnd:
      win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
      win32gui.ShowWindow(hwnd, win32con.SW_SHOWMAXIMIZED)
      win32gui.SetForegroundWindow(hwnd)
  except Exception:
    pass
  return {"ok": True}

@app.post("/api/display-topmost")
@app.get("/api/display-topmost")
@app.post("/api/topmost-display")
@app.get("/api/topmost-display")
def display_topmost(current_user: DBUser = Depends(get_current_user)):
  if not current_user.can_play_control and not current_user.is_admin:
    raise HTTPException(status_code=403, detail="Sem permissão para controlar reprodução.")
  keep_display_windows_topmost()
  try:
    import win32gui
    import win32con
    hwnd = win32gui.FindWindow(None, "Projyn Playout")
    if hwnd:
      win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
      win32gui.ShowWindow(hwnd, win32con.SW_SHOWMAXIMIZED)
      win32gui.SetForegroundWindow(hwnd)
      win32gui.SetWindowPos(
        hwnd, win32con.HWND_TOPMOST,
        0, 0, 0, 0,
        win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_SHOWWINDOW
      )
  except Exception:
    pass
  return {"ok": True}

@app.get("/hls.min.js")
def get_hls_script():
  candidates = [
    os.path.join(APP_DIR, "frontend", "public", "hls.min.js"),
    os.path.join(APP_DIR, "frontend", "dist", "hls.min.js"),
    os.path.join(APP_DIR, "frontend", "node_modules", "hls.js", "dist", "hls.min.js"),
    os.path.join(APP_DIR, "static", "hls.min.js"),
  ]
  for p in candidates:
    if os.path.exists(p):
      return FileResponse(p, media_type="application/javascript")
  from fastapi.responses import RedirectResponse
  return RedirectResponse("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js")

@app.get("/logo-projyn-icon-clara.png")
def get_logo_icon_png():
  p = os.path.join(APP_DIR, "logo-projyn-icon-clara.png")
  if os.path.exists(p):
    return FileResponse(p, media_type="image/png")
  raise HTTPException(status_code=404)

@app.get("/health")
def health():
  return {"ok": True}

@app.get("/display-native")
def get_display_native():
  from fastapi.responses import HTMLResponse
  html_content = """
  <!DOCTYPE html>
  <html lang="pt-BR" style="background-color: #000000; background: #000000;">
  <head>
      <meta charset="UTF-8">
      <title>Projyn Playout</title>
      <script src="/hls.min.js"></script>
      <script>
          if (typeof Hls === 'undefined') {
              var s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
              document.head.appendChild(s);
          }
      </script>
      <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, html {
              width: 100%;
              height: 100%;
              background-color: #000000 !important;
              background: #000000 !important;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: default;
          }
          video {
              width: 100%;
              height: 100%;
              object-fit: contain;
              pointer-events: none;
              background-color: #000000;
          }
          .placeholder {
              position: absolute;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              height: 100%;
              background-color: #000000;
              pointer-events: none;
          }
          .placeholder img {
              max-width: 280px;
              max-height: 280px;
              object-fit: contain;
              opacity: 0.25;
              pointer-events: none;
          }
      </style>
  </head>
  <body>
      <div id="placeholder" class="placeholder">
          <img id="logo-img" src="/logo-projyn-icon-clara.png" alt="Projyn">
      </div>
      <video id="video-element" playsinline disablepictureinpicture disableremoteplayback></video>
      <script>
          const video = document.getElementById('video-element');
          const placeholder = document.getElementById('placeholder');
          let hlsInstance = null;
          let currentVideo = null;
          let currentSettings = {};
          let currentLoadId = 0;
          let retryCount = 0;

          async function startPlayback(loadId) {
              if (loadId && loadId !== currentLoadId) return;
              video.controls = false;
              const targetMuted = Boolean(currentSettings.player && currentSettings.player.muted);
              const targetVol = (currentSettings.player && currentSettings.player.volume !== undefined ? currentSettings.player.volume : 80) / 100;
              video.volume = targetVol;
              video.muted = true;
              try {
                  await video.play();
                  if (loadId && loadId !== currentLoadId) return;
                  if (!targetMuted) {
                      setTimeout(() => {
                          if (loadId && loadId !== currentLoadId) return;
                          video.muted = false;
                          video.volume = targetVol;
                      }, 100);
                  }
                  if (currentSettings && currentSettings.player && currentSettings.player.autoMinimizeOnPlay) {
                      setTimeout(() => {
                          if (window.pywebview && window.pywebview.api && window.pywebview.api.minimize) {
                              window.pywebview.api.minimize();
                          }
                      }, 300);
                  }
              } catch (err) {
                  console.error("Autoplay attempt:", err);
                  try {
                      video.muted = true;
                      await video.play();
                  } catch (e2) {}
              }
          }

          async function handleVideoError(loadId) {
              if (loadId && loadId !== currentLoadId) return;
              console.warn("Playback error. Renovando stream do YouTube...");
              if (currentVideo && currentVideo.id && retryCount < 2) {
                  retryCount++;
                  try {
                      const res = await fetch('/api/library/videos/' + encodeURIComponent(currentVideo.id) + '/refresh', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                      });
                      if (res.ok) {
                          const data = await res.json();
                          if (loadId && loadId !== currentLoadId) return;
                          if (data.video && data.video.streamUrl) {
                              const newVid = data.video;
                              const isHls = Boolean(
                                  (newVid.streamProtocol && (newVid.streamProtocol.includes('m3u8') || newVid.streamProtocol.includes('hls'))) ||
                                  (newVid.streamUrl && (newVid.streamUrl.includes('.m3u8') || newVid.streamUrl.includes('/hls_') || newVid.streamUrl.includes('manifest/hls')))
                              );
                              // Em caso de erro de rede, tenta usar o manifest proxy local
                              const finalUrl = (isHls && retryCount > 1) 
                                  ? ('/api/hls-manifest?url=' + encodeURIComponent(newVid.streamUrl))
                                  : newVid.streamUrl;
                              window.displayControl.loadVideo(newVid, finalUrl, isHls, video.currentTime || 0);
                              return;
                          }
                      }
                  } catch (e) {
                      console.error("Auto refresh failed:", e);
                  }
              }
              if (loadId === currentLoadId && window.pywebview && window.pywebview.api && window.pywebview.api.onVideoError) {
                  window.pywebview.api.onVideoError();
              }
          }

          window.displayControl = {
              loadVideo: function(videoObj, streamUrl, isHls, startAt) {
                  const thisLoadId = ++currentLoadId;
                  currentVideo = videoObj;
                  retryCount = 0;

                  // Limpa listeners antigos
                  video.onerror = null;
                  video.onended = null;

                  if (hlsInstance) {
                      try {
                          hlsInstance.stopLoad();
                          hlsInstance.detachMedia();
                          hlsInstance.destroy();
                      } catch (e) {}
                      hlsInstance = null;
                  }

                  try {
                      video.pause();
                      video.removeAttribute('src');
                      video.load();
                  } catch (e) {}

                  if (!streamUrl) {
                      window.displayControl.stop();
                      return;
                  }

                  placeholder.style.display = 'none';
                  video.style.display = 'block';

                  const onFatalError = function() {
                      if (currentLoadId === thisLoadId) {
                          handleVideoError(thisLoadId);
                      }
                  };

                  if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
                      try {
                          hlsInstance = new Hls({
                              maxBufferLength: 60,
                              maxMaxBufferLength: 600,
                              enableWorker: true,
                              lowLatencyMode: false,
                              backBufferLength: 90
                          });
                          hlsInstance.loadSource(streamUrl);
                          hlsInstance.attachMedia(video);
                          hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                              if (currentLoadId !== thisLoadId) return;
                              if (startAt && startAt > 0) video.currentTime = startAt;
                              startPlayback(thisLoadId);
                          });
                          hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                              if (currentLoadId !== thisLoadId) return;
                              if (data && data.fatal) {
                                  console.error("Fatal HLS error:", data);
                                  onFatalError();
                              }
                          });
                      } catch (e) {
                          console.error("HLS init error:", e);
                          onFatalError();
                      }
                  } else {
                      video.src = streamUrl;
                      video.onerror = onFatalError;
                      video.onended = function() {
                          if (currentLoadId !== thisLoadId) return;
                          if (window.pywebview && window.pywebview.api) {
                              window.pywebview.api.onVideoEnded();
                          }
                      };
                      video.load();
                      let started = false;
                      const onReady = function() {
                          if (currentLoadId !== thisLoadId || started) return;
                          started = true;
                          video.removeEventListener('canplay', onReady);
                          video.removeEventListener('loadeddata', onReady);
                          video.removeEventListener('loadedmetadata', onReady);
                          if (startAt && startAt > 0) video.currentTime = startAt;
                          startPlayback(thisLoadId);
                      };
                      video.addEventListener('canplay', onReady);
                      video.addEventListener('loadeddata', onReady);
                      video.addEventListener('loadedmetadata', onReady);
                      setTimeout(onReady, 200);
                  }
              },
              applySettings: function(settings) {
                  currentSettings = settings || {};
                  if (settings.player) {
                      if (settings.player.volume !== undefined) {
                          video.volume = settings.player.volume / 100;
                      }
                      if (settings.player.muted !== undefined) {
                          video.muted = Boolean(settings.player.muted);
                      }
                  }
              },
              play: function() {
                  if (video.style.display === 'none' && currentVideo && currentVideo.streamUrl) {
                      const isHls = Boolean(currentVideo.streamProtocol && currentVideo.streamProtocol.includes('m3u8') || currentVideo.streamUrl.includes('.m3u8'));
                      window.displayControl.loadVideo(currentVideo, currentVideo.streamUrl, isHls, 0);
                  } else {
                      startPlayback(currentLoadId);
                  }
              },
              pause: function() {
                  video.pause();
              },
              stop: function() {
                  currentLoadId++;
                  video.onerror = null;
                  video.onended = null;
                  if (hlsInstance) {
                      try {
                          hlsInstance.stopLoad();
                          hlsInstance.detachMedia();
                          hlsInstance.destroy();
                      } catch (e) {}
                      hlsInstance = null;
                  }
                  try {
                      video.pause();
                      video.currentTime = 0;
                      video.removeAttribute('src');
                      video.load();
                  } catch (e) {}
                  video.style.display = 'none';
                  placeholder.style.display = 'flex';
              },
              seek: function(seconds) {
                  video.currentTime = seconds;
              },
              setVolume: function(vol) {
                  const num = Math.max(0, Math.min(100, Number(vol) || 0));
                  video.volume = num / 100;
                  if (num > 0 && video.muted) {
                      video.muted = false;
                  }
              },
              setMuted: function(muted) {
                  video.muted = Boolean(muted);
              }
          };

          // Inicialização automática para carregar estado ou vídeo pendente assim que abrir
          async function initDisplayNative() {
              try {
                  const sRes = await fetch('/api/settings');
                  if (sRes.ok) {
                      const sData = await sRes.json();
                      window.displayControl.applySettings(sData);
                  }
                  const stRes = await fetch('/api/display-state');
                  if (stRes.ok) {
                      const st = await stRes.json();
                      if (st.video && st.video.streamUrl && !currentVideo) {
                          const isHls = Boolean(
                              (st.video.streamProtocol && (st.video.streamProtocol.includes('m3u8') || st.video.streamProtocol.includes('hls'))) ||
                              (st.video.streamUrl && (st.video.streamUrl.includes('.m3u8') || st.video.streamUrl.includes('/hls_') || st.video.streamUrl.includes('manifest/hls')))
                          );
                          window.displayControl.loadVideo(st.video, st.video.streamUrl, isHls, st.time || 0);
                      }
                  }
              } catch (e) {}
          }
          initDisplayNative();

          // Clicar no centro da tela minimiza a janela sem interromper a música (se ativado nas configurações)
          document.addEventListener('click', function(e) {
              if (currentSettings && currentSettings.player && currentSettings.player.clickToMinimize === false) {
                  return;
              }
              if (window.pywebview && window.pywebview.api && window.pywebview.api.minimize) {
                  window.pywebview.api.minimize();
              }
          });

          setInterval(function() {
              const state = {
                  ready: true,
                  video: currentVideo,
                  time: video.currentTime || 0,
                  duration: video.duration || 0,
                  playing: !video.paused && !video.ended && video.style.display !== 'none',
                  muted: video.muted,
                  volume: video.volume * 100
              };
              if (window.pywebview && window.pywebview.api) {
                  window.pywebview.api.reportState(state);
              }
          }, 400);
      </script>
  </body>
  </html>
  """
  return HTMLResponse(content=html_content)


# ==========================================
# MIGRAÇÃO DE DADOS LEGADOS E STARTUP
# ==========================================

def migrate_legacy_data(db: Session):
  # 1. Cria usuário Admin padrão se não houver nenhum
  admin_exists = db.query(DBUser).filter(DBUser.is_admin == True).first()
  if not admin_exists:
    default_admin = DBUser(
      username="admin",
      password_hash=hash_password("admin"),
      is_admin=True,
      can_create_category=True,
      can_add_songs=True,
      can_play_control=True,
      see_all_categories=True
    )
    db.add(default_admin)
    print("[MIGRATION] Criado usuário administrador padrão: admin / admin")

  # 2. Migra configurações do youtube-settings.json
  if os.path.exists(SETTINGS_PATH):
    try:
      with open(SETTINGS_PATH, "r", encoding="utf-8-sig") as f:
        stored = json.load(f)
      
      # Salva Display settings
      if "display" in stored and not db.query(DBSetting).filter(DBSetting.key == "display").first():
        disp = DBSetting(key="display")
        disp.value = stored["display"]
        db.add(disp)
        
      # Salva Player settings
      if "player" in stored and not db.query(DBSetting).filter(DBSetting.key == "player").first():
        play = DBSetting(key="player")
        play.value = stored["player"]
        db.add(play)
        
      # Salva Presets
      if "presets" in stored:
        for pr in stored["presets"]:
          exists = db.query(DBPreset).filter(DBPreset.id == pr.get("id")).first()
          if not exists:
            new_preset = DBPreset(
              id=pr.get("id") or str(time.time()),
              name=pr.get("name", "Preset")
            )
            new_preset.display = pr.get("display", {})
            new_preset.player = pr.get("player", {})
            db.add(new_preset)
      db.commit()
      print("[MIGRATION] Configurações migradas do youtube-settings.json com sucesso!")
    except Exception as e:
      print(f"[MIGRATION] Erro ao migrar youtube-settings.json: {e}")

  # 3. Migra biblioteca do youtube-library.json
  if os.path.exists(LIBRARY_PATH):
    try:
      with open(LIBRARY_PATH, "r", encoding="utf-8-sig") as f:
        stored = json.load(f)
        
      groups = stored.get("groups", [])
      for g in groups:
        cat_id = g.get("id")
        if not cat_id:
          continue
          
        # Cria categoria se não existir
        cat = db.query(DBCategory).filter(DBCategory.id == cat_id).first()
        if not cat:
          cat = DBCategory(
            id=cat_id,
            title=g.get("title", "Categoria"),
            color=g.get("color", "#e73c55"),
            created_at=g.get("createdAt") or time.time(),
            updated_at=g.get("updatedAt") or time.time()
          )
          db.add(cat)
          db.commit() # Commit para garantir FK de vídeos
          
        # Importa vídeos
        for v in g.get("videos", []):
          v_id = v.get("id")
          if not v_id:
            continue
          try:
            exists = db.query(DBVideo).filter(DBVideo.id == v_id).first()
            if not exists:
              new_video = DBVideo(
                id=v_id,
                title=v.get("title", "Sem Título"),
                channel=v.get("channel", ""),
                duration=str(v.get("duration", "0")),
                thumbnail=v.get("thumbnail", ""),
                url=v.get("url") or f"https://www.youtube.com/watch?v={v_id}",
                stream_url=v.get("streamUrl", ""),
                stream_ext=v.get("streamExt", ""),
                stream_protocol=v.get("streamProtocol", ""),
                stream_height=v.get("streamHeight", 0),
                stream_format_id=v.get("streamFormatId", ""),
                stream_quality=v.get("streamQuality", ""),
                prepared_at=v.get("preparedAt") or time.time(),
                saved_at=v.get("savedAt") or time.time(),
                category_id=cat_id
              )
              db.add(new_video)
              db.commit()
          except Exception:
            db.rollback()
      print("[MIGRATION] Biblioteca de vídeos migrada do youtube-library.json com sucesso!")
    except Exception as e:
      print(f"[MIGRATION] Erro ao migrar youtube-library.json: {e}")

def convert_png_to_ico():
  try:
    from PIL import Image
    png_path = os.path.join(APP_DIR, "logo-projyn-icon-clara.png")
    ico_path = os.path.join(APP_DIR, "logo-projyn-icon-clara.ico")
    if os.path.exists(png_path):
      img = Image.open(png_path)
      # Salva o PNG como ICO com múltiplos tamanhos para excelente renderização no Windows
      img.save(ico_path, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
      print("[ICON] Convertido logo-projyn-icon-clara.png para .ico com sucesso!")
  except Exception as e:
    print(f"[ICON] Erro ao converter png para ico: {e}")

convert_png_to_ico()

# Executa migrações na inicialização
init_db()
db = next(get_db())
try:
  migrate_legacy_data(db)
finally:
  db.close()


# ==========================================
# AUTO-REFRESH DE STREAMS EM SEGUNDO PLANO (A CADA 2 HORAS)
# ==========================================

def auto_refresh_streams_worker():
  """Thread em background que monitora o temporizador e renova as streams a cada 2 horas com progresso global."""
  global NEXT_AUTO_REFRESH_AT
  time.sleep(3)  # Aguarda startup suave do servidor
  print("[AUTO-REFRESH] Serviço de auto-renovação contínua iniciado (ciclo de 2 horas).")

  while True:
    try:
      time.sleep(3)
      now = time.time()
      if now >= NEXT_AUTO_REFRESH_AT:
        print("[AUTO-REFRESH] Ciclo de 2 horas atingido! Iniciando auto-renovação de todos os vídeos...")
        with REFRESH_LOCK:
          is_running = REFRESH_ALL_PROGRESS.get("in_progress", False)
        if not is_running:
          refresh_all_worker(is_auto=True)
    except Exception as err:
      print(f"[AUTO-REFRESH] Erro no agendador de auto-renovação: {err}")
      time.sleep(10)

# Inicia thread daemon de auto-renovação
threading.Thread(target=auto_refresh_streams_worker, daemon=True).start()


# ==========================================
# SERVIÇO DE ARQUIVOS ESTÁTICOS (PRODUÇÃO)
# ==========================================

# Rota curinga para servir o index.html do React em caso de HTML5 Browser Routing
@app.middleware("http")
async def fallback_route(request: Request, call_next):
  response = await call_next(request)
  if response.status_code == 404 and not request.url.path.startswith("/api") and not request.url.path.startswith("/health"):
    # Verifica se os estáticos compilados do React existem
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_path):
      return FileResponse(index_path)
  return response

# Monta a pasta de estáticos compilados do frontend se ela existir
if os.path.exists(FRONTEND_DIST_DIR):
  app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="static")
  print(f"[STATIC] Servindo frontend a partir de: {FRONTEND_DIST_DIR}")
else:
  print("[STATIC] Atenção: Frontend compilado (dist) não encontrado. Servindo apenas a API.")


if __name__ == "__main__":
  import uvicorn
  import argparse
  
  parser = argparse.ArgumentParser(description="Sistema Projyn Playout & YouTube Library.")
  parser.add_argument("--host", default="0.0.0.0")
  parser.add_argument("--port", type=int, default=8797)
  args = parser.parse_args()
  
  print("Iniciando Projyn Playout Server...")
  uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=False)

