# Handoff requests

Scratch area used while implementing
[`../plans/2026-08-06-slice-it-feature-ideas.md`](../plans/2026-08-06-slice-it-feature-ideas.md)
with parallel agents.

Each implementation agent owns a disjoint set of files so that concurrent work
in one tree cannot collide. When an agent needs a change in a file it does not
own, it writes the request here instead of editing across the boundary, and the
orchestrator applies it between waves.

These files are working notes, not documentation. Delete them once the wave
they belong to has landed.
