#!/usr/bin/env python3
"""
Ralph - autonomous AI agent loop runner with validator.
"""

import json
import os
import platform
import shlex
import shutil
import sys
import subprocess
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
import dashboard

# Config
MAX_ITERATIONS = 50
TIMEOUT_SECONDS = 30 * 60
RATE_LIMIT_BACKOFF_SECONDS = int(os.environ.get("RALPH_RATE_LIMIT_BACKOFF_SECONDS", "180"))
MAX_RATE_LIMIT_BACKOFF_SECONDS = int(os.environ.get("RALPH_MAX_RATE_LIMIT_BACKOFF_SECONDS", "1800"))

# Agent selection: "claude" (default) or "codex"
# Usage: python ralph.py [codex]
AGENT = sys.argv[1] if len(sys.argv) > 1 else "claude"

DEV_COMPLETED = "dev_completed"
DEV_TIMED_OUT = "dev_timed_out"
DEV_RATE_LIMITED = "dev_rate_limited"
DEV_FATAL = "dev_fatal"

VAL_PASSED = "val_passed"
VAL_FAILED_RECORDED = "val_failed_recorded"
VAL_INCOMPLETE = "val_incomplete"
VAL_TIMED_OUT = "val_timed_out"
VAL_FATAL = "val_fatal"

NEXT_ACTION_DEVELOP = "develop"
NEXT_ACTION_VALIDATE = "validate"

OUTPUT_TAIL_CHARS = 4000
VALIDATION_HEADER_PREFIX = "### Validation "


def configure_console_encoding() -> None:
    """Try to force UTF-8 console behavior to reduce Windows mojibake."""
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("PYTHONUTF8", "1")

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

    if platform.system() == "Windows":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleOutputCP(65001)
            kernel32.SetConsoleCP(65001)
        except Exception:
            pass


def safe_print(message: str = "") -> None:
    """Fallback to ASCII when stdout encoding is unreliable."""
    try:
        print(message)
    except UnicodeEncodeError:
        sanitized = message.encode("ascii", errors="ignore").decode("ascii")
        print(sanitized)


def read_utf8_text(path: Path) -> str:
    """Read text as UTF-8 with BOM support."""
    return path.read_text(encoding="utf-8-sig")


def tail_text(text: str | None, limit: int = OUTPUT_TAIL_CHARS) -> str:
    """Take the tail of process output to avoid log spam."""
    if not text:
        return ""
    return text[-limit:]


def dump_process_output(stdout_text: str | None, stderr_text: str | None) -> None:
    """Print process output tail for debugging."""
    stdout_tail = tail_text(stdout_text)
    stderr_tail = tail_text(stderr_text)

    if stdout_tail:
        safe_print("\n--- Agent 标准输出尾部 ---")
        safe_print(stdout_tail)

    if stderr_tail:
        safe_print("\n--- Agent 错误输出尾部 ---")
        safe_print(stderr_tail)


def is_rate_limited(stdout_text: str | None, stderr_text: str | None) -> bool:
    """Detect common upstream rate-limit responses."""
    combined = "\n".join(filter(None, [stdout_text, stderr_text])).lower()
    if not combined:
        return False

    rate_limit_markers = (
        "api error: 429",
        '"code":"1302"',
        '"code": "1302"',
        "rate limit",
        "throttled",
        "too many requests",
    )
    return any(marker in combined for marker in rate_limit_markers)


def calculate_backoff_seconds(rate_limit_count: int) -> int:
    """Use exponential backoff for repeated rate limits."""
    multiplier = max(0, rate_limit_count - 1)
    return min(MAX_RATE_LIMIT_BACKOFF_SECONDS, RATE_LIMIT_BACKOFF_SECONDS * (2 ** multiplier))


def load_prd_state() -> dict | None:
    """Load the current PRD state, or None on failure."""
    try:
        return json.loads(read_utf8_text(PRD_FILE))
    except Exception:
        return None


def capture_story_status(prd: dict | None) -> dict[str, tuple[bool, bool, int, str]]:
    """Extract the key status tuple for each story."""
    if not prd:
        return {}

    story_status: dict[str, tuple[bool, bool, int, str]] = {}
    for story in prd.get("userStories", []):
        story_id = story.get("id")
        if not story_id:
            continue
        story_status[story_id] = (
            bool(story.get("passes", False)),
            bool(story.get("blocked", False)),
            int(story.get("retryCount", 0) or 0),
            str(story.get("notes", "") or ""),
        )
    return story_status


