export type Quote = {
  bid: number;
  ask: number;
  spread: number;
  time?: number;
  time_utc?: number;
  stale?: boolean;
  tick_age?: number;
  digits?: number;
  last?: number;
  change?: number;
  daily_high?: number;
  daily_low?: number;
};

export type MarketPrices = Record<string, Quote>;

export type InsightData = {
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  verdict: string;
  phase: string;
  confidence: number;
  risk_level: string;
  regime: string;
  analysis_mode: string;
  ai_available: boolean;
  ai_provider: string;
  current_price: number;
  composite_score: number;
  tcip_component: number;
  key_level_score: number;
  candle_score: number;
  session_score: number;
  atr_score: number;
  ml_component: number;
  bar_total_score: number;
  primary_context: string;
  primary_bias: string;
  holy_grail: number;
  god_mode: number;
  safety_status: string;
  roll_under_reco: string;
  minutes_to_roll: number;
  smc_warning: boolean;
  rsi_14: number;
  [key: string]: unknown;
};

export type Dashboard = {
  status: string;
  open_positions: number;
  open_details: Array<Record<string, unknown>>;
  recent_signals: Array<Record<string, unknown>>;
  engine: { status: string; symbols: string[] };
  insight_data: InsightData | null;
  market_prices: MarketPrices;
  pnl_summary: Record<string, unknown>;
  ml_status: Record<string, unknown>;
  pipeline_health: Record<string, unknown>;
  system_analysis: Record<string, unknown>;
  eco_cal: Record<string, unknown>;
  rejection_counters: Record<string, unknown>;
  rejection_reasons: Record<string, unknown>;
  cr_engine_stats: Record<string, unknown>;
  db_health: Record<string, unknown>;
  feed_pool_queue_depth: number;
  mt5_queue_depth: number;
};

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
