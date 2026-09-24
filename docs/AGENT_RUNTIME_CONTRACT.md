# RADHA Agent Runtime Contract

## Task

Every execution begins with a task:

- task_id
- user_request
- capability hints (optional)
- workspace (optional)
- execution policy
- created_at
- status

## Task states

```
queued
  ↓
planning
  ↓
executing
  ↓
waiting_for_approval
  ↓
executing
  ↓
verifying
  ↓
completed | failed | cancelled
```

## Event contract

The runtime emits structured events:

- task_created
- planning_started
- plan_updated
- tool_started
- tool_output
- tool_finished
- approval_required
- approval_resolved
- verification_started
- task_completed
- task_failed
- task_cancelled

Events must contain enough metadata for the UI to reconstruct a task timeline without reading internal agent state.

## Tool contract

Each tool exposes:

- name
- description
- JSON schema
- permission class
- side-effect classification
- executor

The model sees only tools registered for the current task.

## Side-effect classes

### READ
Examples:
- list files
- read files
- search
- inspect metadata

### WRITE
Examples:
- write file
- patch file
- create artifact

### EXECUTE
Examples:
- run tests
- build
- lint

### EXTERNAL_SIDE_EFFECT
Examples:
- push code
- send email
- deploy
- delete external data

The policy engine determines whether each class can execute automatically.

## Completion contract

RADHA must never claim that an operation succeeded solely because it intended to perform it.

A successful claim requires tool evidence.

Examples:

- "Tests pass" requires a successful test command.
- "File updated" requires a successful write/patch result.
- "Deployment completed" requires deployment-system confirmation.

## Model abstraction

The runtime depends on a model gateway rather than directly coupling business logic to one provider.

The gateway accepts:
- messages
- tools
- model configuration
- task metadata

and returns:
- assistant content
- tool calls
- usage metadata
- provider metadata

This allows model/provider replacement without rewriting the agent runtime.
