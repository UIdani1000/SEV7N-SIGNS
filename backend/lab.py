"""
Strategy Lab: paste a rule book -> Gemini translates it into a strict rule format -> backtest on real history.

Rule format (JSON):
{
  "name": str, "symbol": "BTCUSDT" | ... | "GOLD", "timeframe": "15m" | "1h" | "4h",
  "long": [condition, ...], "short": [condition, ...],          # empty list = that side is not traded
  "stop":   {"type": "atr", "mult": 1.5} | {"type": "swing", "lookback": 10} | {"type": "percent", "value": 1.0}
            | {"type": "ema", "period": 50},
  "target": {"type": "rr", "value": 3} | {"type": "percent", "value": 2.0},
  "max_hold_bars": 48,
  "assumptions": [{"text": str, "choice": str, "alternatives": [str]}],
  "claimed": {"win_rate": number | null, "notes": str}
}
Series: {"ind": "close|open|high|low|ema|sma|rsi|macd|macd_signal|macd_hist|atr|bb_upper|bb_mid|bb_lower|stoch_k|stoch_d",
         "period": int (ema/sma/rsi/atr/bb)} or {"value": number}
Conditions (optional "tf": "15m|1h|4h|1d", must be >= the entry timeframe):
  {"type": "compare", "a": Series, "op": ">"|"<", "b": Series}
  {"type": "cross", "a": Series, "b": Series, "dir": "above"|"below", "within": int}
  {"type": "touch", "level": Series, "within": int, "from": "above"|"below"}     # pullback to a level
  {"type": "candle", "pattern": "bullish|bearish|bullish_engulfing|bearish_engulfing|hammer|shooting_star"}
  {"type": "rising"|"falling", "a": Series, "bars": int}
The backtest is plain code; the AI never decides a trade.
"""
import io, json, os, re, zipfile
from datetime import date
import numpy as np, pandas as pd, requests
import indicators as ind
from strategies import MARKETS, TICKERS, NAMES

