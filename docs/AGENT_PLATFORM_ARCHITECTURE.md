# RADHA Agent Platform

## Product definition

RADHA is a general-purpose autonomous agent runtime.

A user gives RADHA a goal. RADHA determines what capabilities are required, plans work, selects authorized tools, executes actions, observes results, adapts its plan, and produces an auditable outcome.

RADHA is not a collection of unrelated bots. It is one agent runtime with pluggable capabilities.

## Core loop

Goal → Understand → Plan → Select tools → Act → Observe → Re-plan → Verify → Complete

The loop is bounded by:
- tool permissions
- execution budgets
- approval policies
- safety policies
- task deadlines
- model context limits

## Capability model

Initial capabilities:
- General assistance
- Research
- Coding
- Data analysis
- Document work
- Browser/computer interaction
- Tutoring

Capabilities are modules. The runtime decides which module(s) are required for a task.

## System architecture

```
                    ┌─────────────────────┐
                    │      RADHA UI       │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │     Agent API       │
                    └──────────┬──────────┘
                               │
             ┌─────────────────▼─────────────────┐
             │          Agent Runtime             │
             │                                    │
             │ Intent → Planner → Executor        │
             │           ↕                         │
             │        Memory / State               │
             └───────────────┬────────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │   Policy / Guard    │
                  └──────────┬──────────┘
                             │
                 ┌───────────▼────────────┐
                 │      Tool Registry     │
                 └───────────┬────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
       Web/Search          Code             Files/Data
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                     External systems
```

## Design principles

1. One runtime, many capabilities.
2. Tools are explicit and permissioned.
3. The model never gets unrestricted operating-system access.
4. Side effects are policy-controlled.
5. Every action is observable.
6. Task state is durable.
7. Model providers are replaceable.
8. Long-running tasks are first-class.
9. Human approval is available where policy requires it.
10. The agent must distinguish planned, attempted, successful, failed, and verified actions.

## Initial implementation boundary

The first implementation will remain intentionally small:

- Python + FastAPI
- OpenAI-compatible model gateway
- asynchronous agent loop
- explicit tool registry
- durable task state
- workspace tools
- command execution with safety policy
- streaming task events
- approval mechanism

The first milestone is a working autonomous coding capability inside the general runtime. Once that works, additional capabilities are added without replacing the runtime.
