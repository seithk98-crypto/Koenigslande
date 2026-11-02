# Architecture Overview

## Goal

Königslande is designed as a persistent multiplayer strategy game. The architecture prioritizes a single trusted backend, clear ownership boundaries, and predictable gameplay rules.

## Frontend

- React 19
- TypeScript
- Vite
- CSS custom styling for the medieval interface

The production frontend should render data, collect user input, and send actions to the backend. In the current prototype, the browser owns local game state; this is intentionally not authoritative or suitable for multiplayer.

## Backend

- Supabase Auth for identity management
- PostgreSQL as the source of truth
- Database RPC functions for gameplay logic

Key idea: the browser never decides resource counts, building completion, recruitment, or combat outcomes. A server-side function validates the action and updates the database atomically.

## Why this architecture

This pattern is suitable for a live strategy game because it is:

- easy to scale with a managed Postgres database,
- robust for row-level security and ownership validation,
- consistent with multiplayer strategy game requirements,
- compatible with offline progress and scheduled processing later in the project.

## Expected data model direction

The project should evolve toward a table structure such as:

- users / profiles
- villages
- village_buildings
- village_resources
- units
- unit_training_queue
- troop_movements
- combat_reports
- world_regions or world_tiles
- alliances and alliance_memberships (later)

## Security model

- User identity comes from Supabase auth.
- User ownership is checked from session context or village ownership.
- RPC functions validate village ownership, resource sufficiency, and unit availability.
- Sensitive data must be protected behind row-level security.
- Private combat reports and player data must be restricted by ownership.

## Development principles

- Separate UI from world logic.
- Treat the database as the single source of truth.
- Keep critical logic server-side.
- Add features in phases rather than in large monolithic changes.
- Ensure every phase has a local verification step before moving on.

## Current implementation status

The project currently contains a local profile gate, profile-specific browser saves, a starting-village flow, and a map prototype. The local profile gate does not verify credentials. Supabase Auth, persistent database state, server-side game rules, and production-grade multiplayer remain unimplemented.
