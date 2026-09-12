# Token-efficiency benchmark protocol

1. Select one safe, representative task from every A–H class in `TOKEN_OBSERVABILITY_SPEC.md`.
2. Record the baseline with the same acceptance test and stop condition intended for the after run.
3. Change one control at a time: context route, tool route, model tier, or reasoning effort.
4. Repeat the same task class after the change; do not compare unrelated tasks.
5. Reject if quality, passing tests, regressions, approvals, or retries worsen materially.
6. Aggregate only observable fields. `NOT_AVAILABLE` is a result, not zero.

The first practical comparison is symbol discovery: current broad search/range-read workflow versus Serena scoped navigation. It must capture elapsed time, tool calls, files/bytes read, correctness and any account-reported token data.
