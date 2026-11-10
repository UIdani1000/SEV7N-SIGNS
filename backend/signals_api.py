"""SEV7N SIGNS API routes (mounted under /api)."""
import os, json, time, threading
from flask import Blueprint, jsonify, request
import requests
import strategies as S

api = Blueprint("api", __name__, url_prefix="/api")
_explain_cache, _alerted, _last_cron = {}, set(), {"t": 0.0}
_lock = threading.Lock()
TG = "https://api.telegram.org/bot{token}/{method}"


@api.get("/scan")
def scan_route():
    side = request.args.get("side", "all")
    if side not in ("all", "long", "short"):
        return jsonify({"error": "side must be all, long or short"}), 400
    return jsonify(S.scan(side))


@api.get("/weekly")
def weekly_route():
    return jsonify(S.weekly_scan())


@api.get("/prices")
def prices_route():
    syms = [x for x in request.args.get("symbols", "").split(",") if x in S.MARKETS][:25]
    if not syms:
        return jsonify({"error": "Pass symbols=BTCUSDT,GOLD,..."}), 400
    resp = jsonify({"prices": S.live_prices(syms), "at": S._now().isoformat()})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@api.get("/markets")
def markets_route():
    return jsonify([{"symbol": m, "ticker": S.TICKERS[m], "name": S.NAMES[m], "major": m in S.MAJORS} for m in S.MARKETS])


@api.get("/market")
def market_route():
    sym = request.args.get("symbol", "BTCUSDT")
    if sym not in S.MARKETS:
        return jsonify({"error": f"Unknown market {sym}"}), 400
    try:
        return jsonify(S.market(sym))
    except Exception as e:
        return jsonify({"error": f"Could not load {sym}: {str(e)[:160]}"}), 502


@api.get("/scalp")
def scalp_route():
    import scalp as SC
    sym = request.args.get("symbol", "BTCUSDT")
    if sym not in SC.SCALP_MARKETS:
        return jsonify({"error": f"High Risk Mode supports {', '.join(SC.SCALP_MARKETS)}"}), 400
    try:
        return jsonify(SC.live(sym, lambda s, tf, n: S.fetch_candles(s, tf, n)))
    except Exception as e:
        return jsonify({"error": f"Could not read {sym}: {str(e)[:160]}"}), 502


@api.post("/lab/parse")
def lab_parse_route():
    import lab
    from app import gemini_client, gemini_generate
    text = ((request.get_json(silent=True) or {}).get("text") or "").strip()
    if len(text) < 40:
        return jsonify({"error": "Paste the full rule book (at least a few sentences)."}), 400
    if gemini_client is None:
        return jsonify({"error": "AI is not configured on the server."}), 503
    try:
        return jsonify({"rules": lab.parse(text, gemini_generate)})
    except lab.RuleError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        return jsonify({"error": f"Could not translate the rule book: {str(e)[:160]}"}), 502


@api.post("/lab/run")
def lab_run_route():
    import lab
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(lab.backtest(body.get("rules") or {}, float(body.get("balance", 25)), float(body.get("risk_pct", 2))))
    except lab.RuleError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        return jsonify({"error": f"Backtest failed: {str(e)[:200]}"}), 502


@api.get("/strategies")
def strategies_route():
    return jsonify(S.STATS)


@api.get("/candles")
def candles_route():
    sym, tf = request.args.get("symbol", "BTCUSDT"), request.args.get("tf", "4h")
    if sym not in S.NAMES or tf not in S.TF_SECONDS:
        return jsonify({"error": "unknown symbol or timeframe"}), 400
    n = min(int(request.args.get("limit", 90)), 300)
    df = S.fetch_candles(sym, tf, n, include_live=True).iloc[-n:]
    return jsonify({"symbol": sym, "tf": tf, "candles": [
        {"t": int(t.timestamp()), "o": r.open, "h": r.high, "l": r.low, "c": r.close} for t, r in df.iterrows()]})


@api.post("/trades/status")
def trades_status_route():
    trades = (request.get_json(silent=True) or {}).get("trades", [])[:50]
    out = []
    for t in trades:
        try:
            out.append(S.trade_status(t))
        except Exception as e:
            out.append({"id": t.get("id"), "status": "unknown", "error": str(e)})
    return jsonify({"trades": out})


