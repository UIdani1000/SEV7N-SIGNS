"""
High Risk session watcher: while a session is active, check its markets every minute on the server and send new
scalp entries to Telegram, so alerts arrive even when the app is closed. Single-user app on one gunicorn worker,
so the session lives in memory; the app re-sends it on every poll, which restores it after a restart.
"""
import os, threading, time
from datetime import datetime, timezone
import requests

STATE = {"session": None, "sent": set(), "thread": None, "last_check": None, "last_error": None, "stopped": set()}
LOCK = threading.Lock()
MAX_MINUTES = 240


def set_session(symbols, end_at, sid=None):
    import scalp as SC
    syms = [s for s in symbols if s in SC.SCALP_MARKETS][:5]
    end = datetime.fromisoformat(end_at.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    if not syms or end <= now:
        raise ValueError("Give 1-5 High Risk markets and an end time in the future")
    if (end - now).total_seconds() > MAX_MINUTES * 60:
        raise ValueError(f"Sessions are limited to {MAX_MINUTES} minutes")
    with LOCK:
        if sid and sid in STATE["stopped"]:
            raise ValueError("This session was already ended")      # a late registration must not revive it
        STATE["session"] = {"symbols": syms, "end_at": end.isoformat(), "sid": sid}
        if not STATE["thread"] or not STATE["thread"].is_alive():
            STATE["thread"] = threading.Thread(target=_loop, daemon=True, name="hr-watcher"); STATE["thread"].start()
    return status()


def clear_session(sid=None):
    with LOCK:
        if sid:
            STATE["stopped"].add(sid)
            if len(STATE["stopped"]) > 200: STATE["stopped"] = set(list(STATE["stopped"])[-100:])
        if not sid or not STATE["session"] or STATE["session"].get("sid") in (sid, None):
            STATE["session"] = None
    return status()


def status():
    s = STATE["session"]
    active = bool(s and datetime.fromisoformat(s["end_at"]) > datetime.now(timezone.utc))
    return {"active": active, "session": s if active else None, "telegram": bool(os.environ.get("TELEGRAM_CHAT_ID")),
            "last_check": STATE["last_check"], "last_error": STATE["last_error"]}


def _text(sym, setup):
    import strategies as S
    side = "BUY" if setup["side"] == "long" else "SELL"
    return (f"🚨 HIGH RISK (paper only)\n{side} {S.TICKERS[sym]} now\nEntry {S._round(setup['entry'], setup['entry'])}\n"
            f"Stop {S._round(setup['sl'], setup['entry'])}\nTarget {S._round(setup['tp'], setup['entry'])} (1:{setup['rr']:g})\n"
            f"Close by {setup['expires'][11:16]} UTC if neither hits.\nTested: 38% wins, -0.21R per scalp after spreads.")


def _send(text):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if token and chat:
        requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text}, timeout=15)


def check_once():
    import scalp as SC, strategies as S
    s = STATE["session"]
    if not s: return []
    new = []
    for sym in s["symbols"]:
        try:
            v = SC.live(sym, lambda x, tf, n: S.fetch_candles(x, tf, n))
            for side in v["sides"]:
                st = side["setup"]
                if st and st["id"] not in STATE["sent"]:
                    STATE["sent"].add(st["id"]); new.append(st); _send(_text(sym, st))
        except Exception as e:
            STATE["last_error"] = f"{sym}: {str(e)[:120]}"
    STATE["last_check"] = datetime.now(timezone.utc).isoformat()
    if len(STATE["sent"]) > 500: STATE["sent"] = set(list(STATE["sent"])[-200:])
    return new


def _loop():
    last_ping = 0.0
    while True:
        s = STATE["session"]
        if not s or datetime.fromisoformat(s["end_at"]) <= datetime.now(timezone.utc):
            if s: _send("High Risk session finished. Results keep updating in Paper."); clear_session()
            time.sleep(30)
            if not STATE["session"]: return            # thread exits when idle; a new session starts a new one
            continue
        check_once()
        # Render's free tier sleeps after ~15 idle minutes; visiting our own public URL keeps the session alive.
        url = os.environ.get("RENDER_EXTERNAL_URL")
        if url and time.time() - last_ping > 600:
            try: requests.get(f"{url}/api/alerts/session", timeout=20)
            except Exception: pass
            last_ping = time.time()
        time.sleep(60)
