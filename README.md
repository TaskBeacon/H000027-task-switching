# H000027 Task Switching Task

HTML/browser preview of the cue-based Task Switching task built with `psyflow-web`.
Rule-cue transitions (`start/repeat/switch`), digit classification (`parity/magnitude`), response logic, and score updates are aligned to local `T000027-task-switching`.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: rule-transition and scoring controller
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: block/overall summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000027-task-switching
```
