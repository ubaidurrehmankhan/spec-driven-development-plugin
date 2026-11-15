# Architecture

Short, current, and written for someone joining the project. Keep it under two pages; put the reasoning for each significant choice in `docs/adr/` instead.

## System at a glance
<!-- One paragraph and, if useful, a diagram: what runs, what it talks to. -->

## Modules and boundaries
<!-- One line per module: what it owns, what it may call. Cross-module calls go through the module's exported service interface (see docs/contracts/*.internal-interface.md). -->

## Data
<!-- Datastores, tenancy or isolation model, migration policy. -->

## Cross-cutting rules
<!-- Auth, error model, logging, configuration, background jobs. Link the rule files in .claude/rules/. -->

## Decisions
See `docs/adr/` for architecture decisions and `docs/DECISIONS.md` for per-spec decisions.
