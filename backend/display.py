import sys
import os
import json
import time
import threading
import ctypes
import requests
import webview

# Set AppUserModelID so Windows taskbar uses Projyn's custom icon instead of Python's default icon
try:
    myappid = "projyn.playout.app.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

# Get backend config from command-line arguments or environment variables
SERVER_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8797"
TOKEN = sys.argv[2] if len(sys.argv) > 2 else ""
DISPLAY_CONFIG = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {
    "left": 0, "top": 0, "width": 1280, "height": 720, "fullscreen": True
}

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(APP_DIR, "logo-projyn-icon-clara.png")
ICO_PATH = os.path.join(APP_DIR, "logo-projyn-icon-clara.ico")

GLOBAL_WINDOW = None

class DisplayApi:
    def __init__(self):
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}"
        }
        self.current_video_id = None

    def reportState(self, state):
        # Update server with current display state
        try:
            requests.post(
                f"{SERVER_URL}/api/display-state",
                headers=self.headers,
                json=state,
                timeout=2
            )
        except Exception:
            pass

    def onVideoEnded(self):
        # Video ended! Tell the backend to close the window
        print("[DISPLAY] Video ended. Requesting close...")
        try:
            requests.post(
                f"{SERVER_URL}/api/display-close",
                headers=self.headers,
                json={},
                timeout=2
            )
        except Exception:
            pass

    def onVideoError(self):
        # Video error! Request stream refresh from server
        if self.current_video_id:
            print(f"[DISPLAY] Stream error for video {self.current_video_id}. Refreshing...")
            try:
                requests.post(
                    f"{SERVER_URL}/api/library/videos/{self.current_video_id}/refresh",
                    headers=self.headers,
                    json={},
                    timeout=2
                )
            except Exception:
                pass

    def minimize(self):
        global GLOBAL_WINDOW
        if GLOBAL_WINDOW:
            try:
                GLOBAL_WINDOW.minimize()
            except Exception:
                pass

    def toggleFullscreen(self):
        global GLOBAL_WINDOW
        if GLOBAL_WINDOW:
            try:
                GLOBAL_WINDOW.toggle_fullscreen()
            except Exception:
                pass

    def restore(self):
        global GLOBAL_WINDOW
        if GLOBAL_WINDOW:
            try:
                GLOBAL_WINDOW.restore()
            except Exception:
                pass


def command_polling_worker(window, api):
    last_seq = 0
    headers = {"Authorization": f"Bearer {TOKEN}"}
    
    # Inicializa sequência de comandos e executa comandos pendentes (settings, load)
    try:
        res = requests.get(f"{SERVER_URL}/api/display-command?after=0", headers=headers, timeout=3)
        if res.status_code == 200:
            payload = res.json()
            commands = payload.get("commands", [])
            
            # Encontra se houve comando de reset
            start_index = 0
            for i, cmd in enumerate(commands):
                if cmd.get("type") in ("reset", "stop"):
                    start_index = i + 1
            
            pending = commands[start_index:]
            for cmd in pending:
                last_seq = max(last_seq, cmd.get("seq", 0))
                handle_command(window, api, cmd)
            
            if not pending and payload.get("seq", 0) > 0:
                last_seq = payload.get("seq", 0)
    except Exception as e:
        print(f"[DISPLAY] Startup command check error: {e}")

    # Verifica também se o DISPLAY_STATE já continha um vídeo ativo que deva começar tocando
    try:
        res_state = requests.get(f"{SERVER_URL}/api/display-state", headers=headers, timeout=2)
        if res_state.status_code == 200:
            st = res_state.json()
            if st.get("video") and st.get("playing") and not api.current_video_id:
                vid = st.get("video")
                handle_command(window, api, {"type": "load", "payload": {"video": vid, "startAt": st.get("time", 0)}})
    except Exception:
        pass

    print(f"[DISPLAY] Polling commands from {SERVER_URL} starting at sequence {last_seq}...")
    
    while True:
        try:
            response = requests.get(
                f"{SERVER_URL}/api/display-command?after={last_seq}",
                headers=headers,
                timeout=2
            )
            if response.status_code == 200:
                payload = response.json()
                commands = payload.get("commands", [])
                for cmd in commands:
                    last_seq = max(last_seq, cmd.get("seq", 0))
                    handle_command(window, api, cmd)
        except Exception as e:
            time.sleep(0.5)
        time.sleep(0.15)


def force_window_restore_fullscreen():
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
    except Exception as e:
        print(f"[DISPLAY] Win32 restore error: {e}")

def force_window_minimize():
    try:
        import win32gui
        import win32con
        hwnd = win32gui.FindWindow(None, "Projyn Playout")
        if hwnd:
            win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
    except Exception as e:
        print(f"[DISPLAY] Win32 minimize error: {e}")

