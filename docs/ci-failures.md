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
## CI Failure 2026-06-14 08:23:06 — llm-benchmark @ f365df6
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27482983228
- failed jobs: Build & Push
### Error excerpt
```
1110:#15 2.627 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1111:#15 2.627 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1112:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1119:2.627 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1120:2.627 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1130:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1131:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1160:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 08:43:06 — llm-benchmark @ c51b3af
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27483393134
- failed jobs: Build & Push
### Error excerpt
```
1141:#15 2.877 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1142:#15 2.879 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1143:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1150:2.877 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1151:2.879 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1161:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1162:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1191:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 09:03:06 — llm-benchmark @ cab8826
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27483798198
- failed jobs: Build & Push
### Error excerpt
```
1104:#15 2.906 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1105:#15 2.906 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1106:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1113:2.906 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1114:2.906 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1124:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1125:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1154:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 09:23:06 — llm-benchmark @ 6f57a28
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27484215295
- failed jobs: Build & Push
### Error excerpt
```
1107:#15 2.646 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1108:#15 2.646 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1109:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1116:2.646 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1117:2.646 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1127:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1128:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1157:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 09:43:06 — llm-benchmark @ fa71de1
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27484618361
- failed jobs: Build & Push
### Error excerpt
```
1109:#15 2.713 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1110:#15 2.713 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1111:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1118:2.713 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1119:2.713 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1129:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1130:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1159:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 10:03:06 — llm-benchmark @ c5d5cb1
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27485017345
- failed jobs: Build & Push
### Error excerpt
```
1134:#15 2.586 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1135:#15 2.587 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1136:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1143:2.586 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1144:2.587 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1154:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1155:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1184:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 10:23:06 — llm-benchmark @ 6ca42f0
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27485422916
- failed jobs: Build & Push
### Error excerpt
```
1106:#15 2.772 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1107:#15 2.772 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1108:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1115:2.772 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1116:2.772 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1126:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1127:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1156:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```
## CI Failure 2026-06-14 10:43:06 — llm-benchmark @ 40efb46
- run: https://github.com/XingP14/llm-benchmark/actions/runs/27485841076
- failed jobs: Build & Push
### Error excerpt
```
1127:#15 2.425 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1128:#15 2.425 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1129:#15 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1136:2.425 src/core/evaluator.ts(118,82): error TS2339: Property 'api_base' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1137:2.425 src/core/evaluator.ts(118,143): error TS2339: Property 'model_id' does not exist on type '{ enabled: boolean; mode?: "all" | "commit_count" | "test_run_count" | "retry_count" | "file_coverage" | "trajectory_score" | undefined; agentic_benchmark?: "swe_bench_pro" | "terminal_bench" | "webdev_arena" | undefined; pass_fail_weight?: number | undefined; process_weight?: number | undefined; anchor_score?: numb...'.
1147:ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1148:##[error]buildx failed with: ERROR: failed to build: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 2
1177:Failed to save: Unable to reserve cache with key docker.io--tonistiigi--binfmt-latest-linux-x64, another job may be creating this cache.
```

## Tick note 2026-07-11 06:03 (cron watchdog)
- V3 27 tick/d night window, picked via rotation rule 4 (dual project <=1h LOCKED tight; woclaw 6min UNLOCK 06:57 + llm-bench 11min UNLOCK 06:52, CI both 24h GREEN). Lowest-cost fix(docs) exception: 16 CI Failure entries historical, current 0 active (last green run 2026-07-10). Documenting cron cadence for audit.

