"""SEV7N SIGNS engine + API tests on synthetic candles (no network)."""
import numpy as np, pandas as pd, pytest
import strategies as S

def make(n, freq, start="2026-01-01", drift=0.0, seed=0, base=100.0):
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start, periods=n, freq=freq, tz="UTC")
    close = base * np.exp(np.cumsum(drift + rng.normal(0, 0.01, n)))
    open_ = np.r_[close[0], close[:-1]]
    hi = np.maximum(open_, close) * (1 + rng.uniform(0, 0.004, n)); lo = np.minimum(open_, close) * (1 - rng.uniform(0, 0.004, n))
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close, "volume": 1.0}, index=idx)

@pytest.fixture
def fake_market(monkeypatch):
    def fake(symbol, tf, limit=300, include_live=False):
        seed = abs(hash((symbol, tf))) % 1000
        n = {"1h": 400, "4h": 400, "1d": 400}[tf]
        freq = {"1h": "1h", "4h": "4h", "1d": "1D"}[tf]
        end = pd.Timestamp.now(tz="UTC").floor(freq)
        df = make(n, freq, start=end - pd.Timedelta(freq) * (n - 1), drift=0.0005, seed=seed)
        return df.iloc[-limit:]
    monkeypatch.setattr(S, "fetch_candles", fake)
    return fake

def test_weekly_picks_strongest_riser():
    monday = pd.Timestamp("2026-03-02", tz="UTC")
    data = {}
    for i, s in enumerate(S.MAJORS):
        d = make(80, "1D", start="2025-12-20", seed=i)
        prev = d[d.index < monday]
        d.loc[d.index >= monday, ["open"]] = prev["close"].iloc[-8] * (1 + 0.01 * (i + 1))  # all rose; GOLD (i=4) most
        data[s] = d
    res = S.weekly_from_daily(data, monday)
    assert res["pick"] is not None and res["pick"]["side"] == "long"
    p = res["pick"]; assert p["sl"] < p["entry"] < p["tp"]
    assert abs((p["tp"] - p["entry"]) - 3 * (p["entry"] - p["sl"])) < 1e-6 * p["entry"] + 1e-3

def test_weekly_sits_out_when_nothing_rose():
    monday = pd.Timestamp("2026-03-02", tz="UTC"); data = {}
    for i, s in enumerate(S.MAJORS):
        d = make(80, "1D", start="2025-12-20", seed=i); prev = d[d.index < monday]
        d.loc[d.index >= monday, ["open"]] = prev["close"].iloc[-8] * 0.95
        data[s] = d
    res = S.weekly_from_daily(data, monday)
    assert res["pick"] is None and "sits out" in res["note"]

def test_scan_structure(fake_market):
    res = S.scan("all")
    assert set(res) >= {"signals", "near", "weekly", "errors", "generated_at"}
    assert res["errors"] == [] and res["markets_scanned"] == len(S.UNIVERSE)
    for s in res["signals"]:
        assert s["side"] in ("long", "short") and s["strategy"] in S.STATS
        if s["side"] == "long": assert s["sl"] < s["entry"] < s["tp"]
        else: assert s["tp"] < s["entry"] < s["sl"]
    for n in res["near"]:
        assert 0 < n["met"] < n["total"] and n["checks"]

def test_short_scan_only_shorts(fake_market):
    res = S.scan("short")
    assert res["weekly"] is None and all(s["side"] == "short" for s in res["signals"])
    assert all(n["side"] == "short" for n in res["near"])

