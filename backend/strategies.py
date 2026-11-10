"""
SEV7N SIGNS live signal engine.

Strategies (rules exactly as backtested; see research/ for the evidence):
  weekly   - SEV7N Weekly Trend: each Monday buy the strongest volatility-adjusted 1-week uptrend among
             BTC, ETH, SOL, XRP, Gold. Stop 2 x daily ATR, target 3R, exit by next Monday. No pick if nothing rose.
  squeeze  - S2 Squeeze Breakout (longs only; shorts showed no edge): daily uptrend (close > EMA50, EMA50 rising,
             EMA50 > EMA200), 4h squeeze of >= 3 candles released by a close above the upper Bollinger band.
             Stop 1.5 x 4h ATR, target 3R, max 7 days.
  pullback - S1 Trend Pullback (your EMA & MACD, upgraded), long and short: daily EMA21 vs EMA50 trend, 4h MACD
             crossed in the trend direction within 4 candles, 1h pullback to EMA21 holding EMA50, strong
             confirmation candle and 1h MACD cross. Stop beyond the 24-candle swing (min 1 x 1h ATR), target 3R.
Only completed candles are used.
"""
import time, threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

import indicators as ind

MAJORS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "GOLD"]
UNIVERSE = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT",
            "DOTUSDT", "LTCUSDT", "TRXUSDT", "ATOMUSDT", "NEARUSDT", "UNIUSDT", "BCHUSDT", "XLMUSDT", "ETCUSDT",
            "FILUSDT", "AAVEUSDT"]
NAMES = {"BTCUSDT": "Bitcoin", "ETHUSDT": "Ethereum", "SOLUSDT": "Solana", "XRPUSDT": "XRP", "GOLD": "Gold",
         "BNBUSDT": "BNB", "ADAUSDT": "Cardano", "DOGEUSDT": "Dogecoin", "AVAXUSDT": "Avalanche", "LINKUSDT": "Chainlink",
         "DOTUSDT": "Polkadot", "LTCUSDT": "Litecoin", "TRXUSDT": "TRON", "ATOMUSDT": "Cosmos", "NEARUSDT": "NEAR",
         "UNIUSDT": "Uniswap", "BCHUSDT": "Bitcoin Cash", "XLMUSDT": "Stellar", "ETCUSDT": "Ethereum Classic",
         "FILUSDT": "Filecoin", "AAVEUSDT": "Aave"}
TICKERS = {s: ("XAUUSD" if s == "GOLD" else s.replace("USDT", "")) for s in NAMES}

# Backtested statistics shown in the app (fees and funding included; see research/REPORT.md)
STATS = {
    "weekly": {"name": "Weekly Trend", "win_rate": 48, "avg_r": 0.20, "per_week": "about 1",
               "years_positive": "7 of 7", "worst_losing_streak": 7, "hold": "up to 7 days",
               "max_risk_hint": 10},
    "squeeze": {"name": "Squeeze Breakout", "win_rate": 32, "avg_r": 0.15, "per_week": "about 1-2",
                "years_positive": "6 of 7", "worst_losing_streak": 36, "hold": "about 2 days, max 7",
                "max_risk_hint": 2},
    "pullback": {"name": "Trend Pullback", "win_rate": 35, "avg_r": 0.08, "per_week": "about 3-5",
                 "years_positive": "5 of 7", "worst_losing_streak": 43, "hold": "about 3 days, max 7",
                 "max_risk_hint": 2},
}