def handle_command(window, api, command):
    cmd_type = command.get("type")
    payload = command.get("payload", {})
    
    if cmd_type == "load":
        video = payload.get("video", {})
        stream_url = video.get("streamUrl")
        is_hls = (
            "m3u8" in str(video.get("streamProtocol", "")).lower() or 
            "hls" in str(video.get("streamProtocol", "")).lower() or
            ".m3u8" in str(stream_url).lower() or
            "/hls_" in str(stream_url).lower() or
            "manifest/hls" in str(stream_url).lower()
        )
        start_at = payload.get("startAt", 0)
        api.current_video_id = video.get("id")
        
        # Format JS string carefully escaping URLs
        js_cmd = f"window.displayControl.loadVideo({json.dumps(video)}, {json.dumps(stream_url)}, {json.dumps(is_hls)}, {start_at or 0});"
        window.evaluate_js(js_cmd)
        
    elif cmd_type == "play":
        window.evaluate_js("window.displayControl.play();")
        
    elif cmd_type == "pause":
        window.evaluate_js("window.displayControl.pause();")
        
    elif cmd_type == "stop":
        window.evaluate_js("window.displayControl.stop();")
        
    elif cmd_type == "seek":
        seconds = payload.get("seconds", 0)
        window.evaluate_js(f"window.displayControl.seek({seconds});")
        
    elif cmd_type == "volume":
        vol = payload.get("volume", 80)
        window.evaluate_js(f"window.displayControl.setVolume({vol});")
        
    elif cmd_type == "mute":
        window.evaluate_js("window.displayControl.setMuted(true);")
        
    elif cmd_type == "unmute":
        window.evaluate_js("window.displayControl.setMuted(false);")
        
    elif cmd_type == "settings":
        player_settings = payload.get("player", {})
        muted = player_settings.get("muted", False)
        vol = player_settings.get("volume", 80)
        window.evaluate_js(f"window.displayControl.setMuted({json.dumps(muted)});")
        window.evaluate_js(f"window.displayControl.setVolume({vol});")
        window.evaluate_js(f"window.displayControl.applySettings({json.dumps(payload)});")
        
    elif cmd_type == "reset":
        window.evaluate_js("window.displayControl.stop();")
        api.current_video_id = None

    elif cmd_type == "minimize":
        try:
            window.minimize()
        except Exception:
            pass
        force_window_minimize()

    elif cmd_type in ("restore", "fullscreen", "open"):
        try:
            window.restore()
        except Exception:
            pass
        try:
            if not window.fullscreen:
                window.toggle_fullscreen()
        except Exception:
            pass
        force_window_restore_fullscreen()

    elif cmd_type == "toggle_fullscreen":
        try:
            window.minimize()
        except Exception:
            pass
        force_window_minimize()


def apply_taskbar_icon():
    try:
        if not os.path.exists(ICO_PATH):
            return
        import win32gui
        import win32con
        hwnd = win32gui.FindWindow(None, "Projyn Playout")
        if hwnd:
            IMAGE_ICON = 1
            LR_LOADFROMFILE = 0x0010
            hicon_lg = win32gui.LoadImage(0, ICO_PATH, IMAGE_ICON, 256, 256, LR_LOADFROMFILE)
            hicon_sm = win32gui.LoadImage(0, ICO_PATH, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
            if hicon_lg:
                win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_BIG, hicon_lg)
            if hicon_sm:
                win32gui.SendMessage(hwnd, win32con.WM_SETICON, win32con.ICON_SMALL, hicon_sm)
            
            GWL_EXSTYLE = -20
            WS_EX_APPWINDOW = 0x00040000
            WS_EX_TOOLWINDOW = 0x00000080
            style = win32gui.GetWindowLong(hwnd, GWL_EXSTYLE)
            win32gui.SetWindowLong(hwnd, GWL_EXSTYLE, (style | WS_EX_APPWINDOW) & ~WS_EX_TOOLWINDOW)
    except Exception as e:
        print(f"[DISPLAY] Error applying taskbar icon: {e}")

def main():
    # Instancia a API primeiro
    api = DisplayApi()

    # Posições e monitor do display vindos da configuração
    x = DISPLAY_CONFIG.get("left", 0)
    y = DISPLAY_CONFIG.get("top", 0)
    width = DISPLAY_CONFIG.get("width", 1280)
    height = DISPLAY_CONFIG.get("height", 720)
    fullscreen = True  # Sempre tela cheia (sem moldura ou janela comum)

    print(f"[DISPLAY] Opening kiosk window at x={x}, y={y}, size={width}x{height}, fullscreen=True")

    # Cria a janela de Kiosk apontando para a URL do servidor
    window = webview.create_window(
        'Projyn Playout',
        url=f"{SERVER_URL}/display-native",
        x=x,
        y=y,
        width=width,
        height=height,
        fullscreen=True,
        frameless=True,
        background_color='#000000',
        js_api=api
    )

    global GLOBAL_WINDOW
    GLOBAL_WINDOW = window

    # Inicia a thread de comandos e define o ícone do Projyn
    def on_loaded():
        apply_taskbar_icon()
        threading.Timer(0.3, apply_taskbar_icon).start()
        threading.Timer(1.0, apply_taskbar_icon).start()
        threading.Timer(2.5, apply_taskbar_icon).start()

        polling_thread = threading.Thread(
            target=command_polling_worker,
            args=(window, api),
            daemon=True
        )
        polling_thread.start()

    webview.start(on_loaded, debug=False)

if __name__ == '__main__':
    main()
