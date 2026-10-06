# Stable original-recording coordination

Reviewed original recordings now use a stable internal coordinator while retaining existing public preparation IDs and status URLs. Fresh source observations and snapshot promotion share transactional storage, so a late preparation cannot publish against a changed observation. An independently eligible older snapshot keeps its complete presentation identity; the current client refuses to play that snapshot against different text.

An explicit preparation request can consume one durable fresh-check ticket per reviewed catalog admission. The first upgrade into this coordinator performs a real bounded source GET even when original bytes already exist. Warm requests reuse verified observations and evidence; failed or interrupted tickets do not automatically retry. Successful preparation also retains compatibility data for the previous runtime.

Independent local Worker HTTP/SQLite/R2 tests cover revision changes, failed replacement, same-source audio ranges, freshness races, warm reuse, and previous-runtime rollback. This release adds no catalog admissions, ASR activation, infrastructure bindings, migrations, or video changes. Actual hosted behavior and facilitator journeys require separate verification after deployment; broad dynamic media coverage remains unfinished.