TF_SECONDS = {"5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
_BYBIT_TF = {"5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D"}
_BINANCE_TF = {"5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d"}
_cache, _cache_lock = {}, threading.Lock()
CACHE_SECONDS = 60
HTTP = requests.Session()


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- data
def _bybit(symbol, tf, limit, category="spot"):
    r = HTTP.get("https://api.bybit.com/v5/market/kline",
                 params={"category": category, "symbol": symbol, "interval": _BYBIT_TF[tf], "limit": limit}, timeout=15)
    rows = r.json().get("result", {}).get("list", [])
    if not rows:
        raise ValueError(f"bybit {category} returned no data for {symbol}")
    df = pd.DataFrame([x[:6] for x in rows], columns=["start", "open", "high", "low", "close", "volume"]).astype(float)
    return df.iloc[::-1]


def _binance(symbol, tf, limit, futures=False):
    url = "https://fapi.binance.com/fapi/v1/klines" if futures else "https://api.binance.com/api/v3/klines"
    r = HTTP.get(url, params={"symbol": symbol, "interval": _BINANCE_TF[tf], "limit": limit}, timeout=15)
    rows = r.json()
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"binance returned no data for {symbol}")
    return pd.DataFrame([x[:6] for x in rows], columns=["start", "open", "high", "low", "close", "volume"]).astype(float)


SOURCES = {  # tried in order
    "GOLD": [lambda tf, n: _binance("XAUUSDT", tf, n, futures=True), lambda tf, n: _bybit("XAUTUSDT", tf, n, "linear"),
             lambda tf, n: _binance("PAXGUSDT", tf, n), lambda tf, n: _bybit("PAXGUSDT", tf, n)],
}
LAST_SOURCE = {}


def fetch_candles(symbol, tf, limit=300, include_live=False):
    """Oldest-first OHLCV with a UTC DatetimeIndex. Completed candles only unless include_live."""
    key = (symbol, tf, limit, include_live)
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    sources = SOURCES.get(symbol, [lambda tf, n: _bybit(symbol, tf, n), lambda tf, n: _binance(symbol, tf, n)])
    err = None
    for i, src in enumerate(sources):
        try:
            df = src(tf, limit + 1)
            LAST_SOURCE[symbol] = i
            break
        except Exception as e:  # try the next source
            err = e
    else:
        raise RuntimeError(f"No price data for {symbol}: {err}")
    df.index = pd.to_datetime(df["start"], unit="ms", utc=True)
    df = df[["open", "high", "low", "close", "volume"]].sort_index()
    df = df[~df.index.duplicated()]
    if not include_live:
        cutoff = pd.Timestamp(_now()) - pd.Timedelta(seconds=TF_SECONDS[tf])
        df = df[df.index <= cutoff]
    with _cache_lock:
        _cache[key] = (time.time(), df)
    return df


_price_cache = {}
PRICE_SECONDS = 5


def _bybit_ticker(symbol, category="spot"):
    r = HTTP.get("https://api.bybit.com/v5/market/tickers", params={"category": category, "symbol": symbol}, timeout=8)
    row = (r.json().get("result", {}).get("list") or [None])[0]
    if not row or not row.get("lastPrice"):
        raise ValueError(f"no ticker for {symbol}")
    price = float(row["lastPrice"]); prev = float(row.get("prevPrice24h") or 0)
    return {"price": price, "change_24h_pct": round((price / prev - 1) * 100, 2) if prev else None}


def _one_price(symbol):
    tries = [("XAUTUSDT", "linear"), ("PAXGUSDT", "spot")] if symbol == "GOLD" else [(symbol, "spot"), (symbol, "linear")]
    for sym, cat in tries:
        try:
            return _bybit_ticker(sym, cat)
        except Exception:
            continue
    return {"price": last_price(symbol), "change_24h_pct": None}   # fall back to the latest candle


def live_prices(symbols):
    """Latest traded prices, cached for a few seconds. Unknown symbols are ignored."""
    out, need, now = {}, [], time.time()
    for s in symbols:
        hit = _price_cache.get(s)
        if hit and now - hit[0] < PRICE_SECONDS: out[s] = hit[1]
        else: need.append(s)
    def one(s):
        try: return s, _one_price(s)
        except Exception: return s, None
    if need:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for s, v in pool.map(one, need):
                if v:
                    _price_cache[s] = (time.time(), v); out[s] = v
    return out