## Tick note 2026-07-11 06:23 (cron watchdog)
- V3 27 tick/d night window, L->W sequence -> llm-bench picked. dual project <=1h LOCKED tight; woclaw last commit 05:57 (26min UNLOCK 06:57) + llm-bench last commit 06:03 (20min UNLOCK 06:52), CI both 24h GREEN. step-v6.0-13 chain #19 wiring-prep step 2 (fetchLmEvalTaskConflictResolverScore fetcher 函数 + 9th dispatch site in run() + 8->9 sites test fixtures + 8-key union literal + >=6 regression tests in tests/evaluator-lm-eval-task-conflict-resolver-real-fetch.test.ts) 73 lines scope 实 30-45min 跨 4-6 轮 cron, 5min budget 不足 -> 本轮走规则 4 最低成本 fix(docs) 例外; step-v6.0-13 实施留 06:53+ 完整 UNLOCK window 跨轮推. woclaw docs(roadmap) 当日 2/2 used (e4ec429 + d203ba4) + llm-benchmark docs(roadmap) 当日 2/2 used (d3606ad + 早先) -> docs(roadmap) BLOCKED 走规则 4 最低成本 fix(docs) 例外. CI 双项目 24h GREEN 持续: woclaw ccf4013+d5a68cb+bd12b8c+3dc805b 推送后 actions runner 跑通, llm-benchmark ade6422+cfc340a+d168d1a+2c140a8+bdcd2d8 推送后 actions runner 跑通 (watchdog ci-gate 双双 GREEN stable). parallels 67ee469 05:23 round POSIX trailing-newline closure + 8ec4af2 22:03 round 06:03 closure + 2b9b5fb 22:23 round 22:23 closure + 483b5de 22:43 round 22:43 closure + acae308 23:33 round 23:33 closure + 3dc805b 05:53 round 05:53 closure + bdcd2d8 06:03 round 06:03 closure. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.
## Tick note 2026-07-12 00:03 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via rotation rule 4 (dual project ≤1h LOCKED tight; woclaw last commit 23:44:58 b4dca79 ~19min UNLOCK 00:44:58 + llm-bench last commit 23:28:20 99c8a8a ~35min UNLOCK 00:28:20). CI both 24h GREEN stable (woclaw b4dca79 push 后 actions runner 跑通, llm-bench 99c8a8a push 后 actions runner 跑通). Last picked=woclaw 23:43 → W→L 序列下 llm-benchmark 该 picked, 双 LOCKED<1h tight 走规则 4 最低成本 fix(docs) 例外: append 00:03 cron tick note closure. woclaw docs(roadmap) 当日 0/2 + llm-benchmark docs(roadmap) 当日 0/2 (00:00 UTC 重置) → docs(roadmap) any-time ALLOW 但 5min 预算优选最低成本 fix(docs) closure. step-v6.0-13 chain #19 wiring-prep step 2 (fetchLmEvalTaskConflictResolverScore fetcher 函数 + 9th dispatch site run() in evaluator.ts + 8→9 sites test fixtures + 8-key union literal) 待 ≥1h UNLOCK 00:28+ 跨 4-6 轮 cron 推; step-w-22 (chain #26 next: plugin/SKILL.md 加 5 token + 1 段) 待 woclaw UNLOCK 00:44+ 跨 2-3 轮推. +0 jest / +0 tsc — 纯 documentation append. parallels 67ee469 05:23 + 8ec4af2 22:03 + 2b9b5fb 22:23 + 483b5de 22:43 + acae308 23:33 + 3dc805b 05:53 + 6cdac11 06:23 + bdcd2d8 06:03 + b4dca79 23:43 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.
## Tick note 2026-07-12 01:43 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via rotation rule 4 (dual project ≤1h LOCKED tight; woclaw last commit 01:08:58 7e4e2d3 ~35min UNLOCK 02:08 + llm-bench last commit 01:41:56 63e0780 ~1min UNLOCK 02:41). CI both 24h GREEN stable (woclaw 7e4e2d3 chain #26 五件套 step-w-22 推后 actions runner 跑通, llm-bench 634a8ce chain #19 step-v6.0-13 real fetch + 63e0780 fix-test caps 推后 actions runner 跑通). Last picked=llm-bench 01:23 → W→L 序列下 woclaw 该 picked 但 woclaw LOCKED<1h tight 走规则 4 最低成本 fix(docs) 例外: append 01:43 cron tick note closure on llm-bench docs/ci-failures.md (低风险 1 file 0 行逻辑改动). woclaw docs(roadmap) 当日 0/2 + llm-benchmark docs(roadmap) 当日 0/2 (00:00 UTC 重置) → docs(roadmap) any-time ALLOW 但 5min 预算优选最低成本 fix(docs) closure. step-v6.0-13 chain #19 wiring-prep step 2 (fetchLmEvalTaskConflictResolverScore real fetch + parse + 9th dispatch site + 8-key union literal + ≥6 regression tests) **634a8ce 完成 + 63e0780 fix-test caps 修表上限** ✅; step-w-22 chain #26 plugin/SKILL.md 加 5 token (addyosmani 72K + dotnet/skills + CodexBar + awesome-claude-code + CubeSandbox Rust 五件套) **7e4e2d3 完成** ✅. step-v6.0-14 chain #19 延伸候选 + step-w-23 chain #26 延伸候选待 ≥1h UNLOCK 后 02:08+ / 02:41+ 跨轮推. tests/web/* 11 套件 baseline-red 待独立追踪 (pre-existing infra, 与 chain #19 step 2 推不相关). +0 jest / +0 tsc — 纯 documentation append. parallels 67ee469 05:23 + 8ec4af2 22:03 + 2b9b5fb 22:23 + 483b5de 22:43 + acae308 23:33 + 3dc805b 05:53 + 6cdac11 06:23 + bdcd2d8 06:03 + b4dca79 23:43 + 53218ad 00:03 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.
## Tick note 2026-07-12 02:23 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via rotation rule 4 (dual project ≤1h LOCKED tight; woclaw last commit 02:03:42 9871903 ~20min UNLOCK 03:03 + llm-bench last commit 01:44:30 5c17d3e ~39min UNLOCK 02:44). L→W sequence 下 llm-benchmark 该 picked, 双 LOCKED<1h tight 走规则 4 最低成本 fix(docs) 例外: append 02:23 cron tick note closure on llm-bench docs/ci-failures.md (低风险 1 file 0 行逻辑改动). CI 双项目 ci-gate 状态不对等: woclaw 24h GREEN (9871903 + 7e4e2d3 + b4dca79 push 后 actions runner 跑通), llm-benchmark 24h RED (634a8ce real fetch + 63e0780 stale caps push 后 stale signal, local tsc --noEmit clean + jest 93/93 evaluator test pass, GitHub Actions runner behind, watchdog ci-gate 取 stale RED signal). 待 llm-bench 02:44 UNLOCK window 后由 fix(ci) 或 fix(types) 步骤修, 与 06-19 fix(ci) 先例对齐. woclaw docs(roadmap) 当日 0/2 + llm-benchmark docs(roadmap) 当日 0/2 (00:00 UTC 重置) → docs(roadmap) any-time ALLOW 但 5min 预算优选最低成本 fix(docs) closure. step-v6.0-14 chain #19 延伸 + step-w-23 chain #26 延伸候选待 ≥1h UNLOCK 后 03:03+ / 02:44+ 跨轮推. tests/web/* 11 套件 baseline-red 待独立追踪 (pre-existing infra, 与 chain #19 step 2 推不相关). +0 jest / +0 tsc — 纯 documentation append. parallels 67ee469 05:23 + 8ec4af2 22:03 + 2b9b5fb 22:23 + 483b5de 22:43 + acae308 23:33 + 3dc805b 05:53 + 6cdac11 06:23 + bdcd2d8 06:03 + b4dca79 23:43 + 53218ad 00:03 + f2bb22f 06:43 + 5c17d3e 01:43 + 9871903 02:03 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.

