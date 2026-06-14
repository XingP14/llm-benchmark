## CI Failure 2026-06-11 09:03:41 — llm-benchmark @ 4b46f64
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27310386485
- failed jobs: Lint + Test (Node 20.x)
### Error excerpt
```
237:      Error evaluating dial-fact-001: Error: API Error
271:      Error evaluating dial-fact-002: Error: API Error
305:      Error evaluating dial-fact-003: Error: API Error
339:      Error evaluating dial-inst-001: Error: API Error
373:      Error evaluating dial-inst-002: Error: API Error
407:      Error evaluating dial-inst-003: Error: API Error
441:      Error evaluating dial-reason-001: Error: API Error
475:      Error evaluating dial-reason-002: Error: API Error
509:      Error evaluating dial-reason-003: Error: API Error
543:      Error evaluating dial-context-001: Error: API Error
```
## CI Failure 2026-06-11 09:23:06 — llm-benchmark @ b1a6021
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27316752592
- failed jobs: Build & Push
### Error excerpt
```
826:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-11 09:43:06 — llm-benchmark @ 6741027
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27317957563
- failed jobs: Build & Push
### Error excerpt
```
824:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-11 10:03:07 — llm-benchmark @ aba2097
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27318185609
- failed jobs: Build & Push
### Error excerpt
```
824:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 07:03:06 — llm-benchmark @ 19f4257
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27481408346
- failed jobs: Build & Push
### Error excerpt
```
1145:#15 2.728 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1146:#15 2.728 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1147:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1154:2.728 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1155:2.728 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1165:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1166:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1195:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 07:23:07 — llm-benchmark @ 32556f8
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27481755156
- failed jobs: Build & Push
### Error excerpt
```
1104:#15 2.690 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1105:#15 2.691 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1106:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1113:2.690 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1114:2.691 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1124:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1125:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1154:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 07:43:06 — llm-benchmark @ b61a27f
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27482166566
- failed jobs: Build & Push
### Error excerpt
```
1105:#15 2.764 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1106:#15 2.764 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1107:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1114:2.764 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1115:2.764 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1125:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1126:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1155:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 08:03:07 — llm-benchmark @ 741e884
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27482573901
- failed jobs: Build & Push
### Error excerpt
```
1143:#15 2.739 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1144:#15 2.739 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1145:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1152:2.739 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1153:2.739 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1163:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1164:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1193:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