def capture_file_state(path: Path) -> tuple[bool, int | None, int | None]:
    """Capture existence, size, and mtime as a cheap progress signal."""
    if not path.exists():
        return (False, None, None)

    stat = path.stat()
    return (True, stat.st_size, stat.st_mtime_ns)


def did_story_progress_change(before_prd: dict | None, after_prd: dict | None) -> bool:
    """Check whether any story state changed between two PRD snapshots."""
    before_status = capture_story_status(before_prd)
    after_status = capture_story_status(after_prd)
    return before_status != after_status


def validate_developer_completion(
    progress_before: tuple[bool, int | None, int | None],
    prd_before: dict | None,
) -> tuple[bool, list[str]]:
    """Verify that the developer agent produced the required artifacts."""
    reasons: list[str] = []

    progress_after = capture_file_state(SCRIPT_DIR / "progress.txt")
    prd_after = load_prd_state()

    if not progress_after[0]:
        reasons.append("未生成 scripts/ralph/progress.txt")
    elif progress_after == progress_before:
        reasons.append("scripts/ralph/progress.txt 没有新增内容")

    if prd_after is None:
        reasons.append("无法读取 scripts/ralph/prd.json")
    elif not did_story_progress_change(prd_before, prd_after):
        reasons.append("scripts/ralph/prd.json 中没有任何 story 状态变化")

    return (len(reasons) == 0, reasons)


def story_has_open_notes(story: dict) -> bool:
    """Return True when a story still has unresolved notes."""
    return str(story.get("notes", "") or "").strip() != ""


def story_needs_work(story: dict) -> bool:
    """Return True when a story is not blocked and still requires work."""
    if bool(story.get("blocked", False)):
        return False
    if not bool(story.get("passes", False)):
        return True
    return story_has_open_notes(story)


def extract_latest_story_id_from_progress(progress_text: str | None) -> str | None:
    """Extract the latest developer story ID from progress.txt."""
    if not progress_text:
        return None

    latest_story_id: str | None = None
    for raw_line in progress_text.splitlines():
        line = raw_line.strip()
        if not line.startswith("## "):
            continue
        parts = line.split(" - ")
        if len(parts) < 2:
            continue
        candidate = parts[-1].strip()
        if candidate:
            latest_story_id = candidate

    return latest_story_id


def extract_latest_validation_record(progress_text: str | None) -> tuple[str | None, str | None]:
    """Extract the latest validation story ID and outcome from progress.txt."""
    if not progress_text:
        return (None, None)

    latest_story_id: str | None = None
    latest_result: str | None = None

    for raw_line in progress_text.splitlines():
        line = raw_line.strip()
        if not line.startswith(VALIDATION_HEADER_PREFIX):
            continue
        parts = line.split(" - ")
        if len(parts) < 3:
            continue
        latest_story_id = parts[-2].strip() or None
        latest_result = parts[-1].strip() or None

    return (latest_story_id, latest_result)


def get_story_status(prd: dict | None, story_id: str | None) -> tuple[bool, bool, int, str] | None:
    """Get the status tuple for one story."""
    if not prd or not story_id:
        return None

    for story in prd.get("userStories", []):
        if story.get("id") != story_id:
            continue
        return (
            bool(story.get("passes", False)),
            bool(story.get("blocked", False)),
            int(story.get("retryCount", 0) or 0),
            str(story.get("notes", "") or ""),
        )
    return None


