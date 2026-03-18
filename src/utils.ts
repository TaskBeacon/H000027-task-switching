import type { ReducedTrialRow } from "psyflow-web";

export interface TaskSwitchSummary {
  total_trials: number;
  accuracy: string;
  switch_accuracy: string;
  repeat_accuracy: string;
  timeout_count: number;
  mean_rt_ms: number;
  mean_switch_rt_ms: number;
  mean_repeat_rt_ms: number;
  switch_cost_ms: number;
  switch_cost_ms_signed: string;
  score_end: number;
  net_score: number;
  net_score_signed: string;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function asFloat(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function accuracy(rows: ReducedTrialRow[]): number {
  const values = rows
    .map((row) => row.is_correct)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => asBool(value));
  if (values.length === 0) {
    return 0;
  }
  return values.filter(Boolean).length / values.length;
}

function decisionRtS(row: ReducedTrialRow): number | null {
  const rtS = asFloat(row.decision_rt_s);
  if (rtS != null) {
    return rtS;
  }
  return asFloat(row.decision_rt);
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function summarizeRows(rows: ReducedTrialRow[], fallbackScore = 0): TaskSwitchSummary {
  if (rows.length === 0) {
    return {
      total_trials: 0,
      accuracy: "0.0%",
      switch_accuracy: "0.0%",
      repeat_accuracy: "0.0%",
      timeout_count: 0,
      mean_rt_ms: 0,
      mean_switch_rt_ms: 0,
      mean_repeat_rt_ms: 0,
      switch_cost_ms: 0,
      switch_cost_ms_signed: "0",
      score_end: fallbackScore,
      net_score: 0,
      net_score_signed: "0"
    };
  }

  const timeoutCount = rows.filter((row) => asBool(row.decision_timed_out)).length;
  const responded = rows.filter((row) => !asBool(row.decision_timed_out));
  const switchRows = responded.filter((row) => String(row.trial_type ?? "").trim().toLowerCase() === "switch");
  const repeatRows = responded.filter((row) => String(row.trial_type ?? "").trim().toLowerCase() === "repeat");

  const rtValues = responded
    .map((row) => decisionRtS(row))
    .filter((value): value is number => value != null);
  const switchRtValues = switchRows
    .map((row) => decisionRtS(row))
    .filter((value): value is number => value != null);
  const repeatRtValues = repeatRows
    .map((row) => decisionRtS(row))
    .filter((value): value is number => value != null);

  const meanRtMs = rtValues.length > 0 ? mean(rtValues) * 1000 : 0;
  const meanSwitchRtMs = switchRtValues.length > 0 ? mean(switchRtValues) * 1000 : 0;
  const meanRepeatRtMs = repeatRtValues.length > 0 ? mean(repeatRtValues) * 1000 : 0;
  const switchCostMs = switchRtValues.length > 0 && repeatRtValues.length > 0 ? meanSwitchRtMs - meanRepeatRtMs : 0;

  let scoreEnd = fallbackScore;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].score_after != null) {
      scoreEnd = asInt(rows[index].score_after, fallbackScore);
      break;
    }
  }
  const netScore = rows.reduce((sum, row) => sum + asInt(row.score_delta, 0), 0);

  return {
    total_trials: rows.length,
    accuracy: `${(accuracy(responded) * 100).toFixed(1)}%`,
    switch_accuracy: `${(accuracy(switchRows) * 100).toFixed(1)}%`,
    repeat_accuracy: `${(accuracy(repeatRows) * 100).toFixed(1)}%`,
    timeout_count: timeoutCount,
    mean_rt_ms: Number(meanRtMs.toFixed(1)),
    mean_switch_rt_ms: Number(meanSwitchRtMs.toFixed(1)),
    mean_repeat_rt_ms: Number(meanRepeatRtMs.toFixed(1)),
    switch_cost_ms: Number(switchCostMs.toFixed(1)),
    switch_cost_ms_signed: signed(Math.round(switchCostMs)),
    score_end: scoreEnd,
    net_score: netScore,
    net_score_signed: signed(netScore)
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string, fallbackScore = 0): TaskSwitchSummary {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  return summarizeRows(blockRows, fallbackScore);
}

export function summarizeOverall(rows: ReducedTrialRow[], fallbackScore = 0): TaskSwitchSummary {
  return summarizeRows(rows, fallbackScore);
}
