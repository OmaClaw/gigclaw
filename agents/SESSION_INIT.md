# Session Initialization Rules
# Loaded on every session start to optimize token usage

## Files to Load (8KB max)
- SOUL.md - Core principles
- USER.md - User context  
- IDENTITY.md - Agent identity
- memory/YYYY-MM-DD.md - Today's notes only

## DO NOT Auto-Load
- Full MEMORY.md (use memory_search on demand)
- Session history
- Prior messages
- Previous tool outputs

## On-Demand Memory
When user asks about prior context:
1. Use memory_search() for relevant snippets
2. Use memory_get() to pull specific lines
3. Don't load entire files

## Session End
Update memory/YYYY-MM-DD.md with:
- What was worked on
- Decisions made
- Blockers encountered
- Next steps
