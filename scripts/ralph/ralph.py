#!/usr/bin/env python3
"""
Ralph - 自主 AI Agent 循环执行器（含 Validator）
"""

import json
import os
import platform
import shutil
import sys
import subprocess
import time
from pathlib import Path

import dashboard

# 配置
MAX_ITERATIONS = 50
TIMEOUT_SECONDS = 30 * 60
RATE_LIMIT_BACKOFF_SECONDS = int(os.environ.get("RALPH_RATE_LIMIT_BACKOFF_SECONDS", "180"))
MAX_RATE_LIMIT_BACKOFF_SECONDS = int(os.environ.get("RALPH_MAX_RATE_LIMIT_BACKOFF_SECONDS", "1800"))

# Agent 选择：支持 "claude"（默认）或 "codex"
# 用法：python ralph.py [codex]
AGENT = sys.argv[1] if len(sys.argv) > 1 else "claude"

RUN_COMPLETED = "completed"
RUN_TIMED_OUT = "timed_out"
RUN_LAUNCH_FAILED = "launch_failed"
RUN_RATE_LIMITED = "rate_limited"
OUTPUT_TAIL_CHARS = 4000


def configure_console_encoding() -> None:
    """尽量统一当前进程与子进程的 UTF-8 行为，减少 Windows 乱码。"""
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
    """在控制台编码不可靠时降级输出，避免打印本身再次抛错。"""
    try:
        print(message)
    except UnicodeEncodeError:
        sanitized = message.encode("ascii", errors="ignore").decode("ascii")
        print(sanitized)


def read_utf8_text(path: Path) -> str:
    """统一按 UTF-8/BOM 读取文本，避免 Windows 默认编码干扰。"""
    return path.read_text(encoding="utf-8-sig")


def tail_text(text: str | None, limit: int = OUTPUT_TAIL_CHARS) -> str:
    """截取输出尾部，避免异常时刷屏。"""
    if not text:
        return ""
    return text[-limit:]


def dump_process_output(stdout_text: str | None, stderr_text: str | None) -> None:
    """输出子进程尾部日志，方便排查异常退出原因。"""
    stdout_tail = tail_text(stdout_text)
    stderr_tail = tail_text(stderr_text)

    if stdout_tail:
        safe_print("\n--- Agent stdout tail ---")
        safe_print(stdout_tail)

    if stderr_tail:
        safe_print("\n--- Agent stderr tail ---")
        safe_print(stderr_tail)


def is_rate_limited(stdout_text: str | None, stderr_text: str | None) -> bool:
    """识别常见的上游限流错误，避免把瞬时 429 当作致命失败。"""
    combined = "\n".join(filter(None, [stdout_text, stderr_text])).lower()
    if not combined:
        return False

    rate_limit_markers = (
        "api error: 429",
        "\"code\":\"1302\"",
        "\"code\": \"1302\"",
        "rate limit",
        "速率限制",
        "达到速率限制",
    )
    return any(marker in combined for marker in rate_limit_markers)


def calculate_backoff_seconds(rate_limit_count: int) -> int:
    """对连续限流做指数退避，避免持续撞上游配额。"""
    multiplier = max(0, rate_limit_count - 1)
    return min(MAX_RATE_LIMIT_BACKOFF_SECONDS, RATE_LIMIT_BACKOFF_SECONDS * (2 ** multiplier))


def load_prd_state() -> dict | None:
    """读取当前 PRD 状态；失败时返回 None。"""
    try:
        return json.loads(read_utf8_text(PRD_FILE))
    except Exception:
        return None


def capture_story_status(prd: dict | None) -> dict[str, tuple[bool, bool, int, str]]:
    """提取每个 story 的关键状态，便于比较开发前后是否真的推进。"""
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
    """记录文件存在性、大小和修改时间，避免把空跑当成功。"""
    if not path.exists():
        return (False, None, None)

    stat = path.stat()
    return (True, stat.st_size, stat.st_mtime_ns)