@api.post("/explain")
def explain_route():
    from app import gemini_client, gemini_generate
    sig = (request.get_json(silent=True) or {}).get("signal") or {}
    if not sig.get("id"):
        return jsonify({"error": "signal required"}), 400
    if sig["id"] in _explain_cache:
        return jsonify({"text": _explain_cache[sig["id"]]})
    if gemini_client is None:
        return jsonify({"text": None, "error": "AI is not configured on the server."}), 503
    st = sig.get("stats", {})
    prompt = f"""You are the analyst inside SEV7N SIGNS. Explain this trade setup to a beginner in under 110 words,
plain English, no hype, no emojis. Say what the strategy saw, where the stop and target are and why, and one
honest risk. Never promise profit. Backtested facts you may use: wins about {st.get('win_rate')}% of trades,
average {st.get('avg_r')}R per trade after costs, worst losing streak {st.get('worst_losing_streak')} trades.
Setup: {json.dumps({k: sig.get(k) for k in ('strategy_name','name','ticker','side','entry','sl','tp','rr','reasons')})}"""
    try:
        text = gemini_generate(prompt)
    except Exception as e:
        return jsonify({"text": None, "error": f"AI unavailable: {str(e)[:160]}"}), 502
    _explain_cache[sig["id"]] = text
    return jsonify({"text": text})


@api.get("/health/data")
def data_health_route():
    out = {}
    for sym in ("BTCUSDT", "GOLD"):
        try:
            df = S.fetch_candles(sym, "1h", 5)
            out[sym] = {"ok": True, "source_index": S.LAST_SOURCE.get(sym), "last_candle": df.index[-1].isoformat()}
        except Exception as e:
            out[sym] = {"ok": False, "error": str(e)[:200]}
    return jsonify(out)


# ---------------------------------------------------------------- Telegram
def _tg(method, **params):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set on the server")
    r = requests.post(TG.format(token=token, method=method), json=params, timeout=15)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description", "Telegram error"))
    return data["result"]


def _fmt(sig):
    arrow = "BUY" if sig["side"] == "long" else "SELL"
    return (f"SEV7N SIGNS | {sig['strategy_name']}\n{arrow} {sig['ticker']} ({sig['name']})\n"
            f"Entry {sig['entry']}\nStop {sig['sl']}\nTarget {sig['tp']} (1:{sig['rr']:g})\n"
            f"Valid until {sig['expires'][:16].replace('T', ' ')} UTC\nPaper-trade first. Not financial advice.")


@api.get("/telegram/status")
def telegram_status_route():
    try:
        me = _tg("getMe")
        updates = _tg("getUpdates", limit=20)
    except Exception as e:
        return jsonify({"connected": False, "error": str(e)})
    chats = {}
    for u in updates:
        msg = u.get("message") or {}
        ch = msg.get("chat") or {}
        if ch.get("id"):
            chats[ch["id"]] = ch.get("first_name") or ch.get("username") or "chat"
    return jsonify({"connected": bool(os.environ.get("TELEGRAM_CHAT_ID")), "bot": me.get("username"),
                    "chat_id_set": os.environ.get("TELEGRAM_CHAT_ID"),
                    "recent_chats": [{"id": k, "name": v} for k, v in chats.items()]})


@api.post("/telegram/test")
def telegram_test_route():
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not chat:
        return jsonify({"ok": False, "error": "Set TELEGRAM_CHAT_ID in Render first."}), 400
    try:
        _tg("sendMessage", chat_id=chat, text="SEV7N SIGNS is connected. Signals will arrive here.")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@api.post("/cron/scan")
def cron_scan_route():
    """Called hourly by the GitHub Actions timer. Scans and sends each new signal to Telegram once."""
    with _lock:
        if time.time() - _last_cron["t"] < 600:
            return jsonify({"skipped": "ran less than 10 minutes ago"})
        _last_cron["t"] = time.time()
    res = S.scan("all")
    sigs = list(res["signals"])
    if res.get("weekly") and res["weekly"].get("pick") and res["weekly"]["pick"].get("status") == "active":
        sigs.append(res["weekly"]["pick"])
    sent, chat = [], os.environ.get("TELEGRAM_CHAT_ID")
    for s in sigs:
        if s["id"] in _alerted:
            continue
        _alerted.add(s["id"])
        if chat:
            try:
                _tg("sendMessage", chat_id=chat, text=_fmt(s)); sent.append(s["id"])
            except Exception:
                pass
    return jsonify({"signals": len(sigs), "alerts_sent": len(sent), "telegram": bool(chat), "errors": res["errors"][:5]})