def last_price(symbol):
    return float(fetch_candles(symbol, "1h", 3, include_live=True)["close"].iloc[-1])


def _fetch_many(jobs):
    """jobs: list of (symbol, tf, limit) -> {(symbol, tf): df or Exception}"""
    def one(job):
        try:
            return job, fetch_candles(*job)
        except Exception as e:
            return job, e
    with ThreadPoolExecutor(max_workers=10) as pool:
        return {(j[0], j[1]): res for j, res in pool.map(one, jobs)}


# ---------------------------------------------------------------- helpers
def _std(df):
    df = df.copy()
    ind.add_ema(df, 21); ind.add_ema(df, 50); ind.add_macd(df); ind.add_atr(df, 14)
    return df.rename(columns={"MACD_12_26_9": "macd", "MACDs_12_26_9": "sig", "MACDh_12_26_9": "hist"})


def _bars_since_cross(above):
    """Candles since MACD last crossed into its current state (0 = crossed on the latest candle)."""
    a = np.asarray(above, bool)
    n = 0
    for i in range(len(a) - 1, 0, -1):
        if a[i] != a[i - 1]:
            return n
        n += 1
    return 10**6


def _round(x, ref):
    if ref >= 1000: return round(float(x), 2)
    if ref >= 10: return round(float(x), 3)
    if ref >= 1: return round(float(x), 4)
    return round(float(x), 6)


def _signal(strategy, symbol, side, entry, sl, candle_time, expires, reasons, rr=3.0, extra=None):
    risk = abs(entry - sl)
    tp = entry + rr * risk if side == "long" else entry - rr * risk
    sid = f"{strategy}:{symbol}:{side}:{pd.Timestamp(candle_time).isoformat()}"
    out = {"id": sid, "strategy": strategy, "strategy_name": STATS[strategy]["name"], "symbol": symbol,
           "ticker": TICKERS[symbol], "name": NAMES[symbol], "side": side,
           "entry": _round(entry, entry), "sl": _round(sl, entry), "tp": _round(tp, entry), "rr": rr,
           "risk_pct_of_price": round(risk / entry * 100, 2),
           "candle_time": pd.Timestamp(candle_time).isoformat(), "expires": pd.Timestamp(expires).isoformat(),
           "reasons": reasons, "stats": STATS[strategy]}
    if extra: out.update(extra)
    return out


# ---------------------------------------------------------------- Weekly Trend
def week_start(ts=None):
    ts = pd.Timestamp(ts or _now())
    ts = ts.tz_convert("UTC") if ts.tzinfo else ts.tz_localize("UTC")
    return (ts - pd.Timedelta(days=ts.weekday())).normalize()