def validate_validator_completion(
    progress_before: tuple[bool, int | None, int | None],
    prd_before: dict | None,
    current_story_id: str | None,
) -> tuple[str, list[str]]:
    """Classify validator completion for the current story."""
    reasons: list[str] = []

    progress_path = SCRIPT_DIR / "progress.txt"
    progress_after_state = capture_file_state(progress_path)
    if not progress_after_state[0]:
        reasons.append("验证阶段找不到 scripts/ralph/progress.txt")
        return (VAL_INCOMPLETE, reasons)

    if progress_after_state == progress_before:
        reasons.append("Validator 没有向 scripts/ralph/progress.txt 追加验收记录")
        return (VAL_INCOMPLETE, reasons)

    try:
        progress_text = read_utf8_text(progress_path)
    except Exception as exc:
        return (VAL_FATAL, [f"无法读取 scripts/ralph/progress.txt: {exc}"])

    validation_story_id, validation_result = extract_latest_validation_record(progress_text)
    target_story_id = current_story_id or validation_story_id
    if not target_story_id:
        reasons.append("无法确定本轮验收对应的 story ID")
        return (VAL_INCOMPLETE, reasons)

    if not validation_story_id:
        reasons.append("无法从 progress.txt 提取最后一条 Validation 记录")
        return (VAL_INCOMPLETE, reasons)

    if validation_story_id != target_story_id:
        reasons.append(
            f"最后一条 Validation 记录对应的 story 是 {validation_story_id}，不是当前 story {target_story_id}"
        )
        return (VAL_INCOMPLETE, reasons)

    prd_after = load_prd_state()
    if prd_after is None:
        return (VAL_FATAL, ["验证后无法读取 scripts/ralph/prd.json"])

    before_story_status = get_story_status(prd_before, target_story_id)
    after_story_status = get_story_status(prd_after, target_story_id)
    if before_story_status is None:
        return (VAL_FATAL, [f"验证前无法定位 story {target_story_id}"])
    if after_story_status is None:
        return (VAL_FATAL, [f"scripts/ralph/prd.json 中不存在 story {target_story_id}"])

    after_passes, after_blocked, after_retry_count, after_notes = after_story_status
    normalized_result = (validation_result or "").upper()

    if after_story_status == before_story_status:
        # A passing validator may legally leave PRD untouched when the story is already final-pass.
        if after_passes and after_retry_count == 0 and after_notes == "":
            return (VAL_PASSED, reasons)
        reasons.append(f"Validator 未对 story {target_story_id} 的验收状态产生任何变化")
        return (VAL_INCOMPLETE, reasons)

    if after_blocked:
        return (VAL_PASSED, reasons)

    if normalized_result.startswith("PASS") and not after_passes:
        reasons.append(f"Validation 记录标记 PASS，但 story {target_story_id} 仍未通过")
        return (VAL_INCOMPLETE, reasons)

    if normalized_result.startswith("FAIL") and after_passes:
        reasons.append(f"Validation 记录标记 FAIL，但 story {target_story_id} 已通过")
        return (VAL_INCOMPLETE, reasons)

    if after_passes and after_notes.strip() != "":
        reasons.append(f"Validation 将 story {target_story_id} 标为通过，但 notes 仍非空")
        return (VAL_INCOMPLETE, reasons)

    if after_passes:
        return (VAL_PASSED, reasons)

    return (VAL_FAILED_RECORDED, reasons)


def resolve_cli_command(command_name: str) -> str:
    """Resolve Windows/npm shim commands to an executable path when possible."""
    if platform.system() == "Windows":
        candidates = [
            f"{command_name}.cmd",
            f"{command_name}.exe",
            command_name,
        ]
    else:
        candidates = [command_name]

    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    return command_name


def build_cmd(prompt: str) -> list[str]:
    """Build the base agent command."""
    if AGENT == "codex":
        return [
            resolve_cli_command("codex"),
            "exec",
            "--dangerously-bypass-approvals-and-sandbox",
            prompt,
        ]

    return [
        resolve_cli_command("claude"),
        "--print",
        "--dangerously-skip-permissions",
        prompt,
    ]


def build_process_cmd(prompt: str) -> list[str]:
    """Build the child-process command for the current platform.

    Windows runs directly.
    macOS may use script to provide a PTY.
    Linux/WSL also runs directly to avoid PTY/PIPE conflicts.
    """
    cmd = build_cmd(prompt)

    if platform.system() == "Darwin":
        script_path = shutil.which("script")
        if script_path:
            return [script_path, "-q", "/dev/null"] + cmd

    return cmd

# Directory config
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent
CLAUDE_INSTRUCTION_FILE = SCRIPT_DIR / "CLAUDE.md"
VALIDATOR_INSTRUCTION_FILE = SCRIPT_DIR / "VALIDATOR.md"
PRD_FILE = SCRIPT_DIR / "prd.json"
AGENT_LOG_FILE = SCRIPT_DIR / "agent-output.log"


def _stream_pipe(pipe, file_handle, buffer_list):
    """Stream pipe output into both a file and an in-memory buffer."""
    try:
        for line in iter(pipe.readline, ''):
            file_handle.write(line)
            file_handle.flush()
            buffer_list.append(line)
    except Exception:
        pass
    finally:
        pipe.close()