def did_story_progress_change(before_prd: dict | None, after_prd: dict | None) -> bool:
    """检查 PRD 中是否至少有一个 story 状态发生了真实变化。"""
    before_status = capture_story_status(before_prd)
    after_status = capture_story_status(after_prd)
    return before_status != after_status


def validate_developer_completion(
    progress_before: tuple[bool, int | None, int | None],
    prd_before: dict | None,
) -> tuple[bool, list[str]]:
    """校验开发 Agent 是否真的按约定产出状态文件。"""
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


def extract_latest_story_id_from_progress(progress_text: str | None) -> str | None:
    """从 progress.txt 最后一个 section 标题中提取 story ID。"""
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


def get_story_status(prd: dict | None, story_id: str | None) -> tuple[bool, bool, int, str] | None:
    """获取指定 story 的关键状态。"""
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
) -> tuple[bool, list[str]]:
    """校验 Validator 是否真的对最后一个 story 做了验收。"""
    reasons: list[str] = []

    progress_path = SCRIPT_DIR / "progress.txt"
    progress_after_state = capture_file_state(progress_path)
    if not progress_after_state[0]:
        reasons.append("验证阶段找不到 scripts/ralph/progress.txt")
        return (False, reasons)

    if progress_after_state == progress_before:
        reasons.append("Validator 没有向 scripts/ralph/progress.txt 追加验收记录")
        return (False, reasons)

    progress_text = read_utf8_text(progress_path)
    story_id = extract_latest_story_id_from_progress(progress_text)
    if not story_id:
        reasons.append("无法从 scripts/ralph/progress.txt 最后一条记录提取 story ID")
        return (False, reasons)

    prd_after = load_prd_state()
    if prd_after is None:
        reasons.append("验证后无法读取 scripts/ralph/prd.json")
        return (False, reasons)

    before_story_status = get_story_status(prd_before, story_id)
    after_story_status = get_story_status(prd_after, story_id)
    if after_story_status is None:
        reasons.append(f"scripts/ralph/prd.json 中不存在 story {story_id}")
        return (False, reasons)

    if before_story_status is None:
        reasons.append(f"验证前无法定位 story {story_id}")
        return (False, reasons)

    if after_story_status == before_story_status:
        passes, _blocked, retry_count, notes = after_story_status
        # 验收成功时，若 story 已处于最终通过态，Validator 合法地可能不改 PRD。
        if not (passes and retry_count == 0 and notes == ""):
            reasons.append(f"Validator 未对 story {story_id} 的验收状态产生任何变化")

    return (len(reasons) == 0, reasons)


def resolve_cli_command(command_name: str) -> str:
    """解析 Windows/npm shim 命令，优先返回可直接执行的真实路径。"""
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
    """根据 AGENT 配置构建命令"""
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
    """按平台构建子进程命令，Unix 使用 script，Windows 直接运行。"""
    cmd = build_cmd(prompt)

    if platform.system() == "Windows":
        return cmd

    script_path = shutil.which("script")
    if script_path:
        return [script_path, "-q", "/dev/null"] + cmd

    return cmd

# 目录配置
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent
CLAUDE_INSTRUCTION_FILE = SCRIPT_DIR / "CLAUDE.md"
VALIDATOR_INSTRUCTION_FILE = SCRIPT_DIR / "VALIDATOR.md"
PRD_FILE = SCRIPT_DIR / "prd.json"