def test_trade_status_first_touch(monkeypatch):
    idx = pd.date_range("2026-03-02", periods=5, freq="1h", tz="UTC")
    df = pd.DataFrame({"open": [100]*5, "high": [101, 102, 104, 103, 103], "low": [99, 99, 98, 95, 99], "close": [100]*5, "volume": 1.0}, index=idx)
    monkeypatch.setattr(S, "fetch_candles", lambda *a, **k: df)
    base = {"symbol": "BTCUSDT", "entry": 100, "opened_at": "2026-03-02T00:00:00Z", "expires": "2026-03-09T00:00:00Z"}
    assert S.trade_status({**base, "side": "long", "sl": 96, "tp": 103.5})["status"] == "target_hit"
    assert S.trade_status({**base, "side": "long", "sl": 98.5, "tp": 110})["status"] == "stopped"
    assert S.trade_status({**base, "side": "short", "sl": 105, "tp": 96})["status"] == "target_hit"

def test_api_routes(fake_market, client):
    assert client.get("/api/strategies").status_code == 200
    r = client.get("/api/scan?side=long"); assert r.status_code == 200 and "signals" in r.get_json()
    assert client.get("/api/scan?side=bogus").status_code == 400
    assert client.get("/api/candles?symbol=GOLD&tf=4h&limit=30").get_json()["candles"]
    r = client.post("/api/cron/scan"); assert r.status_code == 200
    assert "skipped" in client.post("/api/cron/scan").get_json()          # 10-minute cooldown
    assert client.post("/api/explain", json={"signal": {"id": "x"}}).status_code == 503  # no AI key in tests

def test_market_view(fake_market, client):
    assert len(client.get("/api/markets").get_json()) == len(S.MARKETS)
    d = client.get("/api/market?symbol=ETHUSDT").get_json()
    assert d["ticker"] == "ETH" and len(d["strategies"]) == 3 and d["weekly"] is not None
    for v in d["strategies"]:
        assert v["checks"] and 0 <= v["met"] <= v["total"] and "signal" in v
    g = client.get("/api/market?symbol=GOLD").get_json()
    assert g["tested"] is False
    by = {(v["strategy"], v["side"]): v for v in g["strategies"]}
    assert by[("squeeze", "long")]["tested_here"] is True and "40 trades" in by[("squeeze", "long")]["note"]
    assert by[("pullback", "long")]["tested_here"] is False and "lost money" in by[("pullback", "long")]["note"]
    assert client.get("/api/market?symbol=NOPE").status_code == 400