def weekly_from_daily(daily_by_symbol, monday):
    """Pure function (testable): rank majors and choose this week's pick."""
    board = []
    for sym, d in daily_by_symbol.items():
        if isinstance(d, Exception) or d is None:
            board.append({"symbol": sym, "ticker": TICKERS[sym], "name": NAMES[sym], "error": str(d)}); continue
        d = d.copy(); ind.add_atr(d, 14)
        prev = d[d.index < monday]
        week = d[d.index >= monday]
        if len(prev) < 40:
            board.append({"symbol": sym, "ticker": TICKERS[sym], "name": NAMES[sym], "error": "not enough history"}); continue
        entry = float(week["open"].iloc[0]) if len(week) else float(prev["close"].iloc[-1])
        ret = entry / float(prev["close"].iloc[-8]) - 1
        vol = float(prev["close"].pct_change().iloc[-30:].std())
        strength = ret / (vol * np.sqrt(7)) if vol > 0 else 0.0
        board.append({"symbol": sym, "ticker": TICKERS[sym], "name": NAMES[sym], "week_return_pct": round(ret * 100, 2),
                      "strength": round(float(strength), 2), "entry": entry, "atr": float(prev["ATR_14"].iloc[-1]),
                      "week_candles": week})
    ranked = sorted([b for b in board if "strength" in b], key=lambda b: -b["strength"])
    ups = [b for b in ranked if b["week_return_pct"] > 0]
    pick = None
    if ups:
        b = ups[0]; entry, atr = b["entry"], b["atr"]
        reasons = [f"{b['name']} rose {b['week_return_pct']}% last week, the strongest move after adjusting for volatility",
                   "Stop is 2 daily ATRs below entry, target is 3x the stop",
                   "Exit at target, stop, or next Monday 00:00 UTC, whichever comes first"]
        pick = _signal("weekly", b["symbol"], "long", entry, entry - 2 * atr, monday, monday + pd.Timedelta(days=7), reasons)
        wk = b["week_candles"]
        status, closed_at = "active", None
        if len(wk):
            for t, row in wk.iterrows():
                if row["low"] <= pick["sl"]: status, closed_at = "stopped", t; break
                if row["high"] >= pick["tp"]: status, closed_at = "target_hit", t; break
        pick["status"] = status
        pick["closed_at"] = closed_at.isoformat() if closed_at is not None else None
    clean = [{k: v for k, v in b.items() if k not in ("week_candles", "atr", "entry")} for b in board]
    clean.sort(key=lambda b: -b.get("strength", -99))
    return {"week_start": monday.isoformat(), "next_scan": (monday + pd.Timedelta(days=7)).isoformat(),
            "pick": pick, "leaderboard": clean,
            "note": None if pick else "Nothing went up last week, so Weekly Trend sits out until next Monday."}


def weekly_scan():
    monday = week_start()
    got = _fetch_many([(s, "1d", 80) for s in MAJORS])
    data = {s: got[(s, "1d")] for s in MAJORS}
    res = weekly_from_daily(data, monday)
    if res["pick"] and res["pick"]["status"] == "active":
        try:
            res["pick"]["price"] = last_price(res["pick"]["symbol"])
        except Exception:
            res["pick"]["price"] = None
    return res


# ---------------------------------------------------------------- S2 Squeeze (longs)
def squeeze_eval(symbol, h4, d1):
    d1 = d1.copy(); ind.add_ema(d1, 50)
    d1["EMA_200"] = d1["close"].ewm(span=200, adjust=False).mean()
    slope = d1["EMA_50"].diff(3).iloc[-1]
    c, e50, e200 = d1["close"].iloc[-1], d1["EMA_50"].iloc[-1], d1["EMA_200"].iloc[-1]
    h = h4.copy(); ind.add_ema(h, 21); ind.add_atr(h, 14); ind.add_bbands(h, 20, 2.0)
    kc_u, kc_l = h["EMA_21"] + 1.5 * h["ATR_14"], h["EMA_21"] - 1.5 * h["ATR_14"]
    sq = ((h["BBU_20_2.0"] < kc_u) & (h["BBL_20_2.0"] > kc_l)).values
    run = 0
    for v in sq[-2::-1]:
        if v: run += 1
        else: break
    last = h.iloc[-1]
    checks = [{"label": "Daily trend up (above rising 50 EMA, 50 above 200)", "ok": bool(c > e50 and slope > 0 and e50 > e200)},
              {"label": f"4h squeeze lasted 3+ candles ({run} so far)", "ok": run >= 3},
              {"label": "Squeeze released on the last 4h close", "ok": bool(not sq[-1])},
              {"label": "Closed above the upper Bollinger band", "ok": bool(last["close"] > last["BBU_20_2.0"])}]
    met = sum(x["ok"] for x in checks)
    t = h.index[-1]
    detail = {"strategy": "squeeze", "strategy_name": STATS["squeeze"]["name"], "side": "long", "checks": checks, "met": met, "total": 4,
              "watch": f"Needs a 4h close above {_round(last['BBU_20_2.0'], last['close'])} after a 3+ candle squeeze, in a daily uptrend"}
    if met == 4:
        entry = float(last["close"])
        return _signal("squeeze", symbol, "long", entry, entry - 1.5 * float(last["ATR_14"]), t,
                       t + pd.Timedelta(hours=4) + pd.Timedelta(days=7),
                       ["Daily trend is up", f"Price was coiled for {run} candles on the 4h chart",
                        "The squeeze released with a close above the upper band"]), None, detail
    near = None
    if checks[0]["ok"] and (sq[-1] or run >= 3):
        near = {"strategy": "squeeze", "strategy_name": STATS["squeeze"]["name"], "symbol": symbol, "ticker": TICKERS[symbol],
                "name": NAMES[symbol], "side": "long", "checks": checks, "met": met, "total": 4,
                "watch": f"Waiting for a 4h close above {_round(last['BBU_20_2.0'], last['close'])}"}
    return None, near, detail


