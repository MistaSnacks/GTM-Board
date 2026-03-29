---
id: fix-zernio-reddit-posts-urls-subreddit-assignment-c60f
title: 'Fix Zernio Reddit posts: URLs + subreddit assignment'
type: initiative
channel: reddit
column: done
created: '2026-03-29'
target_date: '2026-03-29'
tags:
  - manual
  - urgent
  - zernio
source: manual
metrics: {}
paper_artboard: null
notes: >-
  CANCELLED — All Zernio posts deleted. Reddit account (ShoulderEnough4537) has
  no karma, posts get auto-removed by moderators. Need to build account karma
  first before posting.
---

**Do before posts go live (first one fires Mon Mar 30 at 11 AM CT)**

### 1. Fix invite URLs on all 3 posts
Zernio auto-appended UTM params and broke the invite link. In each post, change:
```
...organic?invite=f1de9d89d50f
```
to:
```
https://www.gettailor.ai/?invite=f1de9d89d50f
```

### 2. Reassign subreddits
All 3 default to r/jobsearchhacks. Spread them:
- **Mon Mar 30, 11 AM CT** ("Beta testers wanted") → r/SideProject
- **Mon Mar 30, 3 PM CT** ("Try it free, tell me what's broken") → r/jobsearchhacks (keep default)
- **Tue Mar 31, 9 AM CT** ("Free ATS resumes, need feedback") → r/resumes

### 3. Post IDs (in Zernio)
- `69c9967b43da8d5fcf0de879` (Mon 11 AM)
- `69c9967343da8d5fcf0de646` (Mon 3 PM)
- `69c9967e43da8d5fcf0de958` (Tue 9 AM)