TF_ORDER = {"15m": 1, "1h": 2, "4h": 3, "1d": 4}
TF_RULE = {"15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}
MONTHS = {"15m": 12, "1h": 24, "4h": 36}
COST = {"GOLD": 0.0002, "BTCUSDT": 0.0006, "ETHUSDT": 0.0008}   # round-trip spread+fees as a fraction of price
DEFAULT_COST = 0.001
CACHE_DIR = "/tmp/lab_cache"
SERIES = {"close", "open", "high", "low", "ema", "sma", "rsi", "macd", "macd_signal", "macd_hist", "atr", "bb_upper", "bb_mid", "bb_lower", "stoch_k", "stoch_d"}
PATTERNS = {"bullish", "bearish", "bullish_engulfing", "bearish_engulfing", "hammer", "shooting_star"}


class RuleError(ValueError):
    pass


# ------------------------------------------------------------------ validation
def _series_ok(s, where):
    if not isinstance(s, dict): raise RuleError(f"{where}: expected an indicator or a value")
    if "value" in s:
        float(s["value"]); return
    if s.get("ind") not in SERIES: raise RuleError(f"{where}: unknown indicator {s.get('ind')!r}")
    if s["ind"] in ("ema", "sma", "rsi", "atr", "bb_upper", "bb_mid", "bb_lower"):
        p = int(s.get("period") or {"rsi": 14, "atr": 14}.get(s["ind"], 20))
        if not 2 <= p <= 400: raise RuleError(f"{where}: period {p} out of range")
        s["period"] = p


def validate(rules):
    if not isinstance(rules, dict): raise RuleError("Rules must be an object")
    if rules.get("symbol") not in MARKETS: raise RuleError(f"Market must be one of: {', '.join(MARKETS)}")
    tf = rules.get("timeframe")
    if tf not in MONTHS: raise RuleError("Entry timeframe must be 15m, 1h or 4h")
    if not rules.get("long") and not rules.get("short"): raise RuleError("Give at least one long or short condition")
    for side in ("long", "short"):
        for i, c in enumerate(rules.get(side) or []):
            w = f"{side} condition {i + 1}"
            ctf = c.get("tf", tf)
            if ctf not in TF_ORDER or TF_ORDER[ctf] < TF_ORDER[tf]: raise RuleError(f"{w}: timeframe must be {tf} or higher")
            t = c.get("type")
            if t == "compare":
                _series_ok(c.get("a"), w); _series_ok(c.get("b"), w)
                if c.get("op") not in (">", "<"): raise RuleError(f"{w}: op must be > or <")
            elif t == "cross":
                _series_ok(c.get("a"), w); _series_ok(c.get("b"), w)
                if c.get("dir") not in ("above", "below"): raise RuleError(f"{w}: dir must be above or below")
                c["within"] = int(c.get("within", 1))
            elif t == "touch":
                _series_ok(c.get("level"), w); c["within"] = int(c.get("within", 3))
                if c.get("from") not in ("above", "below"): raise RuleError(f"{w}: from must be above or below")
            elif t == "candle":
                if c.get("pattern") not in PATTERNS: raise RuleError(f"{w}: unknown candle pattern")
            elif t in ("rising", "falling"):
                _series_ok(c.get("a"), w); c["bars"] = int(c.get("bars", 3))
            else:
                raise RuleError(f"{w}: unknown condition type {t!r}")
    st, tg = rules.get("stop") or {}, rules.get("target") or {}
    if st.get("type") not in ("atr", "swing", "percent", "ema"): raise RuleError("Stop type must be atr, swing, percent or ema")
    if tg.get("type") not in ("rr", "percent"): raise RuleError("Target type must be rr or percent")
    rules["max_hold_bars"] = max(1, min(int(rules.get("max_hold_bars") or 48), 500))
    return rules


# ------------------------------------------------------------------ data
def _download(symbol, tf):
    pair = "PAXGUSDT" if symbol == "GOLD" else symbol
    os.makedirs(CACHE_DIR, exist_ok=True)
    frames, d = [], date.today().replace(day=1)
    months = []
    for _ in range(MONTHS[tf]):
        d = (d - pd.Timedelta(days=1)).replace(day=1); months.append(d.strftime("%Y-%m"))
    for ym in reversed(months):
        path = f"{CACHE_DIR}/{pair}-{tf}-{ym}.csv"
        if not os.path.exists(path):
            url = f"https://data.binance.vision/data/spot/monthly/klines/{pair}/{tf}/{pair}-{tf}-{ym}.zip"
            r = requests.get(url, timeout=30)
            if r.status_code != 200: continue
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                open(path, "wb").write(z.read(z.namelist()[0]))
        frames.append(pd.read_csv(path, header=None, usecols=range(6), names=["start", "open", "high", "low", "close", "volume"]))
    if not frames: raise RuleError(f"No history available for {symbol} on {tf}")
    df = pd.concat(frames); df = df[pd.to_numeric(df["start"], errors="coerce").notna()].astype(float)
    df["start"] = np.where(df["start"] > 1e14, df["start"] / 1000, df["start"])
    df.index = pd.to_datetime(df["start"], unit="ms")
    return df[["open", "high", "low", "close", "volume"]].sort_index().loc[lambda x: ~x.index.duplicated()]


# ------------------------------------------------------------------ evaluation
def _series(df, s, cache):
    if "value" in s: return pd.Series(float(s["value"]), index=df.index)
    k = (s["ind"], s.get("period")); 
    if k in cache: return cache[k]
    i, p = s["ind"], s.get("period")
    if i in ("close", "open", "high", "low"): out = df[i]
    elif i == "ema": out = ind._ema(df["close"], p)
    elif i == "sma": out = df["close"].rolling(p).mean()
    elif i == "rsi": t = df[["close"]].copy(); ind.add_rsi(t, p); out = t[f"RSI_{p}"]
    elif i in ("macd", "macd_signal", "macd_hist"):
        t = df[["close"]].copy(); ind.add_macd(t)
        out = t[{"macd": "MACD_12_26_9", "macd_signal": "MACDs_12_26_9", "macd_hist": "MACDh_12_26_9"}[i]]
    elif i == "atr": t = df.copy(); ind.add_atr(t, p); out = t[f"ATR_{p}"]
    elif i.startswith("bb_"):
        t = df[["close"]].copy(); ind.add_bbands(t, p, 2.0)
        out = t[{"bb_upper": f"BBU_{p}_2.0", "bb_mid": f"BBM_{p}_2.0", "bb_lower": f"BBL_{p}_2.0"}[i]]
    elif i in ("stoch_k", "stoch_d"):
        t = df.copy(); ind.add_stoch(t); out = t["STOCHk_14_3_3" if i == "stoch_k" else "STOCHd_14_3_3"]
    cache[k] = out
    return out


def _cond(df, c, cache):
    t = c["type"]
    if t == "compare":
        a, b = _series(df, c["a"], cache), _series(df, c["b"], cache)
        return a > b if c["op"] == ">" else a < b
    if t == "cross":
        a, b = _series(df, c["a"], cache), _series(df, c["b"], cache)
        state = a > b if c["dir"] == "above" else a < b
        fresh = state & ~state.shift(1, fill_value=False)
        return fresh.rolling(c["within"]).max().fillna(0).astype(bool) & state
    if t == "touch":
        lvl = _series(df, c["level"], cache)
        hit = (df["low"] <= lvl) if c["from"] == "above" else (df["high"] >= lvl)
        return hit.rolling(c["within"]).max().fillna(0).astype(bool)
    if t == "candle":
        o, cl, h, l = df["open"], df["close"], df["high"], df["low"]
        body = (cl - o).abs(); lw = np.minimum(o, cl) - l; uw = h - np.maximum(o, cl)
        po, pc = o.shift(1), cl.shift(1)
        return {"bullish": cl > o, "bearish": cl < o,
                "bullish_engulfing": (cl > o) & (pc < po) & (o <= pc) & (cl >= po),
                "bearish_engulfing": (cl < o) & (pc > po) & (o >= pc) & (cl <= po),
                "hammer": (lw >= 2 * body) & (uw <= body) & (body > 0),
                "shooting_star": (uw >= 2 * body) & (lw <= body) & (body > 0)}[c["pattern"]]
    a = _series(df, c["a"], cache)
    d = a.diff()
    ok = d > 0 if t == "rising" else d < 0
    return ok.rolling(c["bars"]).min().fillna(0).astype(bool)


def signals(rules, base):
    tf = rules["timeframe"]
    frames = {tf: base}
    for side in ("long", "short"):
        for c in rules.get(side) or []:
            ctf = c.get("tf", tf)
            if ctf not in frames:
                frames[ctf] = base.resample(TF_RULE[ctf], label="left", closed="left").agg(
                    {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    caches = {k: {} for k in frames}
    out = {}
    for side in ("long", "short"):
        conds = rules.get(side) or []
        if not conds: out[side] = pd.Series(False, index=base.index); continue
        acc = pd.Series(True, index=base.index)
        for c in conds:
            ctf = c.get("tf", tf); r = _cond(frames[ctf], c, caches[ctf]).astype(float)
            if ctf != tf:   # higher timeframe: only use closed candles
                r.index = r.index + pd.Timedelta(TF_RULE[ctf])
                r = r.reindex(base.index + pd.Timedelta(TF_RULE[tf]), method="ffill")
                r.index = base.index
            acc &= r.fillna(0).astype(bool)
        out[side] = acc
    return out["long"], out["short"]


def backtest(rules, balance=25.0, risk_pct=2.0):
    rules = validate(rules)
    base = _download(rules["symbol"], rules["timeframe"])
    long_, short = signals(rules, base)
    t2 = base.copy(); ind.add_atr(t2, 14); atr = t2["ATR_14"].values
    c, hi, lo, times = base["close"].values, base["high"].values, base["low"].values, base.index
    st, tg, mh = rules["stop"], rules["target"], rules["max_hold_bars"]
    cost = COST.get(rules["symbol"], DEFAULT_COST)
    ema_stop = ind._ema(base["close"], int(st.get("period", 50))).values if st["type"] == "ema" else None
    sig = np.where(long_.values & ~short.values, 1, np.where(short.values & ~long_.values, -1, 0))
    trades, busy, n = [], -1, len(base)
    for t in np.flatnonzero(sig):
        if t <= busy or t >= n - 2 or not np.isfinite(atr[t]): continue
        side, e = int(sig[t]), c[t]
        if st["type"] == "atr": risk = float(st.get("mult", 1.5)) * atr[t]
        elif st["type"] == "percent": risk = e * float(st.get("value", 1.0)) / 100
        elif st["type"] == "swing":
            lb = int(st.get("lookback", 10)); w = lo[max(0, t - lb + 1):t + 1] if side == 1 else hi[max(0, t - lb + 1):t + 1]
            risk = (e - w.min()) if side == 1 else (w.max() - e); risk += 0.1 * atr[t]
        else: risk = side * (e - ema_stop[t])
        if not np.isfinite(risk) or risk <= 0: continue
        sl = e - side * risk
        tp = e + side * (float(tg.get("value", 3)) * risk if tg["type"] == "rr" else e * float(tg.get("value", 2)) / 100)
        wh, wl = hi[t + 1:t + 1 + mh], lo[t + 1:t + 1 + mh]
        hs = (wl <= sl) if side == 1 else (wh >= sl); ht = (wh >= tp) if side == 1 else (wl <= tp)
        i_s = int(np.argmax(hs)) if hs.any() else 10**9; i_t = int(np.argmax(ht)) if ht.any() else 10**9
        if i_s == 10**9 and i_t == 10**9: k = len(wh) - 1; ex, oc = c[t + 1 + k], "time"
        elif i_s <= i_t: k, ex, oc = i_s, sl, "stop"
        else: k, ex, oc = i_t, tp, "target"
        g = side * (ex - e) / risk
        trades.append({"time": times[t].isoformat(), "side": "long" if side == 1 else "short", "entry": e, "exit": float(ex),
                       "outcome": oc, "r_gross": round(g, 3), "r": round(g - cost * e / risk, 3), "bars": k + 1})
        busy = t + 1 + k
    return report(rules, base, trades, balance, risk_pct, cost)


def _streak(r):
    m = c = 0
    for x in r:
        c = c + 1 if x <= 0 else 0; m = max(m, c)
    return m


def report(rules, base, trades, balance, risk_pct, cost):
    span_weeks = max((base.index[-1] - base.index[0]).days / 7, 1)
    out = {"rules": rules, "market": TICKERS[rules["symbol"]], "name": NAMES[rules["symbol"]],
           "period": [base.index[0].date().isoformat(), base.index[-1].date().isoformat()], "cost_pct": cost * 100,
           "trades": len(trades), "per_week": round(len(trades) / span_weeks, 2), "flags": []}
    if not trades:
        out["flags"].append("No trades in the test period: the rules may be too strict, or a condition can never be true together with the others.")
        return out
    r = np.array([t["r"] for t in trades]); g = np.array([t["r_gross"] for t in trades]); w = r > 0
    eq_r = np.cumsum(r)
    eq_usd, path = balance, []
    for x in r:
        eq_usd += x * eq_usd * risk_pct / 100; path.append(eq_usd)
        if eq_usd <= 0: break
    pf = float(r[w].sum() / abs(r[~w].sum())) if (~w).any() else None
    years = {}
    for t in trades: years.setdefault(t["time"][:4], []).append(t["r"])
    third = max(1, len(r) * 2 // 3)
    out.update({"win_rate": round(float(w.mean() * 100), 1), "avg_r": round(float(r.mean()), 3), "avg_r_before_costs": round(float(g.mean()), 3),
                "profit_factor": round(pf, 2) if pf else None, "longest_losing_streak": _streak(r),
                "target_hit_pct": round(sum(t["outcome"] == "target" for t in trades) / len(trades) * 100, 1),
                "max_drawdown_r": round(float((eq_r - np.maximum.accumulate(eq_r)).min()), 2),
                "by_year": {y: {"trades": len(v), "avg_r": round(float(np.mean(v)), 3), "win_rate": round(float(np.mean(np.array(v) > 0) * 100))} for y, v in sorted(years.items())},
                "early_vs_late": {"first_two_thirds_avg_r": round(float(r[:third].mean()), 3), "last_third_avg_r": round(float(r[third:].mean()), 3) if len(r) > third else None},
                "equity_r": [round(float(x), 2) for x in eq_r[:: max(1, len(eq_r) // 120)]],
                "account": {"start": balance, "risk_pct": risk_pct, "end": round(float(path[-1]), 2), "blown": bool(path[-1] <= balance * 0.05)},
                "last_trades": trades[-15:]})
    if len(trades) < 30: out["flags"].append(f"Only {len(trades)} trades: too few to judge. Results this small swing a lot by chance.")
    if out["avg_r_before_costs"] > 0 >= out["avg_r"]: out["flags"].append("It has an edge before costs, but spreads and fees erase it. Wider stops or a higher timeframe may help.")
    if out["early_vs_late"]["last_third_avg_r"] is not None and out["early_vs_late"]["first_two_thirds_avg_r"] > 0 > out["early_vs_late"]["last_third_avg_r"]:
        out["flags"].append("It worked earlier in the period but lost money in the most recent third. The edge may be fading.")
    claimed = (rules.get("claimed") or {}).get("win_rate")
    if claimed:
        diff = float(claimed) - out["win_rate"]
        if abs(diff) >= 10: out["flags"].append(f"The document claims a {claimed}% win rate; real data gives {out['win_rate']}%.")
    return out


# ------------------------------------------------------------------ AI translation
PARSE_PROMPT = """Translate the trading rule book below into the exact JSON rule format described here. Output JSON only.
{schema}
Rules for you:
- Use only the building blocks listed. If the document asks for something they cannot express (news filters, discretion,
  "market structure" by eye), leave it out and add an assumption explaining what was left out.
- Every vague phrase ("near the EMA", "strong candle", "beyond invalidation") must become a concrete choice, recorded in
  "assumptions" with the choice you made and 1-2 alternatives.
- Pick "symbol" from: {markets}. Use the market the document focuses on; if several, pick the first and say so.
- If the document states a win rate or results, copy the win rate into "claimed".
- If the document uses 5-minute or 1-minute charts, use "15m" (the shortest available) and record that as an assumption.
Rule book:
---
{text}
---"""


def parse(text, gemini_generate):
    schema = __doc__.split("Rule format (JSON):")[1].split("The backtest is plain code")[0]
    raw = gemini_generate(PARSE_PROMPT.format(schema=schema, markets=", ".join(MARKETS), text=text[:12000]))
    m = re.search(r"\{.*\}", raw, re.S)
    if not m: raise RuleError("The AI did not return rules. Try rephrasing the rule book.")
    rules = json.loads(m.group(0))
    rules.setdefault("assumptions", []); rules.setdefault("claimed", {"win_rate": None, "notes": ""})
    return validate(rules)
