# Requirements

<!--
REQS.md is your unstructured requirements backlog.
Write features, bugs, and ideas here in any format.

When you run `wf plan`, Claude analyzes this file and proposes stories.
Sections get marked with WIP tags when stories are created, and
removed when stories are merged.

Examples:
- User authentication with OAuth
- Fix: logout button doesn't work on mobile
- Add dark mode support
-->

  

## Security Hardening

<!-- BEGIN WIP: STORY-0037 -->
Per-room SSE connection limit (max 4 connections per room); excess connections rejected with appropriate error. Global SSE connection cap; new connections rejected when cap reached.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
POST /rooms rate-limited per IP (max 5 rooms per minute); excess requests return 429.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
Guest identity cryptographically bound via a guest token issued on first SSE connection; all guest POST endpoints require a valid guest token.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
POST /rooms/:code/next-round requires caller to be an authenticated player (host or guest token).
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
Bun.serve idleTimeout set to a non-zero value (e.g., 30s) instead of 0.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
Heartbeat timers (setInterval) cleared when a room is deleted via removeRoom(). Heartbeat pings no longer reset room lastActivity; only real game actions (POST endpoints) touch the room.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
Absolute room TTL enforced (e.g., 2 hours) independent of activity; rooms deleted when TTL expires.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
All HTML responses include security headers: Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin.
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
CDN scripts (Tailwind, HTMX, GSAP) include integrity and crossorigin attributes (SRI hashes).
<!-- END WIP -->

<!-- BEGIN WIP: STORY-0037 -->
Request body size checked before JSON parsing on all POST endpoints; requests over 1KB rejected with 413.
<!-- END WIP -->

RULESET 1:








--- 

RULESET 2:
Santase Rules

Santase is not a commonly played card game but it is a lot of fun. This two-player game, popular in Eastern Europe, is challenging and competitive. Give it a try.












RULESET 3: 
How to Play Santase
 
santaseSantase (pronounced SAN-tah-say) is a two-person card game that’s popular in Bulgaria. The Santase rules are a little tricky but, once learned, the game is highly addictive. The card game rules are similar to those used in 66, and an Austrian game called Schnapsen.

Number of Players
Santase is a card game for 2 people.

Goal

Dealing










