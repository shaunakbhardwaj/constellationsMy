# Command Center — Vision Document

> **Purpose:** Transform the Maps ElectronJS app from a flowchart/mind-mapping tool into a unified business operations command center powered by AI agents.

---

## Core Concept

A single interface where you oversee an AI-operated business. You provide the vision and approvals. Agents execute.

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMAND CENTER                         │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              THE MAIN IDEA / BUSINESS               │   │
│   │         (Your submitted business proposition)       │   │
│   └─────────────────────────────────────────────────────┘   │
│                            │                                │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│   │ MARKETING│      │  SALES   │      │ PRODUCT  │          │
│   └──────────┘      └──────────┘      └──────────┘          │
│         │                  │                  │             │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│   │ACCOUNTING│◄─────│  MEMORY  │─────►│ AI BRAIN │          │
│   └──────────┘      └──────────┘      └──────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## The Four Pillars

### 1. Marketing
Content creation, brand presence, growth strategies.

| Agent Tasks | Human Tasks |
|-------------|-------------|
| Generate social media content | Approve tone/messaging |
| Analyze competitor positioning | Set brand guidelines |
| Create landing page copy | Final creative approval |
| A/B test variations | Strategic direction |

**Dashboard View:**
- Scheduled posts queue
- Content performance metrics
- Pending approvals
- Suggested campaigns

---

### 2. Sales & Outreach
Lead generation, prospecting, pipeline management.

| Agent Tasks | Human Tasks |
|-------------|-------------|
| Research potential leads | Qualify high-value targets |
| Draft outreach emails | Approve messaging strategy |
| Track responses | Handle key relationships |
| Update CRM data | Close deals |

**Dashboard View:**
- Lead pipeline (new → contacted → replied → converted)
- Today's outreach queue
- Response notifications
- Suggested leads to pursue

---

### 3. Product
Building, maintaining, and improving the actual product.

| Agent Tasks | Human Tasks |
|-------------|-------------|
| Write code | Approve architecture decisions |
| Fix bugs | Prioritize features |
| Write tests | Review critical changes |
| Deploy updates | Set product direction |
| Handle routine support | Escalation for complex issues |

**Dashboard View:**
- Active development tasks
- Recent commits/deploys
- Bug queue
- Feature requests
- Support tickets pending

---

### 4. Accounting
Financial tracking, expenses, revenue monitoring.

| Agent Tasks | Human Tasks |
|-------------|-------------|
| Log API costs | Approve large expenses |
| Track subscriptions | Budget allocation |
| Generate expense reports | Tax decisions |
| Monitor revenue | Financial strategy |
| Flag anomalies | Sign-off on payments |

**Dashboard View:**
- Daily/weekly/monthly spend
- Revenue vs. expenses
- API usage costs
- Subscription tracker
- Cash flow projection

---

## The Central Entity: Business Proposition

At the heart of the command center is **the main idea**—a detailed business proposition document that defines:

1. **What the business does** (product/service description)
2. **Who it serves** (target audience)
3. **How it makes money** (revenue model)
4. **Success metrics** (MRR target, user count, etc.)
5. **Constraints** (budget, timeline, resources)

The AI reads this proposition and generates execution plans for each pillar. Every agent action traces back to this central document.

---

## The Memory Layer

Persistent knowledge store that grows over time:

- **Decisions made** — Why you approved/rejected agent suggestions
- **Lessons learned** — What worked, what failed
- **Business context** — Industry knowledge, competitor intel
- **User preferences** — Your communication style, priorities
- **Historical data** — Past campaigns, code changes, expenses

Agents consult memory before acting. This prevents repeating mistakes and maintains consistency.

---

## The AI Brain

The planning layer that coordinates everything:

1. **Reads** the business proposition
2. **Consults** memory for context
3. **Generates** optimal execution plans
4. **Prioritizes** tasks across all four pillars
5. **Adapts** based on results and feedback

### Planning Philosophy
> *"Generate the most revenue in the shortest time possible."*

The AI continuously asks:
- What's the highest-leverage action right now?
- What's blocking revenue?
- Where are we wasting resources?
- What should we stop doing?

---

## UI Layout Concept

