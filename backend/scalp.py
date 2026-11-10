"""
High Risk Mode (paper-only): 5-minute scalps that require a strong trend on the 15m and 1h charts.
The same `conditions()` function drives the live scanner and the backtest, so the stats shown are for these exact rules.

Long (short mirrors):
  1h EMA21 > EMA50 and 15m EMA21 > EMA50 and 15m close > 15m EMA21     (strong trend, two timeframes)
  5m low touched EMA21 within the last 3 candles, then closed back above it with a bullish candle
  5m MACD histogram > 0 and rising, 5m RSI(14) between 50 and 70
  volatility: round-trip cost must be <= 20% of the stop distance (otherwise spreads eat the trade)
  gold only 12:00-20:00 UTC (London/New York overlap)
Stop 1.5 x ATR(5m). Target RR x stop. Close at market after HOLD_BARS candles if neither level is hit.
"""
import numpy as np, pandas as pd
import indicators as ind

RR, HOLD_BARS, STOP_ATR, MAX_COST_SHARE = 1.5, 12, 1.5, 0.20
COST = {"GOLD": 0.0002, "BTCUSDT": 0.0006, "ETHUSDT": 0.0008}
DEFAULT_COST = 0.001
SCALP_MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "GOLD"]


def _prep(df):
    df = df.copy(); ind.add_ema(df, 21); ind.add_ema(df, 50); ind.add_macd(df); ind.add_rsi(df, 14); ind.add_atr(df, 14)
    return df


def _align(src, rule, target):
    s = src.copy(); s.index = s.index + pd.Timedelta(rule)
    a = s.reindex(target.index + pd.Timedelta("5min"), method="ffill"); a.index = target.index
    return a


def conditions(m5, m15, h1, symbol):
    """Vectorized checks on every 5m candle (completed candles). Returns dict of boolean Series per side + stop distance."""
    m, f, h = _prep(m5), _prep(m15), _prep(h1)
    fa = _align(f[["EMA_21", "EMA_50", "close"]], "15min", m); ha = _align(h[["EMA_21", "EMA_50"]], "1h", m)
    cost = COST.get(symbol, DEFAULT_COST)
    stop = STOP_ATR * m["ATR_14"]
    vol_ok = (cost * m["close"]) <= MAX_COST_SHARE * stop
    hist = m["MACDh_12_26_9"]
    if symbol == "GOLD":
        hr = pd.Series(m.index.hour, index=m.index); session = (hr >= 12) & (hr < 20)
    else:
        session = pd.Series(True, index=m.index)
    out = {}
    for side in ("long", "short"):
        up = side == "long"
        trend = ((ha.EMA_21 > ha.EMA_50) & (fa.EMA_21 > fa.EMA_50) & (fa.close > fa.EMA_21)) if up else \
                ((ha.EMA_21 < ha.EMA_50) & (fa.EMA_21 < fa.EMA_50) & (fa.close < fa.EMA_21))
        touch = ((m["low"] <= m["EMA_21"]) if up else (m["high"] >= m["EMA_21"])).rolling(3).max().fillna(0).astype(bool)
        reclaim = ((m["close"] > m["EMA_21"]) & (m["close"] > m["open"])) if up else ((m["close"] < m["EMA_21"]) & (m["close"] < m["open"]))
        momentum = ((hist > 0) & (hist > hist.shift(1))) if up else ((hist < 0) & (hist < hist.shift(1)))
        rsi = m["RSI_14"].between(50, 70) if up else m["RSI_14"].between(30, 50)
        out[side] = {"Strong trend on 1h and 15m": trend.fillna(False), "5m pullback to the 21 EMA": touch,
                     f"{'Bullish' if up else 'Bearish'} close back {'above' if up else 'below'} the 21 EMA": reclaim,
                     "MACD momentum building": momentum.fillna(False), f"RSI {'50-70' if up else '30-50'}": rsi.fillna(False),
                     "Enough movement to beat the spread": vol_ok.fillna(False), "Active session": session}
    return out, stop, m


def live(symbol, fetch):
    """Latest completed 5m candle: checklist and setup (if every check passes)."""
    m5, m15, h1 = fetch(symbol, "5m", 200), fetch(symbol, "15m", 200), fetch(symbol, "1h", 120)
    conds, stop, m = conditions(m5, m15, h1, symbol)
    t = m.index[-1]; price = float(m["close"].iloc[-1]); risk = float(stop.iloc[-1])
    views = []
    for side, cs in conds.items():
        checks = [{"label": k, "ok": bool(v.iloc[-1])} for k, v in cs.items()]
        setup = None
        if all(c["ok"] for c in checks) and np.isfinite(risk) and risk > 0:
            sgn = 1 if side == "long" else -1
            setup = {"id": f"scalp:{symbol}:{side}:{t.isoformat()}", "strategy": "scalp", "strategy_name": "High Risk scalp", "symbol": symbol,
                     "side": side, "entry": price, "sl": price - sgn * risk, "tp": price + sgn * RR * risk, "rr": RR,
                     "candle_time": t.isoformat(), "expires": (t + pd.Timedelta(minutes=5 * (HOLD_BARS + 1))).isoformat()}
        views.append({"side": side, "checks": checks, "met": sum(c["ok"] for c in checks), "total": len(checks), "setup": setup})
    return {"symbol": symbol, "price": price, "candle_time": t.isoformat(),
            "next_check": (t + pd.Timedelta(minutes=10)).isoformat(), "sides": views,
            "rules": {"rr": RR, "hold_minutes": HOLD_BARS * 5, "stop_atr": STOP_ATR}}


def backtest(m5, m15, h1, symbol, rr=RR, hold=HOLD_BARS):
    conds, stop, m = conditions(m5, m15, h1, symbol)
    cost = COST.get(symbol, DEFAULT_COST)
    c, hi, lo, idx = m["close"].values, m["high"].values, m["low"].values, m.index
    sig = np.zeros(len(m), int)
    for side, sgn in (("long", 1), ("short", -1)):
        ok = np.logical_and.reduce([v.values for v in conds[side].values()])
        sig[ok & (sig == 0)] = sgn
    res, busy, st = [], -1, stop.values
    for t in np.flatnonzero(sig):
        if t <= busy or t >= len(m) - 2 or not np.isfinite(st[t]) or st[t] <= 0: continue
        sgn, e, risk = sig[t], c[t], st[t]; sl, tp = e - sgn * risk, e + sgn * rr * risk
        wh, wl = hi[t + 1:t + 1 + hold], lo[t + 1:t + 1 + hold]
        hs = (wl <= sl) if sgn == 1 else (wh >= sl); ht = (wh >= tp) if sgn == 1 else (wl <= tp)
        i_s = np.argmax(hs) if hs.any() else 10**9; i_t = np.argmax(ht) if ht.any() else 10**9
        if i_s == 10**9 and i_t == 10**9: k = len(wh) - 1; ex = c[t + 1 + k]
        elif i_s <= i_t: k, ex = i_s, sl
        else: k, ex = i_t, tp
        g = sgn * (ex - e) / risk
        res.append((idx[t], g, g - cost * e / risk)); busy = t + 1 + k
    return pd.DataFrame(res, columns=["time", "r_gross", "r"])