# ---------------------------------------------------------------- S1 Trend Pullback (long + short)
def pullback_eval(symbol, h1, h4, d1, side):
    d = _std(d1); f = _std(h4); m = _std(h1)
    up = side == "long"
    trend_ok = bool(d["EMA_21"].iloc[-1] > d["EMA_50"].iloc[-1]) if up else bool(d["EMA_21"].iloc[-1] < d["EMA_50"].iloc[-1])
    above4 = (f["macd"] > f["sig"]).values
    h4_ok = bool(above4[-1] == up and _bars_since_cross(above4) <= 4)
    z = m.iloc[-8:]
    touched = bool((z["low"] <= z["EMA_21"]).any()) if up else bool((z["high"] >= z["EMA_21"]).any())
    last, prev = m.iloc[-1], m.iloc[-2]
    holds = bool(last["close"] > last["EMA_50"]) if up else bool(last["close"] < last["EMA_50"])
    rng = max(last["high"] - last["low"], 1e-12)
    body_lo, body_hi = min(last["open"], last["close"]), max(last["open"], last["close"])
    if up:
        candle = bool(last["close"] > last["open"] and (last["close"] > prev["high"] or (body_lo - last["low"]) / rng >= 0.5))
    else:
        candle = bool(last["close"] < last["open"] and (last["close"] < prev["low"] or (last["high"] - body_hi) / rng >= 0.5))
    above1 = (m["macd"] > m["sig"]).values
    macd_ok = bool(above1[-1] == up and _bars_since_cross(above1) <= 1)
    word = "up" if up else "down"
    checks = [{"label": f"Daily trend {word} (21 EMA {'above' if up else 'below'} 50 EMA)", "ok": trend_ok},
              {"label": f"4h MACD crossed {word} within 4 candles", "ok": h4_ok},
              {"label": f"1h pullback to the 21 EMA, holding the 50 EMA", "ok": touched and holds},
              {"label": f"Strong {'bullish' if up else 'bearish'} confirmation candle", "ok": candle},
              {"label": f"1h MACD crossed {word}", "ok": macd_ok}]
    met = sum(x["ok"] for x in checks)
    t = m.index[-1]
    missing = [c["label"].lower() for c in checks if not c["ok"]]
    detail = {"strategy": "pullback", "strategy_name": STATS["pullback"]["name"], "side": side, "checks": checks, "met": met, "total": 5,
              "watch": ("Missing: " + ", ".join(missing)) if missing else "All conditions met"}
    if met == 5:
        entry, atr = float(last["close"]), float(last["ATR_14"])
        if up:
            sl = min(float(m["low"].iloc[-24:].min()) - 0.1 * atr, entry - atr)
        else:
            sl = max(float(m["high"].iloc[-24:].max()) + 0.1 * atr, entry + atr)
        return _signal("pullback", symbol, side, entry, sl, t, t + pd.Timedelta(hours=1) + pd.Timedelta(days=7),
                       [c["label"] for c in checks]), None, detail
    near = None
    if trend_ok and met >= 3:
        near = {"strategy": "pullback", "strategy_name": STATS["pullback"]["name"], "symbol": symbol, "ticker": TICKERS[symbol],
                "name": NAMES[symbol], "side": side, "checks": checks, "met": met, "total": 5,
                "watch": "Missing: " + ", ".join(c["label"].lower() for c in checks if not c["ok"])}
    return None, near, detail


