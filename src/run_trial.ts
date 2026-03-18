import {
  set_trial_context,
  type StimBank,
  type TaskSettings,
  type TrialBuilder,
  type TrialSnapshot
} from "psyflow-web";

import type { Controller, ScoreUpdate } from "./controller";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function scoreDeltaFromCorrectness(isCorrect: boolean | null, controller: Controller): number {
  if (isCorrect == null) {
    return controller.timeout_delta;
  }
  return isCorrect ? controller.correct_delta : controller.incorrect_delta;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function rule_profile(
  taskRule: string,
  targetDigit: number,
  leftKey: string,
  rightKey: string,
  settings: TaskSettings
): {
  rule: "parity" | "magnitude";
  rule_name: string;
  left_label: string;
  right_label: string;
  correct_key: string;
  correct_category: string;
  correct_label: string;
} {
  const ruleNames = asRecord(settings.rule_names);
  const responseLabels = asRecord(settings.response_labels);
  const rule = taskRule === "magnitude" ? "magnitude" : "parity";
  const localizedRuleName = String(ruleNames[rule] ?? rule);
  const labelsByRule = asRecord(responseLabels[rule]);

  if (rule === "parity") {
    const leftLabel = String(labelsByRule.left ?? "odd");
    const rightLabel = String(labelsByRule.right ?? "even");
    const isLeftCorrect = targetDigit % 2 === 1;
    const correctCategory = isLeftCorrect ? "odd" : "even";
    return {
      rule,
      rule_name: localizedRuleName,
      left_label: leftLabel,
      right_label: rightLabel,
      correct_key: isLeftCorrect ? leftKey : rightKey,
      correct_category: correctCategory,
      correct_label: isLeftCorrect ? leftLabel : rightLabel
    };
  }

  const leftLabel = String(labelsByRule.left ?? "<5");
  const rightLabel = String(labelsByRule.right ?? ">5");
  const isLeftCorrect = targetDigit < 5;
  const correctCategory = isLeftCorrect ? "lt5" : "gt5";
  return {
    rule,
    rule_name: localizedRuleName,
    left_label: leftLabel,
    right_label: rightLabel,
    correct_key: isLeftCorrect ? leftKey : rightKey,
    correct_category: correctCategory,
    correct_label: isLeftCorrect ? leftLabel : rightLabel
  };
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (value == null) {
    return null;
  }
  return Boolean(value);
}

function buildScorePreview(currentScore: number, isCorrect: boolean | null, controller: Controller): ScoreUpdate {
  const scoreDelta = scoreDeltaFromCorrectness(isCorrect, controller);
  return {
    score_before: currentScore,
    score_after: currentScore + scoreDelta,
    score_delta: scoreDelta
  };
}

export function run_trial(
  trial: TrialBuilder,
  condition: string,
  context: {
    settings: TaskSettings;
    stimBank: StimBank;
    controller: Controller;
    block_id: string;
    block_idx: number;
  }
): TrialBuilder {
  const { settings, stimBank, controller, block_id, block_idx } = context;
  const conditionName = String(condition).trim().toLowerCase();
  const trialId = controller.next_trial_id();
  const trialSpec = controller.build_trial();
  const taskRule = String(trialSpec.task_rule ?? "parity").trim().toLowerCase();
  const trialType = String(trialSpec.trial_type ?? "repeat").trim().toLowerCase();
  const targetDigit = Number(trialSpec.digit ?? 1);

  const leftKey = String(settings.left_key ?? "f").trim().toLowerCase();
  const rightKey = String(settings.right_key ?? "j").trim().toLowerCase();
  const responseKeys = [leftKey, rightKey];
  const trialTypeNames = asRecord(settings.trial_type_names);
  const trialTypeLabel = String(trialTypeNames[trialType] ?? trialType);
  const profile = rule_profile(taskRule, targetDigit, leftKey, rightKey, settings);

  const fixationDuration = controller.sample_duration(settings.fixation_duration, 0.45);
  const cueDuration = Number(settings.cue_duration ?? 0.6);
  const decisionDeadline = Number(settings.decision_deadline ?? 2.0);
  const feedbackDuration = Number(settings.feedback_duration ?? 0.8);
  const itiDuration = controller.sample_duration(settings.iti_duration, 0.45);
  const currentScore = Number(controller.current_score);

  const fixation = trial.unit("fixation").addStim(stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trialId,
    phase: "fixation",
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "fixation",
      task_rule: profile.rule,
      trial_type: trialType,
      target_digit: targetDigit,
      block_idx
    },
    stim_id: "fixation"
  });
  fixation.show({ duration: fixationDuration }).to_dict();

  const cueStimId = `cue_${profile.rule}`;
  const cue = trial
    .unit("cue")
    .addStim(stimBank.get("cue_title"))
    .addStim(stimBank.get_and_format("score_text", { current_score: currentScore }))
    .addStim(stimBank.get(cueStimId))
    .addStim(stimBank.get_and_format("trial_type_tag", { trial_type_cn: trialTypeLabel }));
  set_trial_context(cue, {
    trial_id: trialId,
    phase: "cue",
    deadline_s: cueDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "cue",
      task_rule: profile.rule,
      trial_type: trialType,
      trial_type_cn: trialTypeLabel,
      target_digit: targetDigit,
      current_score: currentScore,
      block_idx
    },
    stim_id: `cue_title+score_text+${cueStimId}+trial_type_tag`
  });
  cue.show({ duration: cueDuration }).to_dict();

  const decision = trial
    .unit("decision")
    .addStim(stimBank.get_and_format("score_text", { current_score: currentScore }))
    .addStim(stimBank.rebuild("target_digit", { text: String(targetDigit) }))
    .addStim(stimBank.get_and_format("rule_prompt", { rule_name_cn: profile.rule_name }))
    .addStim(
      stimBank.get_and_format("key_hint", {
        left_key: leftKey.toUpperCase(),
        right_key: rightKey.toUpperCase(),
        left_label_cn: profile.left_label,
        right_label_cn: profile.right_label
      })
    );
  set_trial_context(decision, {
    trial_id: trialId,
    phase: "decision",
    deadline_s: decisionDeadline,
    valid_keys: responseKeys,
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "decision",
      task_rule: profile.rule,
      trial_type: trialType,
      target_digit: targetDigit,
      left_key: leftKey,
      right_key: rightKey,
      correct_key: profile.correct_key,
      current_score: currentScore,
      block_idx
    },
    stim_id: "score_text+target_digit+rule_prompt+key_hint"
  });
  decision
    .captureResponse({
      keys: responseKeys,
      correct_keys: [profile.correct_key],
      duration: decisionDeadline
    })
    .set_state({
      response_key: (snapshot: TrialSnapshot) => String(snapshot.units.decision?.response ?? "").trim().toLowerCase(),
      timed_out: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        return key !== leftKey && key !== rightKey;
      },
      is_correct: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key !== leftKey && key !== rightKey) {
          return null;
        }
        return key === profile.correct_key;
      },
      predicted_category: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key === leftKey) {
          return "left";
        }
        if (key === rightKey) {
          return "right";
        }
        return "none";
      },
      predicted_category_cn: (snapshot: TrialSnapshot) => {
        const key = String(snapshot.units.decision?.response ?? "").trim().toLowerCase();
        if (key === leftKey) {
          return profile.left_label;
        }
        if (key === rightKey) {
          return profile.right_label;
        }
        return "none";
      },
      score_preview: (snapshot: TrialSnapshot) => {
        const isCorrect = toBooleanOrNull(snapshot.units.decision?.is_correct);
        return buildScorePreview(currentScore, isCorrect, controller);
      }
    })
    .to_dict();

  const feedback = trial.unit("feedback").addStim((snapshot: TrialSnapshot) => {
    const timedOut = Boolean(snapshot.units.decision?.timed_out ?? true);
    const scorePreviewRaw = snapshot.units.decision?.score_preview as ScoreUpdate | undefined;
    const scorePreview = scorePreviewRaw ?? buildScorePreview(currentScore, null, controller);
    if (timedOut) {
      return stimBank.get_and_format("feedback_timeout", {
        rule_name_cn: profile.rule_name,
        correct_category_cn: profile.correct_label,
        score_after: scorePreview.score_after
      });
    }
    const isCorrect = Boolean(snapshot.units.decision?.is_correct ?? false);
    const feedbackStimId = isCorrect ? "feedback_correct" : "feedback_incorrect";
    return stimBank.get_and_format(feedbackStimId, {
      predicted_category_cn: String(snapshot.units.decision?.predicted_category_cn ?? "none"),
      correct_category_cn: profile.correct_label,
      score_delta_signed: signed(scorePreview.score_delta),
      score_after: scorePreview.score_after
    });
  });
  set_trial_context(feedback, {
    trial_id: trialId,
    phase: "feedback",
    deadline_s: feedbackDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "feedback",
      task_rule: profile.rule,
      trial_type: trialType,
      target_digit: targetDigit,
      block_idx
    },
    stim_id: "feedback"
  });
  feedback.show({ duration: feedbackDuration }).to_dict();

  const iti = trial.unit("inter_trial_interval").addStim(stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trialId,
    phase: "inter_trial_interval",
    deadline_s: itiDuration,
    valid_keys: [],
    block_id,
    condition_id: conditionName,
    task_factors: {
      stage: "inter_trial_interval",
      block_idx
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration }).to_dict();

  trial.finalize((snapshot, _runtime, helpers) => {
    const responseKey = String(snapshot.units.decision?.response_key ?? "").trim().toLowerCase();
    const timedOut = Boolean(snapshot.units.decision?.timed_out ?? true);
    const isCorrect = toBooleanOrNull(snapshot.units.decision?.is_correct);
    const scoreUpdate = controller.apply_score(isCorrect);
    const predictedCategory = String(snapshot.units.decision?.predicted_category ?? "none");
    const predictedCategoryCn = String(snapshot.units.decision?.predicted_category_cn ?? "none");
    const rt = snapshot.units.decision?.rt;
    const keyPress = snapshot.units.decision?.key_press;

    helpers.setTrialState("condition", conditionName);
    helpers.setTrialState("trial_id", trialId);
    helpers.setTrialState("block_id", block_id);
    helpers.setTrialState("block_idx", block_idx);
    helpers.setTrialState("task_rule", profile.rule);
    helpers.setTrialState("trial_type", trialType);
    helpers.setTrialState("trial_type_cn", trialTypeLabel);
    helpers.setTrialState("target_digit", targetDigit);
    helpers.setTrialState("switch_trial", Boolean(trialSpec.switch_trial ?? trialType === "switch"));
    helpers.setTrialState("left_key", leftKey);
    helpers.setTrialState("right_key", rightKey);
    helpers.setTrialState("left_label_cn", profile.left_label);
    helpers.setTrialState("right_label_cn", profile.right_label);
    helpers.setTrialState("rule_name_cn", profile.rule_name);

    helpers.setTrialState("response_key", timedOut ? "" : responseKey);
    helpers.setTrialState("decision_response", timedOut ? "" : responseKey);
    helpers.setTrialState("decision_key_press", typeof keyPress === "boolean" ? keyPress : !timedOut);
    helpers.setTrialState("decision_rt", typeof rt === "number" ? rt : null);
    helpers.setTrialState("decision_rt_s", typeof rt === "number" ? rt : null);
    helpers.setTrialState("decision_timed_out", timedOut);
    helpers.setTrialState("is_correct", isCorrect);
    helpers.setTrialState("correct_key", profile.correct_key);
    helpers.setTrialState("correct_category", profile.correct_category);
    helpers.setTrialState("correct_category_cn", profile.correct_label);
    helpers.setTrialState("predicted_category", predictedCategory);
    helpers.setTrialState("predicted_category_cn", predictedCategoryCn);
    helpers.setTrialState("score_before", scoreUpdate.score_before);
    helpers.setTrialState("score_after", scoreUpdate.score_after);
    helpers.setTrialState("score_delta", scoreUpdate.score_delta);
    helpers.setTrialState("score_delta_signed", signed(scoreUpdate.score_delta));

    const record = {
      condition: conditionName,
      trial_id: trialId,
      block_id,
      block_idx,
      task_rule: profile.rule,
      trial_type: trialType,
      trial_type_cn: trialTypeLabel,
      target_digit: targetDigit,
      switch_trial: Boolean(trialSpec.switch_trial ?? trialType === "switch"),
      left_key: leftKey,
      right_key: rightKey,
      left_label_cn: profile.left_label,
      right_label_cn: profile.right_label,
      rule_name_cn: profile.rule_name,
      response_key: timedOut ? "" : responseKey,
      decision_response: timedOut ? "" : responseKey,
      decision_key_press: typeof keyPress === "boolean" ? keyPress : !timedOut,
      decision_rt: typeof rt === "number" ? rt : null,
      decision_rt_s: typeof rt === "number" ? rt : null,
      decision_timed_out: timedOut,
      is_correct: isCorrect,
      correct_key: profile.correct_key,
      correct_category: profile.correct_category,
      correct_category_cn: profile.correct_label,
      predicted_category: predictedCategory,
      predicted_category_cn: predictedCategoryCn,
      score_before: scoreUpdate.score_before,
      score_after: scoreUpdate.score_after,
      score_delta: scoreUpdate.score_delta
    };
    controller.record_trial(record);
  });

  return trial;
}