def run_developer(iteration: int, current_story_id: str | None = None) -> str:
    """Run the developer agent and return a development-phase status."""
    safe_print(f"\n{'='*64}\n  迭代 {iteration}/{MAX_ITERATIONS}\n{'='*64}")

    if not CLAUDE_INSTRUCTION_FILE.exists():
        safe_print(f"错误: {CLAUDE_INSTRUCTION_FILE} 不存在")
        return DEV_FATAL

    file_content = read_utf8_text(CLAUDE_INSTRUCTION_FILE)
    story_hint = ""
    if current_story_id:
        story_hint = (
            f"\n[Current story ID: {current_story_id}] "
            "You must work on this exact story. "
            "Treat a non-empty notes field as unresolved work even if passes is already true. "
            "Do not switch to another story.\n"
        )

    action_directive = (
        "[Task] Read scripts/ralph/prd.json and scripts/ralph/progress.txt "
        "(if present), then implement the next unfinished user story. "
        "If all stories are already done, exit normally. "
        "Do not chat or ask follow-up questions."
        f"{story_hint}\n"
        "=== Base rules and project context ===\n"
    )
    prompt = action_directive + file_content
    cmd = build_process_cmd(prompt)
    progress_before = capture_file_state(SCRIPT_DIR / "progress.txt")
    prd_before = load_prd_state()

    try:
        log_fh = open(AGENT_LOG_FILE, "w", encoding="utf-8")
        stdout_buf: list[str] = []
        stderr_buf: list[str] = []

        process = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        out_thread = threading.Thread(
            target=_stream_pipe, args=(process.stdout, log_fh, stdout_buf), daemon=True
        )
        err_thread = threading.Thread(
            target=_stream_pipe, args=(process.stderr, log_fh, stderr_buf), daemon=True
        )
        out_thread.start()
        err_thread.start()

        start_time = time.time()

        while True:
            ret_code = process.poll()
            if ret_code is not None:
                out_thread.join(timeout=5)
                err_thread.join(timeout=5)
                log_fh.close()
                stdout_text = "".join(stdout_buf)
                stderr_text = "".join(stderr_buf)

                if ret_code == 0:
                    completion_ok, reasons = validate_developer_completion(
                        progress_before,
                        prd_before,
                    )
                    if completion_ok:
                        safe_print("\n开发迭代完成")
                        return DEV_COMPLETED

                    safe_print("\n开发 Agent 进程已退出，但未完成 Ralph 约定的产物更新。")
                    for reason in reasons:
                        safe_print(f" - {reason}")
                    dump_process_output(stdout_text, stderr_text)
                    return DEV_FATAL

                if is_rate_limited(stdout_text, stderr_text):
                    safe_print("\n开发 Agent 遇到上游 API 限流 (429)，本次视为可恢复错误。")
                    dump_process_output(stdout_text, stderr_text)
                    return DEV_RATE_LIMITED

                safe_print(f"\n开发 Agent 异常退出，退出码: {ret_code}")
                dump_process_output(stdout_text, stderr_text)
                return DEV_FATAL

            elapsed_time = time.time() - start_time
            if elapsed_time > TIMEOUT_SECONDS:
                safe_print(f"\n开发 Agent 超时! 已运行 {int(elapsed_time)} 秒")
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                out_thread.join(timeout=5)
                err_thread.join(timeout=5)
                log_fh.close()
                stdout_text = "".join(stdout_buf)
                stderr_text = "".join(stderr_buf)
                safe_print("   进程已终止，将在下一次迭代重试")
                dump_process_output(stdout_text, stderr_text)
                return DEV_TIMED_OUT

            time.sleep(60)

    except Exception as e:
        safe_print(f"\n开发 Agent 错误: {e}")
        return DEV_FATAL


