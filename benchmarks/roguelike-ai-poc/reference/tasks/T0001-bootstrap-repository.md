# T0001-bootstrap-repository — Bootstrap repository

| Field | Value |
| --- | --- |
| Status | `ready` |
| Priority | `p0` |
| Estimate | 1 hours (high confidence) |
| Depends on | _(none)_ |
| Decision refs | `0001-choose-the-implementation-language` — Choose the implementation language |
| Assignee hint | agent |
| Labels | `foundation` |
| Updated | 2026-05-17T04:14:22.524Z |

## Description

Initialize the Python project layout: pyproject.toml or requirements.txt with openai pin, a src/ module path, a README stub, and a .gitignore. Verify a `python -c "import openai"` succeeds in a fresh venv.

## Acceptance criteria

- [ ] pyproject.toml or requirements.txt committed
- [ ] openai SDK installable in a venv
- [ ] README explains 30-second quickstart
- [ ] python -c "from src import __init__" runs
