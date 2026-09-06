---
description: Show current phase status and pick the next task to work on from IMPLEMENTATION_PROGRESS.md.
allowed-tools: Read, Edit, Bash(git log *)
---

Recent commits:
!`git log --oneline -12`

Read `IMPLEMENTATION_PROGRESS.md` and report:

1. **Phase, tasks done / total, and days elapsed against the 10-day v0 kill criterion.**
   If the deadline has passed and v0 is not deployed, say so first and plainly — that is
   the point of the criterion.
2. Any `🔄` task and whether it looks stalled.
3. Any `🚫` blocker and what would clear it.
4. **The next task**: the lowest-numbered `⬜` whose dependencies are all `✅`. State its
   ID, estimate and acceptance criteria.
5. Anything in the quota-watch table under 70% headroom.

Then ask whether to start that task. Do not start it unprompted.