```
┌──────────────────────────────────────────────────────────────────┐
│  COMMAND CENTER                              [Today] [Settings]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  💡 THE IDEA: [Mobile App Name] — Voice control for X      │  │
│  │  🎯 Target: $3,000 MRR by March 2026                       │  │
│  │  📊 Current: $450 MRR | 127 users | 14 days active         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │  MARKETING  │ │    SALES    │ │   PRODUCT   │ │ ACCOUNTING  │ │
│  │─────────────│ │─────────────│ │─────────────│ │─────────────│ │
│  │ 3 pending   │ │ 12 leads    │ │ 2 PRs ready │ │ $127 today  │ │
│  │ 1 needs ✓   │ │ 4 replies   │ │ 1 bug       │ │ $890 MTD    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  📋 TODAY'S PLAN (generated by AI)                         │  │
│  │  ──────────────────────────────────────────────────────    │  │
│  │  □ Deploy pricing page update (Product)                    │  │
│  │  □ Send 15 outreach emails (Sales)                         │  │
│  │  □ Post 2 tweets about launch (Marketing)                  │  │
│  │  ■ Review API costs — unusually high (Accounting) ⚠️       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🔔 NEEDS YOUR ATTENTION                                   │  │
│  │  ──────────────────────────────────────────────────────    │  │
│  │  → Agent wants to run: npm install stripe    [Allow][Deny] │  │
│  │  → Draft email to lead: "Hey Mike..." [Edit][Send][Skip]   │  │
│  │  → Suggested feature: add dark mode          [Yes][Later]  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  📜 RECENT ACTIVITY                                        │  │
│  │  ──────────────────────────────────────────────────────    │  │
│  │  14:32 — Deployed v1.2.4 to production                     │  │
│  │  14:15 — Sent 10 outreach emails (2 bounced)               │  │
│  │  13:50 — Published blog post: "Getting Started with..."    │  │
│  │  13:22 — Fixed bug: login button not working on Safari     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Workflow

### Morning
1. Open Command Center
2. Review overnight activity
3. Approve/reject pending items
4. AI generates today's plan
5. Confirm or adjust priorities

### Throughout Day
- Get mobile notifications for urgent approvals
- Voice-command new tasks from phone
- Agents execute autonomously

### Evening
1. Review what got done
2. Check revenue/metrics
3. AI updates tomorrow's plan
4. Memory logs the day's learnings

---

## Technical Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  MOBILE APP     │◄───►│  ELECTRON APP   │
│  (React Native) │     │  (Command Ctr)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    ┌──────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────────────────────┐
│           AGENT LAYER                   │
│  ┌─────────────┐    ┌─────────────┐     │
│  │  OpenCode   │    │   Codex     │     │
│  │  (sandbox)  │    │  (OpenAI)   │     │
│  └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           MEMORY / STATE                │
│  - Business proposition                 │
│  - Decision history                     │
│  - Metrics & analytics                  │
│  - Files & codebase                     │
└─────────────────────────────────────────┘
```

---

## Success Criteria

The command center works if:

1. You can run a business spending <1 hour/day in the app
2. Agents handle 80%+ of execution tasks
3. Revenue grows without proportional time investment
4. You feel in control, not overwhelmed

---

## First Milestone

Build a mobile app using this system and scale it to **$2,000–3,000 MRR**.

That's the proof. Everything else is theory until that works.

---

# Part 2: Execution Strategy

> *This section answers: "Okay, but what are we actually building and how do we get to $3k/month?"*

---

## What Mobile App to Build?

### Selection Criteria

The app must be:

| Criterion | Why It Matters |
|-----------|----------------|
| **Agent-buildable** | 80%+ of dev work can be done by AI |
| **Solo-scalable** | One person + agents can run it |
| **Clear monetization** | Subscription or one-time purchase, not ads |
| **Existing demand** | People already search for solutions |
| **Low support burden** | Not a complex B2B tool requiring hand-holding |
| **Your domain knowledge** | You understand the problem space |

### Strong Candidates

Based on your background (voice tools, AI, developer tooling, productivity):

#### Option A: Voice Memo → Structured Notes App
- **What:** Speak freely, AI structures into actionable notes/tasks
- **Why it fits:** You use voice extensively, understand the UX
- **Monetization:** $4.99/month or $29.99/year
- **Competition:** Otter.ai (too enterprise), Voice Memos (no structure), Whisper apps (just transcription)
- **Moat:** The *structuring* layer—not just transcription, but turning rambles into organized output

#### Option B: AI Dev Journal
- **What:** Daily voice/text log for developers, AI summarizes progress, blockers, next steps
- **Why it fits:** Developer audience, you are the user
- **Monetization:** $3.99/month, $29.99/year
- **Competition:** Linear (too complex), Day One (not dev-focused)
- **Moat:** Built for devs, integrates with git activity

