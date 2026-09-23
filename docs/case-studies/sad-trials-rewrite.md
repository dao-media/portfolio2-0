# Location-First Design Cut Clinical Trial Abandonment From 65% to 37%

**One-line hook:** Participants wouldn't finish a medical screener when they couldn't answer "Is this near me?" without sharing health data first. I flipped the funnel—cities before screening—and abandonment fell from 65% to 37% vs four prior campaign sites.

| | |
|---|---|
| Role | Sole UX/UI designer (Lead Designer) |
| Client / product | SAD Clinical Trials recruitment platform |
| Discipline | Web + UX (primary) |
| Timeline | 6 weeks |
| Team | Me on discovery, IA, UX, and UI; partnered with one front-end developer on the React screener + Miracle Software enrollment integration |
| Status | Shipped; framework adopted on later studies |

## The problem

A Fortune 100 clinical research org averaged **65% pre-screening abandonment** across four previous trial sites—technically sound builds that still burned campaign spend and delayed enrollment. Users spent ~3:12 on informational pages, then bailed mid-screener. Support mail kept asking the same question: *"Where is this trial?"*

Location was conversion-walled: cities and facilities appeared only after screening. Participants had to share sensitive health data before knowing geographic viability. The client asked for another site on the same template: study info → medical details → screener → locations.

**Constraint that shaped every choice:** Ship in six weeks for winter enrollment, WCAG 2.1 AA + HIPAA-safe, without turning dosing facilities into a support desk.

## What broke the first plan

I interviewed eight prospective participants (24–61) tied to prior campaigns and audited competing trial sites. Every interviewee hunted for location before starting the form. One said it plainly: *"I see no point in divulging my medical history if this trial is in California and I'm in Ohio."*

Stakeholders had reasons to hide locations: fear of discouraging people when the city list was incomplete, and fear of facilities getting flooded with eligibility questions they weren't staffed to answer. Both concerns were real. The fix—hiding *all* geographic signal—was wrong. It protected ops by recreating the exact uncertainty driving abandonment.

## Decisions that mattered

### 1. Cities before the screener—without facility contact

- **Chose:** A searchable **test-site city directory** up front (Atlanta, Boston, Chicago…), then screener, then ZIP-based facility match within 150 miles after qualifying.
- **Over:** The industry/client template that revealed locations only in "next steps."
- **Because:** Interviews + support themes proved "Is this near me?" was a viability question, not a request to call the site. Cities answered viability; withholding addresses preserved the ops constraint.
- **Evidence after:** Crazy Egg / scroll behavior showed ~85% of mobile users going straight to the city directory; live heatmaps later showed ~18s average scan before the screener. Test sites reported **no increase** in premature contact.

### 2. Progressive disclosure that earns health data

- **Chose:** Three-step flow—city directory + overview → branching eligibility screener → consent + facility match—plus a persistent plain-language HIPAA banner ("We don't store your information until you consent") and conversational progress ("Quick eligibility check" → "Almost there!") instead of 1/3–3/3 bars.
- **Over:** Long undifferentiated forms and generic progress chrome from prior sites.
- **Because:** Think-aloud retests surfaced privacy anxiety, progress ambiguity, and 32px touch targets causing mis-taps on mobile-heavy traffic.
- **Evidence after:** Screener completion time **4:20 → 2:30** (−40%) after two iteration rounds; participants called it "simple / clear / reassuring"; debrief ratings were all easy / very easy.

### 3. Mobile as the recruitment context, not a breakpoint afterthought

- **Chose:** Mobile-first readability and **48px** minimum targets.
- **Over:** Prior sites' ~14px body and tight mobile spacing.
- **Because:** ~67% of traffic was already mobile; ads hit people on commutes and lunch breaks.
- **Evidence after:** **67% of completions** happened on mobile after launch.

## What shipped

A nationwide recruitment site and React eligibility screener integrated with Miracle Software, launched on the six-week clock and stable at **10,000+ monthly users**.

Visual callouts (for production):

1. **Before/after funnel diagram** — template (locations last) vs location-first (cities → screener → facilities).
2. **City directory UI** — viability without facility phone numbers.
3. **Screener frame with HIPAA banner + conversational progress** — trust and effort clarity.
4. **Post-qualify facility match** — ZIP radius only after eligibility.

## Results

Measured against four prior campaign sites from the same organization (first ~90 days unless noted):

| Metric | Before | After | Window | How measured |
|--------|--------|-------|--------|--------------|
| Form abandonment | 65% | 37% (−29 pts) | vs prior campaigns | Funnel / screener completion |
| Bounce rate | 62% | 44% (−18 pts) | vs prior campaigns | Analytics vs prior baselines |
| Screener time | 4:20 | 2:30 (−40%) | Pre-launch tests | Moderated sessions (n=8) |
| Verified participant matches | — | +23% | First 90 days | Enrollment / match reporting |
| Completions on mobile | — | 67% | Post-launch | Analytics |
| Manual verification time | — | −18% | Post-launch | Recruitment ops |
| Staff-time savings | — | ~$24K | Reported on live case study | Ops estimate tied to verification lift |

Two regional sites hit enrollment quotas **11 days early**. Remaining abandonment skewed toward legitimate exits (ineligibility, scheduling, opt-out)—not "where is this?" frustration. Strongest institutional signal: the client **replaced the old template**; the location-first system was reused on **two additional studies**.

## What I'd carry forward

- **Broken assumption:** Competent execution of an industry template would fix abandonment. The bottleneck was structural.
- **Portable insight:** When ops fear exposure, design the *minimum viable transparency* (cities, not contacts)—don't default to hiding the signal users need to proceed.
- **If I redid one thing:** Push for a live A/B of location placement against the old template. Qualitative evidence won the argument under a six-week crunch; a controlled test would have made the case airtight.