def run_validator(iteration: int, current_story_id: str | None = None) -> str:
    """Run the validator agent and return a validation-phase status."""
    safe_print(f"\n{'='*64}\n  验证迭代 {iteration} - Validator 开始工作\n{'='*64}")

    if not VALIDATOR_INSTRUCTION_FILE.exists():
        safe_print(f"警告: {VALIDATOR_INSTRUCTION_FILE} 不存在，无法执行验收")
        return VAL_FATAL

    file_content = read_utf8_text(VALIDATOR_INSTRUCTION_FILE)
    story_hint = ""
    if current_story_id:
        story_hint = (
            f"\n[Current story ID: {current_story_id}] "
            "Even if progress.txt is missing or empty, you must validate this story. "
            "Do not stop. Read scripts/ralph/prd.json, find this story, and validate it.\n"
        )
    action_directive = (
        "[Validation task] Read scripts/ralph/prd.json and scripts/ralph/progress.txt "
        "(if present), then validate the current story immediately according to the validator rules. "
        "Do not ask follow-up questions or stop for confirmation. "
        "Record issues in the notes field when validation fails."
        f"{story_hint}\n"
        "=== Base rules and project context ===\n"
    )
    prompt = action_directive + file_content
    cmd = build_process_cmd(prompt)
    progress_before = capture_file_state(SCRIPT_DIR / "progress.txt")
    prd_before = load_prd_state()

    try:
        log_fh = open(AGENT_LOG_FILE, "w", encoding="utf-8")
        stdout_buf: list[str] = []
        stderr_buf: list[str] = []

        process = subprocess.Popen(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        out_thread = threading.Thread(
            target=_stream_pipe, args=(process.stdout, log_fh, stdout_buf), daemon=True
        )
        err_thread = threading.Thread(
            target=_stream_pipe, args=(process.stderr, log_fh, stderr_buf), daemon=True
        )
        out_thread.start()
        err_thread.start()

        start_time = time.time()

        while True:
            ret_code = process.poll()
            if ret_code is not None:
                out_thread.join(timeout=5)
                err_thread.join(timeout=5)
                log_fh.close()
                stdout_text = "".join(stdout_buf)
                stderr_text = "".join(stderr_buf)

                if ret_code == 0:
                    validation_status, reasons = validate_validator_completion(
                        progress_before,
                        prd_before,
                        current_story_id,
                    )
                    if validation_status == VAL_PASSED:
                        safe_print("\n验证完成，当前 story 已通过验收。")
                        return VAL_PASSED
                    if validation_status == VAL_FAILED_RECORDED:
                        safe_print("\n验证完成，当前 story 未通过验收，已记录失败结果。")
                        return VAL_FAILED_RECORDED
                    if validation_status == VAL_INCOMPLETE:
                        safe_print("\nValidator 进程已退出，但未完成完整验收。")
                        for reason in reasons:
                            safe_print(f" - {reason}")
                        dump_process_output(stdout_text, stderr_text)
                        return VAL_INCOMPLETE
                    for reason in reasons:
                        safe_print(f" - {reason}")
                    dump_process_output(stdout_text, stderr_text)
                    return VAL_FATAL

                safe_print(f"\nValidator 异常退出，退出码: {ret_code}")
                dump_process_output(stdout_text, stderr_text)
                return VAL_FATAL

            elapsed_time = time.time() - start_time
            if elapsed_time > TIMEOUT_SECONDS * 2:
                safe_print(f"\nValidator 超时! 已运行 {int(elapsed_time)} 秒")
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                out_thread.join(timeout=5)
                err_thread.join(timeout=5)
                log_fh.close()
                stdout_text = "".join(stdout_buf)
                stderr_text = "".join(stderr_buf)
                safe_print("   Validator 进程已终止，稍后继续重试当前验收")
                dump_process_output(stdout_text, stderr_text)
                return VAL_TIMED_OUT

            time.sleep(60)

    except Exception as e:
        safe_print(f"\nValidator 错误: {e}")
        return VAL_FATAL


def get_current_story_id() -> str | None:
    """Return the first story that still requires action."""
    try:
        prd = json.loads(read_utf8_text(PRD_FILE))
        for story in prd.get("userStories", []):
            if story_needs_work(story):
                return story.get("id")
    except Exception:
        pass
    return None


def all_stories_resolved() -> bool:
    """Return True when all stories are blocked or fully clean."""
    try:
        prd = json.loads(read_utf8_text(PRD_FILE))
        stories = prd.get("userStories", [])
        for story in stories:
            if story_needs_work(story):
                return False
        return True
    except Exception as e:
        safe_print(f"读取 prd.json 失败: {e}")
        return False


def format_duration(seconds: float) -> str:
    """Format seconds into a readable duration string."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}小时 {m}分钟 {s}秒"
    if m > 0:
        return f"{m}分钟 {s}秒"
    return f"{s}秒"


def main():
    """Main state machine."""
    configure_console_encoding()
    safe_print(f"启动 Ralph - 最大迭代次数: {MAX_ITERATIONS}")
    total_start_time = time.time()
    rate_limit_count = 0
    current_story: str | None = None
    next_action = NEXT_ACTION_DEVELOP

    dashboard.start(max_iterations=MAX_ITERATIONS)

    for i in range(1, MAX_ITERATIONS + 1):
        try:
            if current_story is None:
                current_story = get_current_story_id()
                if current_story is None:
                    dashboard.set_state(phase="done", current_story=None)
                    elapsed = time.time() - total_start_time
                    safe_print("所有任务已完成或已标记为 BLOCKED!")
                    safe_print(f"总运行时间: {format_duration(elapsed)}")
                    sys.exit(0)
                next_action = NEXT_ACTION_DEVELOP

            if next_action == NEXT_ACTION_DEVELOP:
                dashboard.set_state(iteration=i, phase="developing", current_story=current_story)
                developer_status = run_developer(i, current_story)

                if developer_status == DEV_TIMED_OUT:
                    dashboard.set_state(phase="idle", current_story=current_story)
                    safe_print(f"开发 Agent 超时，继续开发当前 story {current_story}...")
                    time.sleep(2)
                    continue

                if developer_status == DEV_RATE_LIMITED:
                    rate_limit_count += 1
                    backoff_seconds = calculate_backoff_seconds(rate_limit_count)
                    dashboard.set_state(phase="idle", current_story=current_story)
                    safe_print(
                        f"开发 Agent 因限流暂停 {format_duration(backoff_seconds)}，随后继续开发当前 story {current_story}..."
                    )
                    time.sleep(backoff_seconds)
                    continue

                rate_limit_count = 0

                if developer_status == DEV_FATAL:
                    dashboard.set_state(phase="error", current_story=current_story)
                    safe_print("开发阶段发生致命错误，Ralph 终止。")
                    sys.exit(1)

                next_action = NEXT_ACTION_VALIDATE

            dashboard.set_state(iteration=i, phase="validating", current_story=current_story)
            validator_status = run_validator(i, current_story_id=current_story)

            if validator_status == VAL_TIMED_OUT:
                dashboard.set_state(phase="idle", current_story=current_story)
                safe_print(f"Validator 超时，继续验收当前 story {current_story}...")
                next_action = NEXT_ACTION_VALIDATE
                time.sleep(2)
                continue

            if validator_status == VAL_INCOMPLETE:
                dashboard.set_state(phase="idle", current_story=current_story)
                safe_print(f"Validator 未完成完整验收，继续验收当前 story {current_story}...")
                next_action = NEXT_ACTION_VALIDATE
                time.sleep(2)
                continue

            if validator_status == VAL_FAILED_RECORDED:
                dashboard.set_state(phase="idle", current_story=current_story)
                safe_print(f"当前 story {current_story} 验收未通过，下一次迭代继续开发...")
                next_action = NEXT_ACTION_DEVELOP
                time.sleep(2)
                continue

            if validator_status == VAL_FATAL:
                dashboard.set_state(phase="error", current_story=current_story)
                safe_print("验收阶段发生致命错误，Ralph 终止。")
                sys.exit(1)

            dashboard.set_state(phase="idle", current_story=current_story)
            safe_print(f"当前 story {current_story} 已通过验收，准备进入下一个 story...")
            current_story = None
            next_action = NEXT_ACTION_DEVELOP

            if all_stories_resolved():
                dashboard.set_state(phase="done", current_story=None)
                elapsed = time.time() - total_start_time
                safe_print("所有任务已完成或已标记为 BLOCKED!")
                safe_print(f"总运行时间: {format_duration(elapsed)}")
                sys.exit(0)

        except KeyboardInterrupt:
            elapsed = time.time() - total_start_time
            safe_print("\n\n用户中断")
            safe_print(f"总运行时间: {format_duration(elapsed)}")
            sys.exit(130)

    elapsed = time.time() - total_start_time
    safe_print(f"\n已达到最大迭代次数 ({MAX_ITERATIONS})")
    safe_print(f"总运行时间: {format_duration(elapsed)}")
    sys.exit(1)


if __name__ == "__main__":
    main()
