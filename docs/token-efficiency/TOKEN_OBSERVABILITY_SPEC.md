# Token Observability Specification

## Purpose

Record task-level evidence needed to decide whether an efficiency change lowers
`cost_per_successful_task` without lowering quality. This record is development
telemetry only; it never receives source code, credentials, production payloads,
or raw large logs.

## Record contract

Every measured task is one object in `token-baseline.json`, `token-after.json`,
or `benchmark-results.json`.

```json
{
  "schema_version": "token-efficiency-task-v1",
  "task_id": "TE-B-001",
  "recorded_at": "2026-09-11T00:00:00Z",
  "phase": "baseline",
  "task_type": "symbol_discovery",
  "task_description": "Short, non-sensitive description",
  "domain": "backend",
  "model": "environment-reported-name-or-NOT_AVAILABLE",
  "reasoning_effort": "low|medium|high|xhigh|NOT_AVAILABLE",
  "input_tokens": null,
  "cached_input_tokens": null,
  "output_tokens": null,
  "total_tokens": null,
  "estimated_cost_usd": null,
  "actual_cost_usd": null,
  "tool_calls": 0,
  "tools": [],
  "files_read": 0,
  "bytes_read": 0,
  "duration_ms": null,
  "retry_count": 0,
  "escalation_count": 0,
  "tests_run": [],
  "tests_passed": null,
  "regressions": [],
  "success": null,
  "human_approval": null,
  "quality_notes": "",
  "unavailable_metrics": ["input_tokens"],
  "evidence": []
}
```

`null` means unavailable, never zero. `unavailable_metrics` must explain every
unavailable metric that would otherwise be interpreted as zero. The runner must
not estimate tokens from character count or infer cost from a public price table
when the actual model/account data is unavailable.

## Aggregation

For a cohort with one or more successful tasks:

```text
cost_per_successful_task = sum(actual_cost_usd or estimated_cost_usd) / successful_tasks
tokens_per_successful_task = sum(total_tokens) / successful_tasks
time_per_successful_task = sum(duration_ms) / successful_tasks
retry_rate = sum(retry_count) / task_count
escalation_rate = tasks_with_escalation / task_count
regression_rate = tasks_with_regressions / task_count
cache_hit_rate = sum(cached_input_tokens) / sum(input_tokens + cached_input_tokens)
```

An aggregate is `NOT_AVAILABLE` when its required denominators or counters are
not available. A result cannot claim an improvement in a metric that has no
before-and-after values.

## Representative baseline cohort

The baseline must contain at least one task for each class, with identical
acceptance criteria repeated after any prototype:

| ID | Class | Acceptance evidence |
| --- | --- | --- |
| A | Locate a function | Correct symbol/path and no unrelated files needed |
| B | Small bug fix | Focused regression test passes |
| C | Medium feature | Type/test gate and reviewed diff pass |
| D | Multi-file investigation | Root cause and evidence agree |
| E | Frontend modification | Type/test plus visual gate pass |
| F | Video pipeline investigation | Existing research evidence and no production action |
| G | Test failure correction | Original failure becomes green with relevant test coverage |
| H | Technical documentation | Reviewable, source-linked artifact |

## Quality gates

Promotion requires all of the following against the baseline cohort:

1. `success`, tests and human approval are not worse.
2. No added regression is attributable to the prototype.
3. At least one of measured cost, tokens, duration or retries improves
   materially.
4. The prototype has an explicit disable path and no required production change.
