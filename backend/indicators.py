"""
Technical indicators implemented with plain pandas.

Replaces pandas_ta, whose 0.3.14b0 release (pinned by this project) is no longer
available on PyPI, and whose newer releases renamed several output columns.
Formulas match pandas_ta 0.3.14b (the version this app ran on); column names are the ones app.py reads.

Every function takes a DataFrame with float columns open/high/low/close/volume
(oldest row first) and adds columns to it in place.
"""

import numpy as np
import pandas as pd


def _rma(series: pd.Series, length: int) -> pd.Series:
    """Wilder's moving average (used by RSI and ATR), as in pandas_ta 0.3.14b."""
    return series.ewm(alpha=1.0 / length, min_periods=length).mean()


def _ema(series: pd.Series, length: int) -> pd.Series:
    """EMA seeded with the SMA of the first `length` values (pandas_ta default)."""
    s = series.astype(float).copy()
    first = s.first_valid_index()
    if first is None:
        return s
    start = s.index.get_loc(first)
    if len(s) - start < length:
        return pd.Series(np.nan, index=s.index)
    seed_pos = start + length - 1
    seed = s.iloc[start:seed_pos + 1].mean()
    s.iloc[:seed_pos] = np.nan
    s.iloc[seed_pos] = seed
    return s.ewm(span=length, adjust=False).mean()


def add_rsi(df: pd.DataFrame, length: int = 14) -> None:
    delta = df["close"].diff()
    gain = _rma(delta.clip(lower=0), length)
    loss = _rma(-delta.clip(upper=0), length)
    df[f"RSI_{length}"] = 100 * gain / (gain + loss)


def add_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9) -> None:
    macd = _ema(df["close"], fast) - _ema(df["close"], slow)
    sig = _ema(macd, signal)
    suffix = f"{fast}_{slow}_{signal}"
    df[f"MACD_{suffix}"] = macd
    df[f"MACDh_{suffix}"] = macd - sig
    df[f"MACDs_{suffix}"] = sig


def add_ema(df: pd.DataFrame, length: int) -> None:
    df[f"EMA_{length}"] = _ema(df["close"], length)


def add_sma(df: pd.DataFrame, length: int) -> None:
    df[f"SMA_{length}"] = df["close"].rolling(length).mean()


def add_bbands(df: pd.DataFrame, length: int = 5, std: float = 2.0) -> None:
    mid = df["close"].rolling(length).mean()
    dev = df["close"].rolling(length).std(ddof=0)
    lower, upper = mid - std * dev, mid + std * dev
    suffix = f"{length}_{std}"
    df[f"BBL_{suffix}"] = lower
    df[f"BBM_{suffix}"] = mid
    df[f"BBU_{suffix}"] = upper
    df[f"BBB_{suffix}"] = 100 * (upper - lower) / mid
    df[f"BBP_{suffix}"] = (df["close"] - lower) / (upper - lower)


def add_stoch(df: pd.DataFrame, k: int = 14, d: int = 3, smooth_k: int = 3) -> None:
    lowest = df["low"].rolling(k).min()
    highest = df["high"].rolling(k).max()
    raw = 100 * (df["close"] - lowest) / (highest - lowest)
    stoch_k = raw.rolling(smooth_k).mean()
    suffix = f"{k}_{d}_{smooth_k}"
    df[f"STOCHk_{suffix}"] = stoch_k
    df[f"STOCHd_{suffix}"] = stoch_k.rolling(d).mean()


def add_atr(df: pd.DataFrame, length: int = 14) -> None:
    prev_close = df["close"].shift(1)
    true_range = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1, skipna=False)
    atr = _rma(true_range, length)
    # app.py reads ATR_14; pandas_ta named this column ATRr_14. Provide both.
    df[f"ATR_{length}"] = atr
    df[f"ATRr_{length}"] = atr