# ---------------------------------------------------------------- full scan
def scan(side="all"):
    started = time.time()
    jobs = [(s, tf, n) for s in UNIVERSE for tf, n in (("1h", 200), ("4h", 200), ("1d", 300))]
    if side in ("all", "long"):
        jobs += [("GOLD", "4h", 200), ("GOLD", "1d", 300)]
    got = _fetch_many(jobs)
    signals, near, errors = [], [], []
    for s in UNIVERSE:
        h1, h4, d1 = got[(s, "1h")], got[(s, "4h")], got[(s, "1d")]
        bad = [x for x in (h1, h4, d1) if isinstance(x, Exception)]
        if bad:
            errors.append({"symbol": s, "error": str(bad[0])}); continue
        try:
            if side in ("all", "long"):
                sig, nr, _ = squeeze_eval(s, h4, d1)
                if sig: signals.append(sig)
                if nr: near.append(nr)
                sig, nr, _ = pullback_eval(s, h1, h4, d1, "long")
                if sig: signals.append(sig)
                if nr: near.append(nr)
            if side in ("all", "short"):
                sig, nr, _ = pullback_eval(s, h1, h4, d1, "short")
                if sig: signals.append(sig)
                if nr: near.append(nr)
        except Exception as e:
            errors.append({"symbol": s, "error": f"{type(e).__name__}: {e}"})
    if side in ("all", "long"):
        g4, gd = got.get(("GOLD", "4h")), got.get(("GOLD", "1d"))
        if g4 is not None and not isinstance(g4, Exception) and not isinstance(gd, Exception):
            try:
                sig, nr, _ = squeeze_eval("GOLD", g4, gd)
                if sig: sig["stats"] = dict(STATS["squeeze"], note=TEST_NOTES[("squeeze", "GOLD")]); signals.append(sig)
                if nr: near.append(nr)
            except Exception as e:
                errors.append({"symbol": "GOLD", "error": str(e)})
    near.sort(key=lambda n: -n["met"] / n["total"])
    weekly = None
    if side in ("all", "long"):
        try:
            weekly = weekly_scan()
        except Exception as e:
            errors.append({"symbol": "weekly", "error": str(e)})
    return {"generated_at": _now().isoformat(), "seconds": round(time.time() - started, 1), "side": side,
            "weekly": weekly, "signals": signals, "near": near[:12], "errors": errors,
            "markets_scanned": len(UNIVERSE) - len(errors)}


# ---------------------------------------------------------------- trade tracking
def trade_status(trade):
    """First-touch evaluation of a paper trade on 1h candles since it opened (stop assumed first if both in one candle)."""
    sym, side = trade["symbol"], trade["side"]
    entry, sl, tp = float(trade["entry"]), float(trade["sl"]), float(trade["tp"])
    opened = pd.Timestamp(trade["opened_at"]); opened = opened.tz_convert("UTC") if opened.tzinfo else opened.tz_localize("UTC")
    expires = pd.Timestamp(trade.get("expires") or (opened + pd.Timedelta(days=7)))
    expires = expires.tz_convert("UTC") if expires.tzinfo else expires.tz_localize("UTC")
    # Only candles that START after the trade opened: the candle it opened in also holds earlier prices,
    # which would falsely trigger the stop or target. Recent trades use 5m candles for precision.
    age = pd.Timestamp(_now()) - opened
    if trade.get("strategy") == "scalp" or age <= pd.Timedelta(days=3.3):
        df = fetch_candles(sym, "5m", 1000, include_live=True)
        df = df[df.index >= opened.ceil("5min")]
    else:
        df = fetch_candles(sym, "1h", 300, include_live=True)
        df = df[df.index >= opened.ceil("h")]
    risk = abs(entry - sl)
    for t, row in df.iterrows():
        if t > expires: break
        hit_sl = row["low"] <= sl if side == "long" else row["high"] >= sl
        hit_tp = row["high"] >= tp if side == "long" else row["low"] <= tp
        if hit_sl: return {"id": trade.get("id"), "status": "stopped", "exit": sl, "r": -1.0, "closed_at": t.isoformat()}
        if hit_tp: return {"id": trade.get("id"), "status": "target_hit", "exit": tp, "r": round((tp - entry) / risk * (1 if side == "long" else -1), 2), "closed_at": t.isoformat()}
    price = float(df["close"].iloc[-1]) if len(df) else last_price(sym)
    r_now = (price - entry) / risk * (1 if side == "long" else -1)
    if pd.Timestamp(_now()) >= expires:
        return {"id": trade.get("id"), "status": "expired", "exit": price, "r": round(r_now, 2), "closed_at": expires.isoformat()}
    return {"id": trade.get("id"), "status": "open", "price": price, "r": round(r_now, 2)}


