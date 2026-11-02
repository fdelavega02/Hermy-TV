#!/usr/bin/env python3
"""Generic Ctrl+Fn hold-to-talk listener for a local relay HTTP API.

Reads only Ctrl and the configured function keys from one opted-in evdev
keyboard. It does not grab or suppress keyboard input, record general keys,
or send data to a remote service.
"""
from __future__ import annotations

import argparse
import json
import os
import select
import signal
import struct
import threading
import urllib.request
from pathlib import Path

EV_KEY, KEY_LEFTCTRL, KEY_RIGHTCTRL = 0x01, 29, 97
FUNCTION_KEYS = {"F1": 59, "F2": 60, "F3": 61, "F4": 62}
EVENT = struct.Struct("@llHHI")
running = True


def post(server: str, endpoint: str, profile: str) -> None:
    body = json.dumps({"profile": profile}).encode()
    request = urllib.request.Request(
        server.rstrip("/") + endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()


def post_background(server: str, endpoint: str, profile: str) -> None:
    threading.Thread(target=post, args=(server, endpoint, profile), daemon=True).start()


def stop(_signum: int, _frame: object) -> None:
    global running
    running = False


def main() -> int:
    parser = argparse.ArgumentParser(description="Ctrl+Fn local PTT listener")
    parser.add_argument("--config", type=Path, default=Path("config.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    key_profiles = {
        FUNCTION_KEYS[name]: profile
        for name, profile in config["profiles"].items()
        if name in FUNCTION_KEYS
    }
    watched = {KEY_LEFTCTRL, KEY_RIGHTCTRL, *key_profiles}
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    fd = os.open(config["inputDevice"], os.O_RDONLY | os.O_NONBLOCK)
    pressed: set[int] = set()
    active: tuple[int, str] | None = None
    try:
        while running:
            readable, _, _ = select.select([fd], [], [], 0.5)
            if not readable:
                continue
            data = os.read(fd, EVENT.size * 64)
            for offset in range(0, len(data) - EVENT.size + 1, EVENT.size):
                _, _, event_type, code, value = EVENT.unpack_from(data, offset)
                if event_type != EV_KEY or code not in watched:
                    continue
                if value in (1, 2):
                    pressed.add(code)
                elif value == 0:
                    pressed.discard(code)
                else:
                    continue
                ctrl = bool(pressed & {KEY_LEFTCTRL, KEY_RIGHTCTRL})
                if active is None and value == 1 and ctrl and code in key_profiles:
                    active = (code, key_profiles[code])
                    if not args.dry_run:
                        post(config["serverUrl"], "/api/ptt/start", active[1])
                elif active and (not ctrl or active[0] not in pressed):
                    _, profile = active
                    active = None
                    if not args.dry_run:
                        post_background(config["serverUrl"], "/api/ptt/stop", profile)
    finally:
        if active and not args.dry_run:
            post_background(config["serverUrl"], "/api/ptt/stop", active[1])
        os.close(fd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
