#!/usr/bin/env python3
"""
Ralph Dashboard - 实时监控面板
启动一个本地 HTTP 服务，服务 dashboard.html 并提供 /api/state 接口。
"""

import json
import threading
import webbrowser
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DEFAULT_PORT_SEARCH_LIMIT = 20

SCRIPT_DIR = Path(__file__).parent.resolve()
PRD_FILE = SCRIPT_DIR / "prd.json"
PROGRESS_FILE = SCRIPT_DIR / "progress.txt"
AGENT_LOG_FILE = SCRIPT_DIR / "agent-output.log"
HTML_FILE = SCRIPT_DIR / "dashboard.html"
PIXEL_HTML_FILE = SCRIPT_DIR / "dashboard-p.html"
AGENT_LOG_TAIL_CHARS = 8000

_state: dict = {
    "iteration": 0,
    "max_iterations": 50,
    "phase": "idle",       # idle | developing | validating | done | error
    "current_story": None,
    "started_at": None,
}
_state_lock = threading.Lock()


def read_utf8_text(path: Path) -> str:
    """统一按 UTF-8/BOM 读取文本，避免 Windows 默认编码和 BOM 干扰。"""
    return path.read_text(encoding="utf-8-sig")


def set_state(
    iteration: int | None = None,
    phase: str | None = None,
    current_story: str | None = None,
) -> None:
    with _state_lock:
        if iteration is not None:
            _state["iteration"] = iteration
        if phase is not None:
            _state["phase"] = phase
        if current_story is not None:
            _state["current_story"] = current_story


def _build_api_response() -> dict:
    with _state_lock:
        s = dict(_state)

    elapsed = int(time.time() - s["started_at"]) if s["started_at"] else 0

    project = ""
    branch_name = ""
    stories = []
    try:
        prd = json.loads(read_utf8_text(PRD_FILE))
        project = prd.get("project", "")
        branch_name = prd.get("branchName", "")
        stories = prd.get("userStories", [])
    except Exception:
        pass

    logs = ""
    try:
        if PROGRESS_FILE.exists():
            logs = read_utf8_text(PROGRESS_FILE)
    except Exception:
        pass

    agent_output = ""
    try:
        if AGENT_LOG_FILE.exists():
            text = read_utf8_text(AGENT_LOG_FILE)
            agent_output = text[-AGENT_LOG_TAIL_CHARS:] if len(text) > AGENT_LOG_TAIL_CHARS else text
    except Exception:
        pass

    return {
        "runtime": {
            "iteration": s["iteration"],
            "max_iterations": s["max_iterations"],
            "phase": s["phase"],
            "current_story": s["current_story"],
            "elapsed": elapsed,
        },
        "project": project,
        "branchName": branch_name,
        "stories": stories,
        "logs": logs,
        "agent_output": agent_output,
    }


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?")[0]

        if path == "/api/state":
            body = json.dumps(_build_api_response(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path in ("/", "/index.html"):
            try:
                html = HTML_FILE.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
            except Exception as e:
                msg = str(e).encode()
                self.send_response(500)
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)

        elif path in ("/p", "/p.html"):
            try:
                html = PIXEL_HTML_FILE.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
            except Exception as e:
                msg = str(e).encode()
                self.send_response(500)
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args) -> None:  # suppress access logs
        pass


def start(port: int = 7331, max_iterations: int = 50, open_browser: bool = True) -> int | None:
    with _state_lock:
        _state["started_at"] = time.time()
        _state["max_iterations"] = max_iterations

    server: HTTPServer | None = None
    selected_port: int | None = None
    last_error: OSError | None = None

    for offset in range(DEFAULT_PORT_SEARCH_LIMIT):
        candidate_port = port + offset
        try:
            server = HTTPServer(("127.0.0.1", candidate_port), _Handler)
            selected_port = candidate_port
            break
        except OSError as exc:
            last_error = exc

    if server is None or selected_port is None:
        print(f"⚠️  Dashboard 启动失败: {last_error}")
        return None

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    url = f"http://localhost:{selected_port}"
    if selected_port != port:
        print(f"⚠️  Dashboard 端口 {port} 被占用，已切换到 {selected_port}")
    print(f"🖥️  Dashboard: {url}")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    return selected_port