#### Option C: Business Idea Validator
- **What:** Speak your idea, AI researches competition, market size, risks
- **Why it fits:** You've been validating ideas constantly, know the pain
- **Monetization:** $9.99 one-time for deep report, freemium for basic
- **Competition:** Ideaflow, generic AI chats
- **Moat:** Structured output, not just a chat

#### Option D: Voice → Code Snippets
- **What:** Describe what you need, get working code with explanation
- **Why it fits:** Direct application of your vision
- **Monetization:** $5.99/month
- **Competition:** ChatGPT (general), Cursor (desktop)
- **Moat:** Mobile-first, voice-first, instant

### Recommendation

**Start with Option A: Voice Memo → Structured Notes.**

Reasons:
1. You personally use voice heavily—you'll have strong opinions on UX
2. Low technical risk—transcription is solved, structuring is the value-add
3. Broad market—not just developers
4. Clear upgrade path—free tier (5 notes/month), paid tier (unlimited)
5. Agents can handle most of it—marketing content, support, iterations

---

## Revenue Math

**Target:** $3,000 MRR

### At $4.99/month:
- Need: 601 paying subscribers
- At 3% conversion from free: ~20,000 free users
- At 5% conversion: ~12,000 free users

### At $29.99/year:
- Need: ~1,200 annual subscribers (averaging $2.50/month effective)
- More realistic for productivity apps

### Blended Model:
- $4.99/month OR $29.99/year
- Target: 400 annual + 200 monthly = ~$3,000/month

### How to Get 400-600 Paying Users

| Channel | Agent Role | Expected Users |
|---------|------------|----------------|
| App Store SEO | Research keywords, write descriptions | 30% of total |
| Twitter/X content | Generate posts, engage | 20% of total |
| Reddit/HN posts | Draft launch posts for approval | 15% of total |
| Product Hunt launch | Prepare assets, copy | 10% of total |
| Direct outreach | Email bloggers, podcasters | 15% of total |
| Referral program | Implement in-app | 10% of total |

---

## 90-Day Roadmap

### Phase 1: Foundation (Days 1-14)

**Goal:** Working prototype that you use daily

| Task | Owner | Done When |
|------|-------|-----------|
| Transform Mac app into Command Center MVP | Agent + You | Can see agent activity dashboard |
| Set up OpenCode + Codex integration | Agent | Can send tasks from Mac app |
| Create React Native project skeleton | Agent | Runs on simulator |
| Implement voice recording + Whisper transcription | Agent | Can record and transcribe |
| Basic structuring via Claude API | Agent | Transcription → structured note |
| Local storage for notes | Agent | Notes persist |

**You approve:** Architecture decisions, API choices, UX flow

---

### Phase 2: Core Product (Days 15-35)

**Goal:** App ready for TestFlight beta

| Task | Owner | Done When |
|------|-------|-----------|
| Polish UI/UX | Agent | Feels premium, not prototype |
| Implement note organization (folders, tags) | Agent | Can organize notes |
| Add edit/delete functionality | Agent | Full CRUD |
| Implement share feature | Agent | Can share note as text/image |
| Create onboarding flow | Agent | First-time user guided |
| TestFlight setup | Agent | Can distribute to testers |
| Get 10 beta testers | You | Real people using it |
| Collect feedback | Agent (survey) | Actionable insights |

**You approve:** Visual design, onboarding copy, beta tester selection

---

### Phase 3: Monetization (Days 36-50)

**Goal:** Revenue infrastructure ready

| Task | Owner | Done When |
|------|-------|-----------|
| Implement RevenueCat / StoreKit | Agent | Subscriptions work |
| Create paywall UI | Agent | Clear value proposition |
| Implement free tier limits | Agent | 5 notes/month free |
| Add restore purchases | Agent | Works correctly |
| App Store assets (screenshots, preview) | Agent | Ready for submission |
| App Store description + keywords | Agent | Optimized for ASO |
| Privacy policy, terms | Agent | Compliant |
| Submit to App Store | Agent | In review |

**You approve:** Pricing, paywall messaging, legal docs

---

### Phase 4: Launch (Days 51-70)

**Goal:** 1,000 downloads, 30 paying users

