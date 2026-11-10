"""API behaviour with Bybit mocked out (no network, no real AI)."""
import json

FIELDS = ["confidence_score", "signal_strength", "market_summary", "ai_suggestion", "stop_loss",
          "take_profit_1", "take_profit_2", "technical_indicators_analysis", "next_step_for_user",
          "ormcr_confirmation_status", "ormcr_overall_bias", "ormcr_reason"]

ANALYSIS_REQUEST = {
    "currencyPair": "BTC/USD", "timeframes": ["H4", "H1"], "tradeType": "Scalp",
    "indicators": ["RSI", "MACD", "Moving Averages", "Bollinger Bands", "Stochastic Oscillator", "Volume", "ATR"],
    "availableBalance": 1000, "leverage": 1,
}


def test_health(client):
    r = client.get("/")
    assert r.status_code == 200


def test_market_prices(client):
    r = client.get("/all_market_prices")
    assert r.status_code == 200
    data = r.get_json()
    assert set(data) == {"BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"}
    for row in data.values():
        assert isinstance(row["price"], float)
        assert isinstance(row["rsi"], float)


def test_analysis_works_without_ai(client):
    r = client.post("/run_ormcr_analysis", json=ANALYSIS_REQUEST)
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    for f in FIELDS:
        assert f in data, f
    assert data["confidence_score"].endswith("%")
    assert data["ai_suggestion"]["entry_type"] in ("BUY ORDER", "SELL ORDER", "WAIT")


def test_analysis_falls_back_when_ai_errors(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "gemini_client", object())
    def boom(*a, **k):
        raise RuntimeError("403 suspended")
    monkeypatch.setattr(app_module, "gemini_generate", boom)
    r = client.post("/run_ormcr_analysis", json=ANALYSIS_REQUEST)
    assert r.status_code == 200
    data = r.get_json()
    assert "AI commentary unavailable" in data["next_step_for_user"]
    for f in FIELDS:
        assert f in data


def test_backend_numbers_override_ai(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "gemini_client", object())
    fake = {f: "AI TEXT" for f in ["confidence_score", "signal_strength", "market_summary",
                                   "technical_indicators_analysis", "next_step_for_user"]}
    fake.update({"ai_suggestion": {"entry_type": "BUY ORDER", "recommended_action": "ENTER NOW", "position_size": "99%"},
                 "stop_loss": {"price": "$1", "percentage_change": "1%"},
                 "take_profit_1": {"price": "$1", "percentage_change": "1%"},
                 "take_profit_2": {"price": "$1", "percentage_change": "1%"}})
    monkeypatch.setattr(app_module, "gemini_generate", lambda *a, **k: json.dumps(fake))
    base = client.post("/run_ormcr_analysis", json=ANALYSIS_REQUEST)  # same data, so same signal
    monkeypatch.setattr(app_module, "gemini_client", None)
    expected = client.post("/run_ormcr_analysis", json=ANALYSIS_REQUEST).get_json()
    got = base.get_json()
    assert got["market_summary"] == "AI TEXT"                      # AI writes the prose
    assert got["confidence_score"] == expected["confidence_score"]  # backend owns the numbers
    assert got["stop_loss"] == expected["stop_loss"]
    assert got["ai_suggestion"] == expected["ai_suggestion"]


def test_analysis_validates_input(client):
    assert client.post("/run_ormcr_analysis", json={}).status_code == 400


def test_atr_column_now_exists(app_module, reference_df):
    df = reference_df[["open", "high", "low", "close", "volume"]].copy()
    out = app_module.calculate_indicators_for_df(df, ["ATR"])
    assert isinstance(app_module.get_indicator_value(out, "ATR_14"), float)


def test_chat_without_ai_returns_clear_error(client):
    r = client.post("/chat", json={"message": "hi", "chatHistory": []})
    assert r.status_code == 503
    assert "GEMINI_API_KEY" in r.get_json()["error"]


def test_chat_with_ai(client, app_module, monkeypatch):
    seen = {}
    def fake_generate(contents, system_instruction=None, response_schema=None):
        seen["contents"], seen["system"] = contents, system_instruction
        return "Hello from Aura"
    monkeypatch.setattr(app_module, "gemini_client", object())
    monkeypatch.setattr(app_module, "gemini_generate", fake_generate)
    history = [{"role": "model", "text": "greeting"}, {"role": "user", "text": "hi"},
               {"role": "model", "text": "hey"}, {"role": "user", "text": "price of BTC?"}]
    r = client.post("/chat", json={"message": "price of BTC?", "chatHistory": history})
    assert r.status_code == 200
    assert r.get_json()["response"] == "Hello from Aura"
    assert seen["contents"][0]["role"] == "user"                          # leading model turn dropped
    assert [c["parts"][0]["text"] for c in seen["contents"]].count("price of BTC?") == 1  # no duplicate
    assert "BTCUSDT" in seen["system"]                                    # market context included


def test_cors_allows_dashboard_only(client):
    ok = client.get("/", headers={"Origin": "https://aura-trading-dashboard-frontend.vercel.app"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "https://aura-trading-dashboard-frontend.vercel.app"
    preview = client.get("/", headers={"Origin": "https://aura-trading-dashboard-frontend-abc123-bignssien-gmailcoms-projects.vercel.app"})
    assert preview.headers.get("Access-Control-Allow-Origin")
    bad = client.get("/", headers={"Origin": "https://evil.example.com"})
    assert bad.headers.get("Access-Control-Allow-Origin") is None


class _FakeModels:
    """Stands in for gemini_client.models; fails for models listed in `failing`."""
    def __init__(self, failing):
        self.failing, self.calls = failing, []

    def generate_content(self, model, contents, config):
        self.calls.append(model)
        if model in self.failing:
            raise RuntimeError(f"503 UNAVAILABLE on {model}")
        return type("R", (), {"text": f"answer from {model}"})()


def _fake_client(failing):
    return type("C", (), {"models": _FakeModels(failing)})()


def test_gemini_falls_back_to_lighter_model(app_module, monkeypatch):
    fake = _fake_client(failing={app_module.GEMINI_MODEL})
    monkeypatch.setattr(app_module, "gemini_client", fake)
    assert app_module.gemini_generate("hi") == f"answer from {app_module.GEMINI_FALLBACK_MODEL}"
    assert fake.models.calls == [app_module.GEMINI_MODEL, app_module.GEMINI_FALLBACK_MODEL]


def test_both_models_down_still_returns_signal(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "gemini_client",
                        _fake_client(failing={app_module.GEMINI_MODEL, app_module.GEMINI_FALLBACK_MODEL}))
    r = client.post("/run_ormcr_analysis", json=ANALYSIS_REQUEST)
    assert r.status_code == 200
    assert "AI commentary unavailable" in r.get_json()["next_step_for_user"]


def test_market_data_is_cached(client, app_module, monkeypatch):
    calls = []
    original = app_module.bybit_client.get_kline
    monkeypatch.setattr(app_module.bybit_client, "get_kline", lambda **kw: calls.append(1) or original(**kw))
    client.get("/all_market_prices")
    client.get("/all_market_prices")
    client.post("/chat", json={"message": "hi"})  # 503 (no AI) but must not refetch either
    assert len(calls) == 6  # one fetch per symbol, reused afterwards


def test_gunicorn_timeout_allows_ai_fallback():
    import runpy, os
    cfg = runpy.run_path(os.path.join(os.path.dirname(__file__), "..", "gunicorn.conf.py"))
    assert cfg["timeout"] >= 90