# ---------------------------------------------------------------- single market view
MARKETS = UNIVERSE + ["GOLD"]
TEST_NOTES = {
    ("squeeze", "GOLD"): "Tested on gold since 2020: buy setups averaged +0.40R per trade, but only about 40 trades. Treat with care.",
    ("pullback", "GOLD"): "Tested on gold since 2020: it lost money (-0.15R per trade). Shown for reference only.",
}


def market(symbol):
    """Every strategy's checklist for one market, whether or not it is close to a setup."""
    if symbol not in MARKETS:
        raise ValueError("unknown market")
    got = _fetch_many([(symbol, "1h", 200), (symbol, "4h", 200), (symbol, "1d", 300)])
    h1, h4, d1 = got[(symbol, "1h")], got[(symbol, "4h")], got[(symbol, "1d")]
    for x in (h1, h4, d1):
        if isinstance(x, Exception):
            raise RuntimeError(str(x))
    tested = symbol in UNIVERSE
    views = []
    for fn, args in ((squeeze_eval, (symbol, h4, d1)), (pullback_eval, (symbol, h1, h4, d1, "long")), (pullback_eval, (symbol, h1, h4, d1, "short"))):
        sig, _, detail = fn(*args)
        note = TEST_NOTES.get((detail["strategy"], symbol))
        detail["signal"] = sig if (tested or detail["strategy"] == "squeeze") else None
        detail["tested_here"] = tested or detail["strategy"] == "squeeze"
        detail["note"] = note
        views.append(detail)
    weekly = None
    if symbol in MAJORS:
        w = weekly_scan()
        row = next((b for b in w["leaderboard"] if b["symbol"] == symbol), None)
        is_pick = bool(w["pick"] and w["pick"]["symbol"] == symbol)
        weekly = {"is_pick": is_pick, "pick": w["pick"] if is_pick else None, "row": row,
                  "rank": [b["symbol"] for b in w["leaderboard"]].index(symbol) + 1 if row else None,
                  "pick_ticker": w["pick"]["ticker"] if w["pick"] else None, "next_scan": w["next_scan"]}
    price = float(fetch_candles(symbol, "1h", 3, include_live=True)["close"].iloc[-1])
    d = d1.copy(); ind.add_ema(d, 21); ind.add_ema(d, 50)
    trend = "up" if d["EMA_21"].iloc[-1] > d["EMA_50"].iloc[-1] else "down"
    chg = (price / float(d["close"].iloc[-2]) - 1) * 100 if len(d) > 1 else 0.0
    return {"symbol": symbol, "ticker": TICKERS[symbol], "name": NAMES[symbol], "price": price, "change_24h_pct": round(chg, 2),
            "daily_trend": trend, "strategies": views, "weekly": weekly, "tested": tested, "generated_at": _now().isoformat()}