| Task | Owner | Done When |
|------|-------|-----------|
| Product Hunt launch | Agent prepares, you post | Live, 100+ upvotes |
| Twitter launch thread | Agent drafts, you tweet | Posted, engagement |
| HackerNews Show HN | Agent drafts, you post | Frontpage attempt |
| Reddit posts (r/productivity, etc.) | Agent drafts, you post | 5+ subreddits |
| Blogger/podcaster outreach | Agent researches + drafts | 20 emails sent |
| Respond to reviews | Agent drafts, you approve | All reviews addressed |
| Monitor crash reports | Agent | <1% crash rate |
| Iterate based on feedback | Agent | Weekly updates |

**You approve:** All public-facing content before publishing

---

### Phase 5: Scale (Days 71-90)

**Goal:** $1,000 MRR, clear path to $3,000

| Task | Owner | Done When |
|------|-------|-----------|
| Analyze what's working (channels, features) | Agent | Report with recommendations |
| Double down on best channel | Agent | 2x effort on winner |
| A/B test paywall | Agent | Test 2-3 variations |
| Add requested features | Agent | Top 3 requests implemented |
| SEO content (blog/landing pages) | Agent | 5 articles published |
| Referral program | Agent | In-app referral system |
| Accounting setup | Agent | Track all expenses, API costs, revenue |
| Re-evaluate at $1k MRR | You | Decide: continue, pivot, or expand |

---

## Concrete Agent Workflows

### Marketing Workflow (Weekly)

```
Monday:
  Agent → Research trending topics in productivity space
  Agent → Draft 5 tweet ideas
  You → Approve/edit 3 best ones
  Agent → Schedule tweets

Wednesday:
  Agent → Analyze last week's engagement
  Agent → Draft one longer-form content piece (blog/thread)
  You → Review and approve

Friday:
  Agent → Compile weekly metrics report
  Agent → Suggest next week's focus
```

### Sales Workflow (Ongoing)

```
Daily:
  Agent → Monitor for mentions, reviews, support emails
  Agent → Draft responses
  You → Approve and send (or auto-approve low-risk)

Weekly:
  Agent → Research 10 new bloggers/podcasters in space
  Agent → Draft personalized outreach emails
  You → Review and send top 5
```

### Product Workflow (Sprint-Based)

```
Every 2 weeks:
  Agent → Analyze crash reports, reviews, support requests
  Agent → Propose sprint priorities
  You → Approve sprint plan
  Agent → Execute development tasks
  Agent → Submit update to App Store
  You → Final test before release
```

### Accounting Workflow (Monthly)

```
End of month:
  Agent → Compile all API costs (Claude, OpenAI, Whisper)
  Agent → Log Apple revenue (App Store Connect)
  Agent → Calculate profit/loss
  Agent → Generate financial summary
  You → Review, flag anomalies
```

---

## What Could Go Wrong

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| App Store rejection | Medium | Agent researches guidelines, you review carefully |
| No organic downloads | Medium | Diversify channels, paid ads as backup |
| Low conversion to paid | Medium | Test pricing, improve value prop, add features |
| Agent makes bad code | Low | Sandbox + review critical changes |
| API costs exceed revenue | Low | Monitor daily, set hard limits |
| Burnout | Medium | Strict 1hr/day limit, trust the agents |
| Competitor copies idea | Medium | Move fast, build brand/community |

---

## Decision Framework

When you're unsure, ask:

1. **Does this move us toward $3k MRR?**
   - Yes → Do it
   - No → Why are we considering it?

2. **Can an agent do this?**
   - Yes → Delegate
   - No → Is it worth my time?

3. **Is this reversible?**
   - Yes → Move fast, approve quickly
   - No → Review carefully

4. **What's the cost of being wrong?**
   - Low → Let agent decide
   - High → You decide

---

## The Real Test

After 90 days, one of these is true:

1. **Success:** $1k+ MRR, clear path to $3k
   - Proof that agents can run a business
   - Command center becomes the product

2. **Partial success:** App works, some users, <$500 MRR
   - Learn what's missing
   - Iterate or pivot

3. **Failure:** App launched but no traction
   - Understand why (product, market, execution?)
   - Either try a different app or conclude the thesis is wrong

Any outcome is valuable. You're not just building an app—you're testing whether *this entire model* works.

---

## Next Steps (Immediate)

1. **Decide on the app** — Confirm voice-to-structured-notes or pick alternative
2. **Set up agents** — OpenCode server running, Codex access configured
3. **Pivot the Mac app** — Start building Command Center UI (replace flowchart)
4. **Day 1 of the 90-day clock** — Start the sprint
