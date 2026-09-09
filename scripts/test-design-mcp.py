"""Smoke-test project design MCPs with isolated browsers, without contacting the app.

Requires Python 3.11+ and the Node/Chrome prerequisites of .codex/config.toml.
Only subprocess trees started by this script are terminated on Windows.
"""

import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import tomllib


ROOT = Path(__file__).resolve().parents[1]


def check_server(name, config):
    messages = queue.Queue()
    environment = dict(os.environ, **config.get("env", {}))
    process = subprocess.Popen(
        [config["command"], *config["args"]],
        cwd=ROOT, env=environment, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )

    def read_messages():
        for line in process.stdout:
            try:
                messages.put(json.loads(line))
            except json.JSONDecodeError:
                continue
        messages.put(None)

    threading.Thread(target=read_messages, daemon=True).start()
    sequence = 0

    def send(payload):
        process.stdin.write(json.dumps({"jsonrpc": "2.0", **payload}) + "\n")
        process.stdin.flush()

    def request(method, params):
        nonlocal sequence
        sequence += 1
        send({"id": sequence, "method": method, "params": params})
        deadline = time.monotonic() + 55
        while time.monotonic() < deadline:
            message = messages.get(timeout=max(0.01, deadline - time.monotonic()))
            if message is None:
                raise RuntimeError("Server exited before replying")
            if message.get("method"):
                if "id" in message:
                    # The browser servers may ask for the workspace roots.
                    if message["method"] == "roots/list":
                        send({"id": message["id"], "result": {"roots": [
                            {"uri": ROOT.as_uri(), "name": ROOT.name}
                        ]}})
                    else:
                        send({"id": message["id"], "error": {
                            "code": -32601, "message": "Method not supported"
                        }})
                continue
            if message.get("id") == sequence:
                if "error" in message:
                    raise RuntimeError(str(message["error"]))
                result = message["result"]
                if result.get("isError"):
                    raise RuntimeError(str(result.get("content")))
                return result
        raise TimeoutError(method)

    try:
        request("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {"roots": {}},
            "clientInfo": {"name": "vaiviral-design-smoke", "version": "1.0"},
        })
        send({"method": "notifications/initialized"})
        available = request("tools/list", {})["tools"]
        names = {tool["name"] for tool in available}
        tool = "browser_navigate" if name == "playwright" else "list_pages"
        if tool not in names:
            raise RuntimeError(f"Expected tool missing: {tool}")
        arguments = {"url": "about:blank"} if name == "playwright" else {}
        request("tools/call", {"name": tool, "arguments": arguments})
        if name == "playwright":
            request("tools/call", {"name": "browser_snapshot", "arguments": {}})
            request("tools/call", {"name": "browser_close", "arguments": {}})
        print(f"PASS {name}: handshake, {len(names)} tools, isolated browser", flush=True)
    finally:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW, timeout=15, check=False,
            )
        elif process.poll() is None:
            process.terminate()
        process.wait(timeout=15)
        process.stdin.close()
        process.stdout.close()


if __name__ == "__main__":
    configuration = tomllib.loads((ROOT / ".codex/config.toml").read_text("utf-8"))
    failures = []
    for server in ("playwright", "chrome-devtools"):
        try:
            check_server(server, configuration["mcp_servers"][server])
        except Exception as error:
            failures.append(server)
            print(f"FAIL {server}: {type(error).__name__}: {error}", flush=True)
    raise SystemExit(1 if failures else 0)