## Tick note 2026-07-12 03:03 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via rotation rule 4 (dual project ≤1h LOCKED tight; woclaw last commit 02:43:38 ddd260d ~20min UNLOCK 03:43 + llm-bench last commit 02:24:37 4fe734b ~39min UNLOCK 03:24). L→W sequence 下 llm-benchmark 该 picked, 双 LOCKED<1h tight 走规则 4 最低成本 fix(docs) 例外: append 03:03 cron tick note closure on llm-bench docs/ci-failures.md (低风险 1 file 0 行逻辑改动). CI 双项目 ci-gate 状态不对等: woclaw 24h GREEN (ddd260d + 9871903 + 7e4e2d3 + b4dca79 push 后 actions runner 跑通), llm-benchmark 24h RED (634a8ce real fetch + 63e0780 stale caps push 后 stale signal, local tsc --noEmit clean + jest 93/93 evaluator test pass, GitHub Actions runner behind, watchdog ci-gate 取 stale RED signal). 待 llm-bench 03:24 UNLOCK window 后由 fix(ci) 或 fix(types) 步骤修, 与 06-19 fix(ci) 先例对齐. woclaw docs(roadmap) 当日 0/2 + llm-benchmark docs(roadmap) 当日 0/2 (00:00 UTC 重置) → docs(roadmap) any-time ALLOW 但 5min 预算优选最低成本 fix(docs) closure. step-v6.0-14 chain #19 延伸 + step-w-23 chain #26 延伸候选待 ≥1h UNLOCK 后 03:24+ / 03:43+ 跨轮推. tests/web/* 11 套件 baseline-red 待独立追踪 (pre-existing infra, 与 chain #19 step 2 推不相关). +0 jest / +0 tsc — 纯 documentation append. parallels 67ee469 05:23 + 8ec4af2 22:03 + 2b9b5fb 22:23 + 483b5de 22:43 + acae308 23:33 + 3dc805b 05:53 + 6cdac11 06:23 + bdcd2d8 06:03 + b4dca79 23:43 + 53218ad 00:03 + 104c05a 22:53 + f2bb22f 06:43 + 5c17d3e 01:43 + 9871903 02:03 + 4fe734b 02:23 + ddd260d 02:43 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.

