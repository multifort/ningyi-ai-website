#!/usr/bin/env python3
"""Repeatable, external-network-free browser coverage for the product journey."""

from __future__ import annotations

import json
import os
import re
import signal
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
WORKER_SECRET = "e2e-worker-secret-0123456789abcdef"
USERNAME = "e2e-owner"
PASSWORD = "E2E-owner-password-2026"


class MockState:
    fail_formal = False


class MockOpenAIHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        schema_name = body.get("text", {}).get("format", {}).get("name", "")
        if MockState.fail_formal and schema_name.startswith("formal_section"):
            self._json(503, {"error": {"message": "intentional e2e retry signal"}})
            return
        if schema_name == "free_project_analysis":
            output = {
                "summary": "已依据提交材料完成初步梳理，后续将继续核对范围、流程和验收标准。",
                "problemStatement": "当前跨部门项目材料分散，需要形成可追溯且一致的项目成果。",
                "goals": ["统一项目事实", "形成七类成果", "保留来源关系"],
                "risks": ["范围和验收标准需要保持一致"],
                "missingInformation": ["正式上线窗口"],
                "recommendedNextStep": "继续形成正式方案并检查成果一致性。",
            }
        elif schema_name.startswith("formal_section"):
            output = formal_output(body)
        else:
            output = {}
        self._json(200, {"id": "resp_e2e", "output_text": json.dumps(output, ensure_ascii=False), "usage": {"input_tokens": 120, "output_tokens": 240}})

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _json(self, status: int, payload: dict) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def formal_output(body: dict) -> dict:
    title = str(body.get("prompt_cache_key", "formal-section-项目方案")).removeprefix("formal-section-")
    input_text = str(body.get("input", ""))
    allowed = re.search(r"本章允许使用[^\n]*\n([^\n]+)", input_text)
    candidates = re.split(r"[、,，\s]+", allowed.group(1).strip()) if allowed else []
    source_id = next((value for value in candidates if value), "")
    if not source_id:
        bracketed = re.search(r"\[([0-9a-f-]{20,})\]", input_text, re.I)
        source_id = bracketed.group(1) if bracketed else "missing-source"

    item_map = {
        "范围、用户与关键约束": [
            item("requirement", "REQ-001", "统一项目范围", source_id),
            item("feature", "FEAT-001", "范围追踪", source_id, [("requirement_codes", "REQ-001")]),
        ],
        "业务需求与功能规划": [
            item("requirement", "REQ-002", "成果一致性", source_id),
            item("feature", "FEAT-002", "成果生成", source_id, [("requirement_codes", "REQ-002")]),
        ],
        "整体解决方案": [item("feature", "FEAT-003", "来源追溯", source_id, [("requirement_codes", "REQ-002")])],
        "工作量与成本依据": [item("estimation_item", "EST-001", "成果实现工作量", source_id, [("feature_codes", "FEAT-002,FEAT-003")])],
        "实施计划与交付安排": [
            item("phase", "PHASE-001", "实施与验证", source_id, [("estimation_codes", "EST-001")]),
            item("milestone", "MILESTONE-001", "成果验收", source_id, [("phase_codes", "PHASE-001")]),
        ],
        "风险、假设与待确认事项": [item("risk", "RISK-001", "范围变化风险", source_id, [("requirement_codes", "REQ-002")])],
    }
    sentence = f"{title}以用户提交的项目说明和材料为唯一事实基础，围绕范围、角色、流程、成果、来源和验收关系进行结构化说明。"
    content = "".join(f"{sentence}系统保留证据引用，区分已经明确的信息、合理约束和需要用户确认的关键方向。" for _ in range(12))
    summary = f"{title}已依据项目材料形成连续、可追溯的章节内容，并明确范围、依据、关系及后续确认边界。"
    claims = [
        {"text": f"{title}只使用当前项目材料形成。", "sourceBlockIds": [source_id]},
        {"text": "成果对象保持统一来源关系。", "sourceBlockIds": [source_id]},
        {"text": "关键方向由用户确认。", "sourceBlockIds": [source_id]},
    ]
    return {"content": content, "summary": summary, "claims": claims, "items": item_map.get(title, [])}


