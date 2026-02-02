# Project Directives

<!--
Directives guide AI agents during implementation.
hashd passes this file to agents - they don't auto-read it.
We use directives.md (not AGENTS.md) to maintain control over when/how it's passed.

Examples:
- Use our custom logger from pkg/log, not the standard library
- All errors must be wrapped with pkg/errors.Wrap
- Prefer table-driven tests
- No magic numbers - use named constants
-->

