export interface TaskSwitchTrialSpec {
  task_rule: "parity" | "magnitude";
  trial_type: "start" | "repeat" | "switch";
  digit: number;
  switch_trial: boolean;
}

export interface ScoreUpdate {
  score_before: number;
  score_after: number;
  score_delta: number;
}

export class Controller {
  readonly switch_probability: number;
  readonly digit_pool: number[];
  readonly initial_score: number;
  readonly correct_delta: number;
  readonly incorrect_delta: number;
  readonly timeout_delta: number;
  readonly random_seed: number | null;
  readonly enable_logging: boolean;

  current_score: number;
  block_idx: number;
  trial_count_total: number;
  trial_count_block: number;
  previous_rule: "parity" | "magnitude" | null;
  histories: Array<Record<string, unknown>>;

  constructor(args: {
    switch_probability?: number;
    digit_pool?: number[];
    initial_score?: number;
    correct_delta?: number;
    incorrect_delta?: number;
    timeout_delta?: number;
    random_seed?: number | null;
    enable_logging?: boolean;
  }) {
    this.switch_probability = Math.max(0, Math.min(1, Number(args.switch_probability ?? 0.5)));
    this.digit_pool = normalizeDigitPool(args.digit_pool);
    this.initial_score = Number(args.initial_score ?? 0);
    this.correct_delta = Number(args.correct_delta ?? 1);
    this.incorrect_delta = Number(args.incorrect_delta ?? -1);
    this.timeout_delta = Number(args.timeout_delta ?? 0);
    this.random_seed = Number.isFinite(Number(args.random_seed)) ? Number(args.random_seed) : null;
    this.enable_logging = args.enable_logging !== false;

    this.current_score = this.initial_score;
    this.block_idx = -1;
    this.trial_count_total = 0;
    this.trial_count_block = 0;
    this.previous_rule = null;
    this.histories = [];
  }

  static from_dict(config: Record<string, unknown>): Controller {
    return new Controller({
      switch_probability: Number(config.switch_probability ?? 0.5),
      digit_pool: Array.isArray(config.digit_pool) ? config.digit_pool.map(Number) : undefined,
      initial_score: Number(config.initial_score ?? 0),
      correct_delta: Number(config.correct_delta ?? 1),
      incorrect_delta: Number(config.incorrect_delta ?? -1),
      timeout_delta: Number(config.timeout_delta ?? 0),
      random_seed:
        config.random_seed == null || config.random_seed === ""
          ? null
          : Number.isFinite(Number(config.random_seed))
            ? Number(config.random_seed)
            : null,
      enable_logging: Boolean(config.enable_logging ?? true)
    });
  }

  start_block(block_idx: number): void {
    this.block_idx = Number(block_idx);
    this.trial_count_block = 0;
    this.previous_rule = null;
  }

  apply_score(is_correct: boolean | null): ScoreUpdate {
    const scoreBefore = this.current_score;
    const delta =
      is_correct == null ? this.timeout_delta : is_correct === true ? this.correct_delta : this.incorrect_delta;
    const scoreAfter = scoreBefore + delta;
    this.current_score = scoreAfter;
    return {
      score_before: scoreBefore,
      score_after: scoreAfter,
      score_delta: delta
    };
  }

  record_trial(record: Record<string, unknown>): void {
    this.trial_count_total += 1;
    this.trial_count_block += 1;
    this.histories.push({ ...record });
  }
}

function normalizeDigitPool(raw: number[] | undefined): number[] {
  const values = (Array.isArray(raw) ? raw : [1, 2, 3, 4, 6, 7, 8, 9])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
  return values.length > 0 ? values : [1, 2, 3, 4, 6, 7, 8, 9];
}