def item(kind: str, code: str, title: str, source_id: str, attributes: list[tuple[str, str]] | None = None) -> dict:
    return {
        "kind": kind,
        "code": code,
        "title": title,
        "description": f"依据项目材料形成的{title}。",
        "sourceBlockIds": [source_id],
        "attributes": [{"key": key, "value": value} for key, value in (attributes or [])],
    }


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_http(url: str, process: subprocess.Popen, timeout: float = 45) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"app server exited with {process.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise TimeoutError(f"server did not become ready: {url}")


def worker_tick(origin: str) -> dict:
    request = urllib.request.Request(
        f"{origin}/api/product/internal/pipeline/tick?sourceLimit=2&mediaLimit=2&formalLimit=1",
        method="POST",
        headers={"authorization": f"Bearer {WORKER_SECRET}"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read())


def browser_progress(page: Page, solution_id: str) -> dict:
    return page.evaluate(
        """async (id) => {
          const response = await fetch(`/api/product/solutions/${id}/progress`);
          return { status: response.status, body: await response.json() };
        }""",
        solution_id,
    )


def wait_for_completed(page: Page, origin: str, solution_id: str, timeout: float = 150) -> dict:
    deadline = time.time() + timeout
    latest = {}
    while time.time() < deadline:
        worker_tick(origin)
        latest = browser_progress(page, solution_id)
        data = latest.get("body", {}).get("data", {})
        if data.get("stage") == "completed" and data.get("status") == "completed":
            return data
        if data.get("status") in {"blocked", "failed"}:
            raise AssertionError(f"solution entered terminal failure: {data.get('status')} / {data.get('stage')}")
        time.sleep(0.15)
    raise TimeoutError(f"solution did not complete; latest={latest}")


def create_recovery_solution(page: Page) -> str:
    return page.evaluate(
        """async () => {
          const handoff = await fetch('/api/product/intake/handoff', {
            method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              draftId: crypto.randomUUID(), purposePrimary: '内部立项',
              needDescription: '验证正式生成失败后由系统自动重试，并向用户展示恢复状态。',
              formData: {organizationName: 'E2E 恢复项目'}, fileSelections: []
            })
          }).then((response) => response.json());
          if (!handoff.success) throw new Error(JSON.stringify(handoff));
          const queued = await fetch(`/api/product/solutions/${handoff.data.solutionId}/process`, {method: 'POST'});
          if (!queued.ok) throw new Error(await queued.text());
          return handoff.data.solutionId;
        }"""
    )


def register_from_workspace(page: Page, username: str, password: str) -> None:
    page.goto("/product", wait_until="networkidle")
    page.get_by_role("tab", name="注册新账号").click()
    page.get_by_label("用户名").fill(username)
    page.locator('input[autocomplete="new-password"]').fill(password)
    page.get_by_role("button", name="注册并进入").click()
    expect(page.get_by_role("heading", name="我的成果", exact=True)).to_be_visible(timeout=15_000)


def login_from_workspace(page: Page, username: str, password: str) -> None:
    page.goto("/product", wait_until="networkidle")
    page.get_by_label("用户名").fill(username)
    page.locator('input[autocomplete="current-password"]').fill(password)
    page.get_by_role("button", name="登录并查看成果").click()
    expect(page.get_by_role("heading", name="我的成果", exact=True)).to_be_visible(timeout=15_000)


def assert_mobile_layout(context: BrowserContext, origin: str) -> None:
    page = context.new_page()
    page.goto(f"{origin}/product/start", wait_until="networkidle")
    expect(page.get_by_role("heading", name=re.compile("说清楚你要解决的问题"))).to_be_visible()
    width = page.evaluate("document.documentElement.scrollWidth")
    assert width <= 391, f"mobile page overflows horizontally: {width}px"
    expect(page.get_by_role("button", name="开启你的定制之旅")).to_be_visible()
    page.close()


def run_browser(origin: str, temp_root: Path) -> dict:
    chrome = os.environ.get("PRODUCT_E2E_CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    launch = {"headless": True}
    if Path(chrome).exists():
        launch["executable_path"] = chrome
    console_errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch)
        owner = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True, base_url=origin)
        page = owner.new_page()
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: console_errors.append(str(error)))

        page.goto("/product/start", wait_until="networkidle")
        page.get_by_role("button", name="客户沟通").click()
        problem = page.get_by_placeholder(re.compile("请尽量描述清楚"))
        problem.fill("需要把分散的项目说明统一为可追溯成果，并验证上传、处理、下载和删除流程。")
        page.reload(wait_until="networkidle")
        expect(problem).to_have_value(re.compile("可追溯成果"))
        expect(page.get_by_role("button", name="客户沟通")).to_have_attribute("aria-pressed", "true")

        source_file = temp_root / "e2e-source.txt"
        source_file.write_text("项目需要统一材料、生成七类成果、保留来源关系，并支持下载和删除。", encoding="utf-8")
        page.locator('label[aria-label="上传项目材料"] input[type="file"]').set_input_files(str(source_file))
        expect(page.get_by_text("e2e-source.txt", exact=True)).to_be_visible()
        page.get_by_role("button", name="开启你的定制之旅").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name="注册新账号").click()
        dialog.get_by_label("用户名").fill(USERNAME)
        dialog.get_by_label("密码", exact=True).fill(PASSWORD)
        dialog.get_by_label("再次输入密码").fill(PASSWORD)
        dialog.get_by_role("button", name="注册并继续").click()
        expect(dialog.get_by_text("已经开始处理")).to_be_visible(timeout=30_000)
        solution_text = dialog.get_by_text(re.compile("方案编号：")).inner_text()
        solution_id = solution_text.split("：", 1)[1].strip()
        dialog.get_by_role("button", name="查看方案进度").click()
        page.wait_for_url(re.compile(f"/product/solutions/{solution_id}$"), timeout=15_000)

        completed = wait_for_completed(page, origin, solution_id)
        page.reload(wait_until="networkidle")
        expect(page.get_by_text("7 / 7 已可下载", exact=True)).to_be_visible(timeout=20_000)
        expect(page.get_by_role("heading", name="首批成果已经可以使用")).to_be_visible()
        with page.expect_download(timeout=20_000) as download_info:
            page.get_by_role("button", name="下载成果").first.click()
        download = download_info.value
        download_path = Path(download.path())
        assert download_path.stat().st_size > 100, "downloaded artifact is unexpectedly empty"

        other = browser.new_context(viewport={"width": 1280, "height": 900}, base_url=origin)
        other_page = other.new_page()
        register_from_workspace(other_page, "e2e-other", "E2E-other-password-2026")
        isolation = other_page.evaluate(
            """async (id) => {
              const session = await fetch('/api/product/auth/session').then((response) => response.json());
              const response = await fetch(`/api/product/solutions/${id}/progress`);
              return {session, status: response.status, body: await response.json()};
            }""",
            solution_id,
        )
        assert isolation["session"].get("data", {}).get("user", {}).get("username") == "e2e-other", isolation
        assert isolation["status"] == 404 and isolation["body"].get("error", {}).get("code") == "SOLUTION_NOT_FOUND", isolation
        other.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, base_url=origin)
        assert_mobile_layout(mobile, origin)
        mobile.close()

        recovery_id = create_recovery_solution(page)
        MockState.fail_formal = True
        recovery = None
        for _ in range(12):
            worker_tick(origin)
            recovery_payload = browser_progress(page, recovery_id)
            recovery = recovery_payload.get("body", {}).get("data", {}).get("recovery")
            if recovery:
                break
            time.sleep(0.15)
        MockState.fail_formal = False
        assert recovery, "formal provider failure did not produce an automatic recovery state"
        page.goto(f"/product/solutions/{recovery_id}", wait_until="networkidle")
        expect(page.get_by_text("无需停留在此页面，也无需重新提交材料。")).to_be_visible()

        owner.close()
        login_context = browser.new_context(viewport={"width": 1280, "height": 900}, base_url=origin)
        login_page = login_context.new_page()
        login_from_workspace(login_page, USERNAME, PASSWORD)
        completed_title = completed["title"]
        card = login_page.locator("div.group", has_text=completed_title)
        expect(card).to_be_visible()
        dialog_count = 0

        def accept_delete(dialog_event) -> None:
            nonlocal dialog_count
            dialog_count += 1
            if dialog_event.type == "prompt":
                dialog_event.accept(PASSWORD)
            else:
                dialog_event.accept()

        login_page.on("dialog", accept_delete)
        card.get_by_role("button", name="删除").click()
        expect(card).to_have_count(0, timeout=15_000)
        assert dialog_count == 2, f"expected confirm and password prompt, got {dialog_count} dialogs"
        login_page.goto(f"/product/solutions/{solution_id}", wait_until="networkidle")
        expect(login_page.get_by_role("heading", name="这份方案不存在或无法访问")).to_be_visible()
        login_context.close()
        browser.close()

    assert not console_errors, f"browser console errors: {console_errors}"
    return {"solutionId": solution_id, "recoverySolutionId": recovery_id, "artifactCount": len(completed.get("deliverables", [])), "consoleErrors": 0}