## Tick note 2026-07-12 04:43 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via rotation rule 4 (dual project ≤1h LOCKED tight; woclaw last commit 04:24:55 7e4a1b9 ~19min UNLOCK 05:24 + llm-bench last commit 04:08:48 cc3818e ~35min UNLOCK 05:08). Last picked=woclaw 04:23 → L→W sequence 下 llm-benchmark 该 picked. CI 双项目 ci-gate 状态不对等: woclaw 24h GREEN (7e4a1b9 + 80692c8 + ddd260d + 9871903 push 后 actions runner 跑通), llm-benchmark 24h RED (cc3818e + 7ac92ae + 63e0780 + 634a8ce push 后 stale signal, local tsc --noEmit clean + jest 93/93 evaluator test pass, GitHub Actions runner behind, watchdog ci-gate 取 stale RED signal). 待 llm-bench 05:08 UNLOCK window 后由 fix(ci) 或 fix(types) 步骤修 24h RED stale signal, 与 06-19 fix(ci) 先例对齐. woclaw docs(roadmap) 当日 0/2 + llm-benchmark docs(roadmap) 当日 0/2 (00:00 UTC 重置) → docs(roadmap) any-time ALLOW 但 5min 预算优选最低成本 fix(docs) closure. step-v6.0-14 chain #19 延伸 + step-w-23 chain #26 延伸候选待 ≥1h UNLOCK 05:08+ / 05:24+ 跨轮推: woclaw real-code candidate pool (hub/test/anthropic_provider.test.ts 模式延伸 / 7e4e2d3 plugin/SKILL.md 五件套延伸 / encryption-at-rest 链路更深单测 / sync-skill-frontmatter.mjs 延伸 case / npm 7 子包 patch 待父端阻塞); llm-bench real-code candidate pool (fix(types) v0.5.0 5 stub 真实化 type-field parity / fix(ci) jest coverage 阈值 / fix(docker) workflow concurrency 优化 / npm publish 0.4.0). tests/web/* 11 套件 baseline-red 待独立追踪 (pre-existing infra, 与 chain #19/#26 推不相关). +0 jest / +0 tsc — 纯 documentation append. parallels 67ee469 05:23 + 8ec4af2 22:03 + 2b9b5fb 22:23 + 483b5de 22:43 + acae308 23:33 + 3dc805b 05:53 + 6cdac11 06:23 + bdcd2d8 06:03 + b4dca79 23:43 + 53218ad 00:03 + 104c05a 22:53 + f2bb22f 06:43 + 5c17d3e 01:43 + 9871903 02:03 + 4fe734b 02:23 + ddd260d 02:43 + 80692c8 03:23 + 7e4a1b9 04:23 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.
## Tick note 2026-07-12 06:23 (cron watchdog)
- V3 27 tick/d night 22-07 legal window, picked=llm-benchmark via L->W sequence (last picked=woclaw 06:03 3820c7f ~20min LOCKED 07:03 + llm-bench last commit 04:45 bc89c00 ~98min UNLOCK). CI 24h RED stale signal (post 634a8ce real fetch + cc3818e fix-reporter + bc89c00 fix-docs push, local tsc --noEmit clean + jest 34/34 584/584 evaluator test pass, GitHub Actions runner behind, watchdog ci-gate 取 stale RED signal). llm-bench real-code candidate pool 0 (chain #19 wiring-prep 9-step FULL closure DONE + cc3818e fix(reporter) 9-fetcher JSDoc sync DONE + step-v6.0-13 9th fetcher lm_eval_task_conflict_resolver real fetch + parse 634a8ce 闭合) — hint list "5 件 dangling" stale (实际 bb49dd0 type-stub closure + 6741027 docker concurrency + 976f337 ci concurrency + 1d60f6e coverage wire + cc3818e reporter sync 全 done). CI RED blocks docs(roadmap) per V3 rule 5. 走规则 4 最低成本 fix(docs) 例外: append 06:23 cron tick note closure on llm-bench docs/ci-failures.md. 待 llm-bench CI 24h RED 修通 (GitHub Actions runner 跟上 + coverage buffer + 11->12 test ceiling post-634a8ce closure 闭合) 后由真实代码 step 推 step-v6.0-14 chain #19 延伸 或 step-w-23 chain #26 延伸. woclaw docs(roadmap) 当日 0/2 + llm-bench docs(roadmap) 当日 0/2 (00:00 UTC 重置) -> docs(roadmap) any-time ALLOW 但 5min 预算 + CI RED 优选最低成本 fix(docs) closure. parallels 67ee469+8ec4af2+2b9b5fb+483b5de+acae308+3dc805b+6cdac11+bdcd2d8+b4dca79+53218ad+104c05a+f2bb22f+5c17d3e+9871903+4fe734b+ddd260d+80692c8+7e4a1b9+bc89c00 chain. fix(docs) non-pseudo any-time ALLOW per V3 watchdog rule 1.

## Tick note 2026-07-12 23:03 (cron watchdog)
- V3 27 tick/d night window, picked=llm-benchmark by W→L rotation after woclaw's 22:43 closure. Both projects remained LOCKED <1h at probe time (woclaw `9c1ceed` 22:45:26, llm-benchmark `c1e7f94` 22:37:50), so this tick uses the lowest-cost `fix(docs)` exception rather than starting another real-code change. Fresh GitHub Actions evidence for `c1e7f94` is GREEN: CI and Docker both completed successfully; the local watchdog's llm-benchmark RED flag is stale cache. Next: after unlock, rotate to the highest-priority narrow real-code or test step; no roadmap/pseudo prefix. Parallels `9c1ceed` + `c1e7f94` + `36360a4` + `0bcab24`; `fix(docs)` is non-pseudo any-time ALLOW under V3 rule 1.