def test_scalp_live(fake_market, client, monkeypatch):
    def fake(symbol, tf, limit=300, include_live=False):
        freq = {"5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}[tf]
        end = pd.Timestamp.now(tz="UTC").floor(freq)
        return make(400, freq, start=end - pd.Timedelta(freq) * 399, seed=3).iloc[-limit:]
    monkeypatch.setattr(S, "fetch_candles", fake)
    d = client.get("/api/scalp?symbol=BTCUSDT").get_json()
    assert len(d["sides"]) == 2 and all(len(v["checks"]) == 7 for v in d["sides"])
    assert client.get("/api/scalp?symbol=DOGEUSDT").status_code == 400

def test_lab_engine_on_synthetic(monkeypatch):
    import lab
    base = make(3000, "1h", start="2024-01-01", seed=7)
    monkeypatch.setattr(lab, "_download", lambda s, tf: base.tz_localize(None))
    rules = {"name": "t", "symbol": "BTCUSDT", "timeframe": "1h",
             "long": [{"type": "compare", "a": {"ind": "ema", "period": 21}, "op": ">", "b": {"ind": "ema", "period": 50}, "tf": "4h"},
                      {"type": "cross", "a": {"ind": "macd"}, "b": {"ind": "macd_signal"}, "dir": "above", "within": 2},
                      {"type": "touch", "level": {"ind": "ema", "period": 21}, "within": 3, "from": "above"}],
             "short": [], "stop": {"type": "atr", "mult": 1.5}, "target": {"type": "rr", "value": 3}, "max_hold_bars": 48,
             "claimed": {"win_rate": 80}}
    rep = lab.backtest(rules, 25, 2)
    assert rep["trades"] > 0 and "win_rate" in rep and rep["by_year"]
    assert any("claims" in f for f in rep["flags"])        # fake-backtest flag fires for an 80% claim
    import pytest
    with pytest.raises(lab.RuleError):
        lab.validate({**rules, "timeframe": "1h", "long": [{"type": "candle", "pattern": "dragon"}]})

def test_live_prices(monkeypatch, client):
    calls = []
    def fake_ticker(sym, cat="spot"):
        calls.append((sym, cat))
        if sym == "XAUTUSDT": raise ValueError("down")
        return {"price": 4000.0 if sym == "PAXGUSDT" else 70000.0, "change_24h_pct": 1.5}
    monkeypatch.setattr(S, "_bybit_ticker", fake_ticker); S._price_cache.clear()
    d = client.get("/api/prices?symbols=BTCUSDT,GOLD,NOPE").get_json()
    assert set(d["prices"]) == {"BTCUSDT", "GOLD"} and d["prices"]["GOLD"]["price"] == 4000.0   # gold fell back to PAXG
    n = len(calls); client.get("/api/prices?symbols=BTCUSDT"); assert len(calls) == n           # served from the 5s cache
    assert client.get("/api/prices?symbols=NOPE").status_code == 400

def test_trade_status_ignores_prices_before_open(monkeypatch):
    # the 16:00 candle dipped to 95 BEFORE the trade opened at 16:07; it must not count as a stop
    idx = pd.date_range("2026-03-02 16:00", periods=4, freq="5min", tz="UTC")
    df = pd.DataFrame({"open": [100]*4, "high": [100.5]*4, "low": [95, 99.5, 99.6, 99.7], "close": [100]*4, "volume": 1.0}, index=idx)
    monkeypatch.setattr(S, "fetch_candles", lambda *a, **k: df)
    monkeypatch.setattr(S, "_now", lambda: pd.Timestamp("2026-03-02 16:20", tz="UTC").to_pydatetime())
    st = S.trade_status({"symbol": "BTCUSDT", "side": "long", "entry": 100, "sl": 98, "tp": 106, "opened_at": "2026-03-02T16:07:00Z"})
    assert st["status"] == "open"

def test_alert_session_and_batch_scalp(monkeypatch, client):
    import alerts, scalp as SC
    def fake(symbol, tf, limit=300, include_live=False):
        freq = {"5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}[tf]
        end = pd.Timestamp.now(tz="UTC").floor(freq)
        return make(400, freq, start=end - pd.Timedelta(freq) * 399, seed=3).iloc[-limit:]
    monkeypatch.setattr(S, "fetch_candles", fake)
    d = client.get("/api/scalp?symbols=BTCUSDT,ETHUSDT").get_json()
    assert [m["symbol"] for m in d["markets"]] == ["BTCUSDT", "ETHUSDT"]
    monkeypatch.setattr(alerts, "_loop", lambda: None)            # don't start the real watcher in tests
    end = (pd.Timestamp.now(tz="UTC") + pd.Timedelta(minutes=30)).isoformat()
    st = client.post("/api/alerts/session", json={"symbols": ["BTCUSDT", "DOGEUSDT"], "end_at": end}).get_json()
    assert st["active"] and st["session"]["symbols"] == ["BTCUSDT"]
    sent = []; monkeypatch.setattr(alerts, "_send", sent.append)
    monkeypatch.setattr(SC, "live", lambda s, f: {"sides": [{"setup": {"id": "x1", "side": "long", "entry": 100.0, "sl": 99.0, "tp": 101.5, "rr": 1.5, "expires": "2026-01-01T10:00:00+00:00"}}]})
    alerts.STATE["sent"].clear(); alerts.check_once(); alerts.check_once()
    assert len(sent) == 1 and "HIGH RISK" in sent[0]                   # sent once, not repeated
    assert client.delete("/api/alerts/session").get_json()["active"] is False
    assert client.post("/api/alerts/session", json={"symbols": ["BTCUSDT"], "end_at": "2020-01-01T00:00:00Z"}).status_code == 400