def main() -> None:
    MockState.fail_formal = False
    app_port, mock_port = free_port(), free_port()
    origin = f"http://127.0.0.1:{app_port}"
    mock = ThreadingHTTPServer(("127.0.0.1", mock_port), MockOpenAIHandler)
    mock_thread = threading.Thread(target=mock.serve_forever, daemon=True)
    mock_thread.start()
    with tempfile.TemporaryDirectory(prefix="ningyi-product-e2e-") as directory:
        temp_root = Path(directory)
        (temp_root / "storage").mkdir()
        (temp_root / "backups").mkdir()
        log_path = temp_root / "next.log"
        environment = os.environ.copy()
        environment.update({
            "PRODUCT_APP_ORIGIN": origin,
            "PRODUCT_DB_PATH": str(temp_root / "product.db"),
            "PRODUCT_PRIVATE_STORAGE_PATH": str(temp_root / "storage"),
            "PRODUCT_BACKUP_PATH": str(temp_root / "backups"),
            "PRODUCT_SESSION_SECRET": "e2e-session-secret-0123456789abcdef",
            "PRODUCT_WORKER_SECRET": WORKER_SECRET,
            "PRODUCT_DOWNLOAD_SECRET": "e2e-download-secret-0123456789abcdef",
            "PRODUCT_BACKUP_ENCRYPTION_KEY": "e2e-backup-secret-0123456789abcdef",
            "OPENAI_API_KEY": "e2e-local-key",
            "OPENAI_BASE_URL": f"http://127.0.0.1:{mock_port}/v1",
            "PRODUCT_FREE_MODEL_PROVIDER": "openai",
            "PRODUCT_FREE_MODEL": "e2e-free",
            "PRODUCT_FORMAL_MODEL_PROVIDER": "openai",
            "PRODUCT_FORMAL_MODEL": "e2e-formal",
            "PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED": "false",
            "PRODUCT_FORMAL_BATCH_CONCURRENCY": "1",
            "PRODUCT_FORMAL_CONCURRENCY": "1",
            "PRODUCT_SOURCE_BATCH_CONCURRENCY": "1",
            "PRODUCT_PYTHON_PATH": os.sys.executable,
        })
        if os.environ.get("PRODUCT_E2E_SKIP_BUILD") != "1":
            # Build with the repository's normal build-time environment. Using
            # a brand-new SQLite path here lets parallel Next.js collectors all
            # attempt first-run migrations and can cause a false SQLITE_BUSY.
            subprocess.run(["pnpm", "build"], cwd=ROOT, env=os.environ.copy(), check=True)
        with log_path.open("w", encoding="utf-8") as log:
            app = subprocess.Popen(
                ["pnpm", "exec", "next", "start", "-p", str(app_port)],
                cwd=ROOT,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                text=True,
            )
            try:
                wait_for_http(f"{origin}/product/start", app)
                result = run_browser(origin, temp_root)
                print(json.dumps({"passed": True, **result}, ensure_ascii=False))
            except Exception:
                screenshot_note = temp_root / "failure-location.txt"
                screenshot_note.write_text(f"See server log: {log_path}\n", encoding="utf-8")
                log.flush()
                tail = log_path.read_text(encoding="utf-8", errors="replace")[-6000:]
                print(tail)
                raise
            finally:
                if app.poll() is None:
                    os.killpg(app.pid, signal.SIGTERM)
                    try:
                        app.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(app.pid, signal.SIGKILL)
    mock.shutdown()
    mock.server_close()


if __name__ == "__main__":
    main()
