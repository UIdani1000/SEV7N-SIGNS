/** Plain-language description of every strategy. Shown on signals, the High Risk screen and "How the strategies work". */
export type GuideKey = "weekly" | "squeeze" | "pullback" | "scalp";
export type Overlay = "lastWeek" | "bands" | "ema21" | "ema50" | "momentum";

export interface Guide {
  key: GuideKey; name: string;
  idea: string;                 // one sentence anyone can follow
  lookFor: string[];            // what has to be true, in order
  chart: string; tf: string;    // label shown to people, and the candles drawn
  enter: string; perWeek: string; hold: string; sides: string; markets: string;
  expect: string;               // honest odds in plain numbers
  short: { enter: string; week: string; wins: string };   // chip-sized versions for the strategy header
  practice?: boolean;           // never for real money
  overlays: Overlay[]; example: string;   // what the chart draws, and the market used for the example chart
}

export const GUIDES: Record<GuideKey, Guide> = {
  weekly: {
    key: "weekly", name: "Weekly Trend",
    idea: "Every Monday, buy the market that climbed most steadily last week.",
    lookFor: ["Compares BTC, ETH, SOL, XRP and gold over the past seven days",
      "Picks the steadiest climber, not just the biggest jump",
      "If none of them went up, it sits the week out"],
    chart: "Daily", tf: "1d",
    enter: "Monday, at the start of the week. Seeing it after Monday? Skip it.",
    perWeek: "1, sometimes none", hold: "Up to 7 days. It closes next Monday if neither the stop nor the target hits.",
    sides: "Buy only", markets: "BTC, ETH, SOL, XRP, gold",
    expect: "Wins about 5 in 10. The steadiest of the strategies: profitable in every year tested.",
    short: { enter: "Mondays only", week: "1 a week", wins: "5 in 10 win" },
    overlays: ["lastWeek"], example: "BTCUSDT",
  },
  squeeze: {
    key: "squeeze", name: "Squeeze Breakout",
    idea: "When a rising market goes quiet and then bursts upward, buy the burst.",
    lookFor: ["The bigger, daily trend is up",
      "Price has been unusually calm for at least 3 candles (the purple lines pinch inside the shaded band)",
      "A candle closes above the calm range"],
    chart: "4-hour", tf: "4h",
    enter: "Within 1 hour of the 4-hour candle closing.",
    perWeek: "1–2 across all markets", hold: "Usually about 2 days, at most 7.",
    sides: "Buy only", markets: "20 coins and gold",
    expect: "Wins about 3 in 10, but each win pays 3 times a loss. Expect long losing runs between the wins.",
    short: { enter: "Within 1h of close", week: "1–2 a week", wins: "3 in 10 win" },
    overlays: ["bands"], example: "BTCUSDT",
  },
  pullback: {
    key: "pullback", name: "Trend Pullback",
    idea: "Join a strong trend after a small dip, just as it starts moving again.",
    lookFor: ["The daily trend is clearly up (down, for sells)",
      "Price dips back to its average line and holds above the slower line",
      "Momentum turns back the trend’s way and a strong candle confirms it"],
    chart: "1-hour", tf: "1h",
    enter: "Within 20 minutes of the 1-hour candle closing.",
    perWeek: "3–5", hold: "About 3 days, at most 7.",
    sides: "Buy and sell", markets: "20 coins",
    expect: "Wins about 1 in 3. The thinnest edge of the three: small profits spread over many trades.",
    short: { enter: "Within 20 min of close", week: "3–5 a week", wins: "1 in 3 win" },
    overlays: ["ema21", "ema50", "momentum"], example: "ETHUSDT",
  },
  scalp: {
    key: "scalp", name: "High Risk scalp",
    idea: "Quick in-and-out trades in the direction of the short-term trend.",
    lookFor: ["The 1-hour and 15-minute trends point the same way",
      "Price dips to its short-term average line and bounces back off it",
      "Momentum is building, and the move is big enough to cover the spread"],
    chart: "5-minute", tf: "5m",
    enter: "Within 5 minutes of the alert, or skip it.",
    perWeek: "Several a day while a session runs", hold: "1 hour at most, then close at whatever price it’s at.",
    sides: "Buy and sell", markets: "BTC, ETH, SOL, XRP; gold only 12:00–20:00 UTC",
    expect: "Loses money over time once spreads are paid: about 4 in 10 win, and the average scalp loses about a fifth of what it risks.",
    short: { enter: "Within 5 min", week: "Several a day", wins: "Loses over time" },
    practice: true, overlays: ["ema21", "momentum"], example: "BTCUSDT",
  },
};

export const CORE: GuideKey[] = ["weekly", "squeeze", "pullback"];
export const ORDER: GuideKey[] = ["weekly", "squeeze", "pullback", "scalp"];
export const SWITCH_LABEL: Record<GuideKey, string> = { weekly: "Weekly", squeeze: "Squeeze", pullback: "Pullback", scalp: "High Risk" };

/** What each chart overlay means, in plain words. */
export const LEGEND: Record<Overlay, string> = {
  lastWeek: "Shaded: last week, the move that got ranked",
  bands: "Shaded: normal range. Purple lines: price swings. Dots: coiled, ready to break",
  ema21: "Purple line: recent average price",
  ema50: "Dashed line: slower average. Above it, the trend is up",
  momentum: "Bars: momentum. Purple, buyers pushing; red, sellers",
};
