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
    assert g["tested"] is False and all(v["tested_here"] is False for v in g["strategies"])
    assert client.get("/api/market?symbol=NOPE").status_code == 400