def run_developer(iteration: int) -> str:
    """
    调用开发 Agent
    返回值：completed | timed_out | launch_failed
    """
    safe_print(f"\n{'='*64}\n  迭代 {iteration}/{MAX_ITERATIONS}\n{'='*64}")

    if not CLAUDE_INSTRUCTION_FILE.exists():
        safe_print(f"错误: {CLAUDE_INSTRUCTION_FILE} 不存在")
        return RUN_LAUNCH_FAILED

    prompt = read_utf8_text(CLAUDE_INSTRUCTION_FILE)
    cmd = build_process_cmd(prompt)
    progress_before = capture_file_state(SCRIPT_DIR / "progress.txt")
    prd_before = load_prd_state()

    try:
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

        start_time = time.time()

        while True:
            ret_code = process.poll()
            if ret_code is not None:
                stdout_text, stderr_text = process.communicate()
                if ret_code == 0:
                    completion_ok, reasons = validate_developer_completion(
                        progress_before,
                        prd_before,
                    )
                    if completion_ok:
                        safe_print("\n开发迭代完成")
                        return RUN_COMPLETED

                    safe_print("\n开发 Agent 进程已退出，但未完成 Ralph 约定的产物更新。")
                    for reason in reasons:
                        safe_print(f" - {reason}")
                    dump_process_output(stdout_text, stderr_text)
                    return RUN_LAUNCH_FAILED

                if is_rate_limited(stdout_text, stderr_text):
                    safe_print("\n开发 Agent 遇到上游 API 限流 (429)，本次视为可恢复错误。")
                    dump_process_output(stdout_text, stderr_text)
                    return RUN_RATE_LIMITED

                safe_print(f"\n开发 Agent 异常退出，退出码: {ret_code}")
                dump_process_output(stdout_text, stderr_text)
                return RUN_LAUNCH_FAILED

            elapsed_time = time.time() - start_time
            if elapsed_time > TIMEOUT_SECONDS:
                safe_print(f"\n开发 Agent 超时! 已运行 {int(elapsed_time)} 秒")
                process.terminate()
                try:
                    stdout_text, stderr_text = process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout_text, stderr_text = process.communicate()
                safe_print("   进程已终止，将在下一次迭代重试")
                dump_process_output(stdout_text, stderr_text)
                return RUN_TIMED_OUT

            time.sleep(60)

    except Exception as e:
        safe_print(f"\n开发 Agent 错误: {e}")
        return RUN_LAUNCH_FAILED

def run_validator(iteration: int) -> str:
    """
    调用 Validator Agent，由其自行读取 progress.txt 中最后一个 story 进行验证
    """
    safe_print(f"\n{'='*64}\n  验证迭代 {iteration} - Validator 开始工作\n{'='*64}")

    if not VALIDATOR_INSTRUCTION_FILE.exists():
        safe_print(f"警告: {VALIDATOR_INSTRUCTION_FILE} 不存在，跳过验证")
        return RUN_LAUNCH_FAILED

    prompt = read_utf8_text(VALIDATOR_INSTRUCTION_FILE)
    cmd = build_process_cmd(prompt)
    progress_before = capture_file_state(SCRIPT_DIR / "progress.txt")
    prd_before = load_prd_state()

    try:
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

        start_time = time.time()

        while True:
            ret_code = process.poll()
            if ret_code is not None:
                stdout_text, stderr_text = process.communicate()
                if ret_code == 0:
                    completion_ok, reasons = validate_validator_completion(
                        progress_before,
                        prd_before,
                    )
                    if completion_ok:
                        safe_print("\n验证完成")
                        return RUN_COMPLETED

                    safe_print("\nValidator 进程已退出，但未完成有效验收。")
                    for reason in reasons:
                        safe_print(f" - {reason}")
                    dump_process_output(stdout_text, stderr_text)
                    return RUN_LAUNCH_FAILED

                safe_print(f"\nValidator 异常退出，退出码: {ret_code}")
                dump_process_output(stdout_text, stderr_text)
                return RUN_LAUNCH_FAILED

            elapsed_time = time.time() - start_time
            if elapsed_time > TIMEOUT_SECONDS * 2:
                safe_print(f"\nValidator 超时! 已运行 {int(elapsed_time)} 秒")
                process.terminate()
                try:
                    stdout_text, stderr_text = process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout_text, stderr_text = process.communicate()
                safe_print("   Validator 进程已终止，跳过本次验证")
                dump_process_output(stdout_text, stderr_text)
                return RUN_TIMED_OUT

            time.sleep(60)

    except Exception as e:
        safe_print(f"\nValidator 错误: {e}")
        return RUN_LAUNCH_FAILED
