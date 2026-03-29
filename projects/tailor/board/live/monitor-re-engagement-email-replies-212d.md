---
id: monitor-re-engagement-email-replies-212d
title: Monitor re-engagement email replies
type: initiative
channel: email
column: live
created: '2026-03-29'
target_date: '2026-04-05'
tags:
  - manual
  - feedback-cohort
  - ongoing
source: manual
metrics: {}
paper_artboard: null
---

**61 re-engagement emails sent on Mar 29 via send-feedback-reengagement.ts**

### What to watch
- Replies to camren@gettailor.ai (reply-to address on all emails)
- New logins from previously inactive users (check Supabase `last_active_at` changes)
- Bounce/complaint reports in Resend dashboard

### How to respond
- Reply to every response personally — these users opted to engage
- If someone wants a call, send a Cal.com link
- If someone gives written feedback, ask 1 follow-up question
- For users who come back and generate resumes, follow up 2-3 days later asking how the resume performed

### Upgrade users who provide feedback
- Give indefinite standard tier access per the email promise
- Use: `npx tsx scripts/ops/send-apology-and-upgrade.ts <email>` (upgrades to 1-year standard)

### Campaign details
- Campaign ID: `feedback-reengagement-2026-03-29`
- Subject: "We'd love your feedback (+ free access)"
- Idempotent — safe to re-run script if needed
