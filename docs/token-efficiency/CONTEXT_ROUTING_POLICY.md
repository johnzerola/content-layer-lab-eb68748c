# Context routing policy

Use the smallest source that can answer the question faithfully.

| Need | First source | Escalate only when needed |
| --- | --- | --- |
| Known internal symbol, callers, references | Serena symbol tool | exact source range |
| Local architecture | relevant context pack or graph | bounded repo map, then files |
| Current third-party API | official documentation | Context7 after credentialed validation |
| Issue, PR or repository metadata | local Git history | read-only GitHub MCP after credentialed validation |
| Large research output or log | signature and relevant windows | raw artifact on demand |
| Handoff or external review | focused files/diff | Repomix with explicit scope |

Never compress source code, diffs, SQL, regex, API contracts, test fixtures, critical JSON or short relevant stack traces. Record why a full file, multi-file read, or repository bundle was needed.