def get_current_story_id() -> str | None:
    """返回 prd.json 中第一个 passes=False 且 blocked=False 的 story ID"""
    try:
        prd = json.loads(read_utf8_text(PRD_FILE))
        for story in prd.get("userStories", []):
            if not story.get("passes", False) and not story.get("blocked", False):
                return story.get("id")
    except Exception:
        pass
    return None


def all_stories_resolved() -> bool:
    """
    检查 prd.json，判断是否所有 story 都已完成或被 blocked
    """
    try:
        prd = json.loads(read_utf8_text(PRD_FILE))
        stories = prd.get("userStories", [])
        for story in stories:
            passes = story.get("passes", False)
            blocked = story.get("blocked", False)
            if not passes and not blocked:
                return False
        return True
    except Exception as e:
        safe_print(f"读取 prd.json 失败: {e}")
        return False


def format_duration(seconds: float) -> str:
    """将秒数格式化为易读的时间字符串"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}小时 {m}分钟 {s}秒"
    elif m > 0:
        return f"{m}分钟 {s}秒"
    else:
        return f"{s}秒"


def main():
    """主函数"""
    configure_console_encoding()
    safe_print(f"启动 Ralph - 最大迭代次数: {MAX_ITERATIONS}")
    total_start_time = time.time()
    rate_limit_count = 0

    dashboard.start(max_iterations=MAX_ITERATIONS)

    for i in range(1, MAX_ITERATIONS + 1):
        try:
            # 第一步：调用开发 Agent
            current_story = get_current_story_id()
            dashboard.set_state(iteration=i, phase="developing", current_story=current_story)
            developer_status = run_developer(i)

            # 开发 Agent 超时，跳过 Validator，直接进入下一次迭代重试
            if developer_status == RUN_TIMED_OUT:
                dashboard.set_state(phase="idle")
                safe_print("开发 Agent 超时，跳过验证，下一次迭代继续开发...")
                time.sleep(2)
                continue

            if developer_status == RUN_RATE_LIMITED:
                rate_limit_count += 1
                backoff_seconds = calculate_backoff_seconds(rate_limit_count)
                dashboard.set_state(phase="idle")
                safe_print(
                    f"开发 Agent 因限流暂停 {format_duration(backoff_seconds)}，随后自动重试..."
                )
                time.sleep(backoff_seconds)
                continue

            rate_limit_count = 0

            if developer_status == RUN_LAUNCH_FAILED:
                dashboard.set_state(phase="error")
                safe_print("开发 Agent 启动失败或异常退出，本次迭代终止，不进入验证阶段。")
                sys.exit(1)

            # 第二步：开发 Agent 正常完成，调用 Validator Agent
            dashboard.set_state(phase="validating")
            validator_status = run_validator(i)

            if validator_status == RUN_TIMED_OUT:
                dashboard.set_state(phase="error")
                safe_print("Validator 超时，本次迭代终止。")
                sys.exit(1)

            if validator_status == RUN_LAUNCH_FAILED:
                dashboard.set_state(phase="error")
                safe_print("Validator 验收失败或异常退出，本次迭代终止。")
                sys.exit(1)

            # 第三步：检查是否全部完成（passes:true 或 blocked:true）
            dashboard.set_state(phase="idle")
            if all_stories_resolved():
                dashboard.set_state(phase="done")
                elapsed = time.time() - total_start_time
                safe_print("所有任务已完成或已标记为 BLOCKED!")
                safe_print(f"总运行时间: {format_duration(elapsed)}")
                sys.exit(0)

        except KeyboardInterrupt:
            elapsed = time.time() - total_start_time
            safe_print(f"\n\n用户中断")
            safe_print(f"总运行时间: {format_duration(elapsed)}")
            sys.exit(130)

    elapsed = time.time() - total_start_time
    safe_print(f"\n已达到最大迭代次数 ({MAX_ITERATIONS})")
    safe_print(f"总运行时间: {format_duration(elapsed)}")
    sys.exit(1)


if __name__ == "__main__":
    main()
