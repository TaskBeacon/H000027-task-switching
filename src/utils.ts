import type { ReducedTrialRow } from "psyflow-web";
import { PythonRandom } from "psyflow-web";

export interface TaskSwitchSummary {
  total_trials: number;
  accuracy: number;
  switch_accuracy: number;
  repeat_accuracy: number;
  timeout_count: number;
  mean_rt_ms: number;
  mean_switch_rt_ms: number;
  mean_repeat_rt_ms: number;
  switch_cost_ms: number;
  score_end: number;
  net_score: number;
}

export interface GeneratedTaskSwitchingCondition {
  condition: string;
  condition_id: string;
  trial_index: number;
  task_rule: "parity" | "magnitude";
  trial_type: "start" | "repeat" | "switch";
  target_digit: number;
  switch_trial: boolean;
  fixation_duration: number | null;
  iti_duration: number | null;
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

function sampleDuration(rng: PythonRandom, value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (Array.isArray(value) && value.length >= 2) {
    let low = Number(value[0]);
    let high = Number(value[1]);
    if (!Number.isFinite(low)) {
      low = defaultValue;
    }
    if (!Number.isFinite(high)) {
      high = defaultValue;
    }
    if (high < low) {
      [low, high] = [high, low];
    }
    return Math.max(0, low + (high - low) * rng.random());
  }
  return Math.max(0, defaultValue);
}

function normalizeDigitPool(value: unknown): number[] {
  const digits = (Array.isArray(value) ? value : [1, 2, 3, 4, 6, 7, 8, 9])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item));
  return digits.length > 0 ? digits : [1, 2, 3, 4, 6, 7, 8, 9];
}

function choice<T>(rng: PythonRandom, values: T[]): T {
  if (values.length === 0) {
    throw new Error("Cannot sample from an empty list.");
  }
  return values[rng.randBelow(values.length)];
}

export function generate_task_switching_conditions(
  n_trials: number,
  condition_labels: string[] | null | undefined,
  switch_probability: number,
  digit_pool: number[] | null | undefined,
  fixation_duration: unknown,
  iti_duration: unknown,
  random_seed: number | null | undefined,
  seed_offset: number,
  _enable_logging: boolean,
  seed: number
): string[] {
  const labels = (Array.isArray(condition_labels) ? condition_labels : ["cued_switching"]).map(String);
  const conditionName = labels[0] ?? "cued_switching";
  const n = Math.max(0, Math.trunc(Number(n_trials)));
  const baseSeed = Math.trunc(Number(random_seed == null ? seed : random_seed)) + Math.trunc(Number(seed_offset ?? 0));
  const trialRng = new PythonRandom(baseSeed);
  const timingRng = new PythonRandom(baseSeed + 10000019);
  const switchProbability = Math.max(0, Math.min(1, Number(switch_probability ?? 0.5)));
  const digits = normalizeDigitPool(digit_pool);

  let previousRule: "parity" | "magnitude" | null = null;
  const planned: string[] = [];
  for (let trialIndex = 1; trialIndex <= n; trialIndex += 1) {
    let taskRule: "parity" | "magnitude";
    let trialType: "start" | "repeat" | "switch";
    if (previousRule == null) {
      taskRule = choice(trialRng, ["parity", "magnitude"]);
      trialType = "start";
    } else {
      const doSwitch = trialRng.random() < switchProbability;
      taskRule = doSwitch ? (previousRule === "parity" ? "magnitude" : "parity") : previousRule;
      trialType = taskRule === previousRule ? "repeat" : "switch";
    }

    const targetDigit = choice(trialRng, digits);
    previousRule = taskRule;
    const conditionId = `${conditionName}_${taskRule}_${trialType}_d${targetDigit}_t${String(trialIndex).padStart(3, "0")}`;
    planned.push(
      JSON.stringify({
        condition: conditionName,
        condition_id: conditionId,
        trial_index: trialIndex,
        task_rule: taskRule,
        trial_type: trialType,
        target_digit: targetDigit,
        switch_trial: trialType === "switch",
        fixation_duration: sampleDuration(timingRng, fixation_duration, 0.45),
        iti_duration: sampleDuration(timingRng, iti_duration, 0.45)
      })
    );
  }
  return planned;
}

export function parse_task_switching_condition(condition: string): GeneratedTaskSwitchingCondition {
  const parsed = JSON.parse(String(condition)) as Partial<GeneratedTaskSwitchingCondition>;
  const trialType = String(parsed.trial_type ?? "start").trim().toLowerCase();
  return {
    condition: String(parsed.condition ?? "cued_switching").trim().toLowerCase(),
    condition_id: String(parsed.condition_id ?? parsed.condition ?? "cued_switching"),
    trial_index: Math.max(1, Math.trunc(Number(parsed.trial_index ?? 1))),
    task_rule: String(parsed.task_rule ?? "parity").trim().toLowerCase() === "magnitude" ? "magnitude" : "parity",
    trial_type: trialType === "switch" ? "switch" : trialType === "repeat" ? "repeat" : "start",
    target_digit: Math.trunc(Number(parsed.target_digit ?? 1)),
    switch_trial: Boolean(parsed.switch_trial ?? trialType === "switch"),
    fixation_duration: parsed.fixation_duration == null ? null : Number(parsed.fixation_duration),
    iti_duration: parsed.iti_duration == null ? null : Number(parsed.iti_duration)
  };
}

function summarizeRows(rows: ReducedTrialRow[], fallbackScore = 0): TaskSwitchSummary {
  if (rows.length === 0) {
    return {
      total_trials: 0,
      accuracy: 0,
      switch_accuracy: 0,
      repeat_accuracy: 0,
      timeout_count: 0,
      mean_rt_ms: 0,
      mean_switch_rt_ms: 0,
      mean_repeat_rt_ms: 0,
      switch_cost_ms: 0,
      score_end: fallbackScore,
      net_score: 0
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
    accuracy: accuracy(responded),
    switch_accuracy: accuracy(switchRows),
    repeat_accuracy: accuracy(repeatRows),
    timeout_count: timeoutCount,
    mean_rt_ms: Number(meanRtMs.toFixed(1)),
    mean_switch_rt_ms: Number(meanSwitchRtMs.toFixed(1)),
    mean_repeat_rt_ms: Number(meanRepeatRtMs.toFixed(1)),
    switch_cost_ms: Number(switchCostMs.toFixed(1)),
    score_end: scoreEnd,
    net_score: netScore
  };
}

export function summarizeBlock(rows: ReducedTrialRow[], blockId: string, fallbackScore = 0): TaskSwitchSummary {
  const blockRows = rows.filter((row) => String(row.block_id ?? "") === blockId);
  return summarizeRows(blockRows, fallbackScore);
}

export function summarizeOverall(rows: ReducedTrialRow[], fallbackScore = 0): TaskSwitchSummary {
  return summarizeRows(rows, fallbackScore);
}
