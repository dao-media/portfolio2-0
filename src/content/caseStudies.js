/**
 * Case study catalog for Duo Mail + full-screen overlay.
 * Copy sourced from docs/case-studies/ (sad-trials uses rewrite).
 */

/**
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   summary: string,
 *   category: string,
 *   from: string,
 *   sourceUrl: string,
 *   image: string | null,
 *   bodyHtml: string,
 *   stats?: { value: string, label: string }[]
 * }} CaseStudy
 */

/** @type {CaseStudy[]} */
export const CASE_STUDIES = [
  {
    slug: "sad-trials",
    title: "Location-First Design Cut Clinical Trial Abandonment From 65% to 37%",
    summary:
      "Participants wouldn't finish a medical screener when they couldn't answer \"Is this near me?\" without sharing health data first. I flipped the funnel—cities before screening—and abandonment fell from 65% to 37% vs four prior campaign sites.",
    category: "Web",
    from: "SAD Clinical Trials",
    sourceUrl: "https://daneoleary.com/web/sad-trials",
    image: "/assets/case-studies/sad-trials.webp",
    stats: [
      { value: "37%", label: "Abandonment (from 65%)" },
      { value: "−40%", label: "Screener time" },
      { value: "+23%", label: "Verified matches, 90 days" }
    ],
    bodyHtml: `
<section>
  <h2>The problem</h2>
  <p>A Fortune 100 clinical research org averaged <strong>65% pre-screening abandonment</strong> across four previous trial sites. Users spent ~3:12 on informational pages, then bailed mid-screener. Support mail kept asking: <em>"Where is this trial?"</em></p>
  <p>Location was conversion-walled behind screening. Ship clock: six weeks for winter enrollment, WCAG 2.1 AA + HIPAA-safe.</p>
</section>
<section>
  <h2>Decisions that mattered</h2>
  <ul>
    <li><strong>Cities before the screener</strong> — searchable test-site city directory up front, then screener, then ZIP-based facility match after qualifying.</li>
    <li><strong>Progressive disclosure</strong> — three-step flow with a persistent HIPAA banner and conversational progress instead of generic bars.</li>
    <li><strong>Mobile as context</strong> — 48px minimum targets; ~67% of completions happened on mobile after launch.</li>
  </ul>
</section>
<section>
  <h2>Results</h2>
  <ul>
    <li>Form abandonment <strong>65% → 37%</strong> (−29 pts)</li>
    <li>Bounce rate <strong>62% → 44%</strong></li>
    <li>Screener time <strong>4:20 → 2:30</strong> (−40%)</li>
    <li>Verified participant matches <strong>+23%</strong> in first 90 days</li>
    <li>Client replaced the old template; location-first reused on two more studies</li>
  </ul>
</section>`
  },
  {
    slug: "312-truck",
    title: "Building Trust From Zero: 2.4x Leads & $168K Monthly Pipeline Growth",
    summary:
      "Built a digital presence for a MAACO-affiliated auto repair brand based in the Southside neighborhood of Chicago. Implemented a user-driven strategy to educate and engage, creating a pipeline for 13% month-to-month revenue growth and driving around $168K in new monthly sales.",
    category: "Web",
    from: "312 Truck / MAACO",
    sourceUrl: "https://daneoleary.com/web/312-truck",
    image: "/assets/case-studies/312-truck.webp",
    stats: [
      { value: "2.4×", label: "Lead volume vs baseline" },
      { value: "$168K", label: "New monthly pipeline" },
      { value: "13%", label: "MoM revenue growth signal" }
    ],
    bodyHtml: `
<section>
  <h2>Challenge</h2>
  <p>A new MAACO-affiliated shop on Chicago's Southside needed credibility from day one—no brand equity, competing against established repair names, and a audience that researched online before booking bodywork.</p>
</section>
<section>
  <h2>Approach</h2>
  <p>Education-first web experience: transparent process, neighborhood trust signals, and clear conversion paths for estimates and appointments. Content and IA prioritized questions real customers ask before they call.</p>
</section>
<section>
  <h2>Outcome</h2>
  <ul>
    <li><strong>2.4×</strong> lead volume vs prior baseline</li>
    <li>~<strong>$168K</strong> new monthly pipeline</li>
    <li>~<strong>13%</strong> month-to-month revenue growth signal</li>
  </ul>
</section>`
  },
  {
    slug: "vedara-ventures",
    title: "From Concept to Credibility in 8 Weeks: Branding & Web Design for a $100M+ Holding Company",
    summary:
      "With holdings across automotive, real estate, and hospitality, Vedara Ventures had zero footprint—no logo, no website, no visual identity. In 8 weeks with a $7.5K budget, I designed the brand and implemented a scalable CMS framework so new companies can be added to the portfolio without developer involvement.",
    category: "Web",
    from: "Vedara Ventures",
    sourceUrl: "https://daneoleary.com/web/vedara-ventures",
    image: "/assets/case-studies/vedara-ventures.webp",
    stats: [
      { value: "8 wks", label: "Brand + site shipped" },
      { value: "$7.5K", label: "Total project budget" },
      { value: "$100M+", label: "Holding company scale" }
    ],
    bodyHtml: `
<section>
  <h2>Challenge</h2>
  <p>A $100M+ holding company spanning automotive, real estate, and hospitality had no logo, site, or visual system—and an eight-week clock with a $7.5K budget.</p>
</section>
<section>
  <h2>Approach</h2>
  <p>Brand identity plus a CMS-ready portfolio architecture so new portfolio companies can publish without engineering. Emphasis on institutional credibility and modular content patterns.</p>
</section>
<section>
  <h2>Outcome</h2>
  <p>Shipped brand + site in eight weeks. New holdings can be added through the CMS without developer involvement.</p>
</section>`
  },
  {
    slug: "nar-app",
    title: "Designing for Compassion: The Never Alone Recovery App",
    summary:
      "Designed a digital companion to support those in recovery. Emphasized empathy and autonomy with a motivational dashboard and dynamic real-time recovery insights with potential sponsor linking.",
    category: "UX",
    from: "Never Alone Recovery",
    sourceUrl: "https://daneoleary.com/ux/nar-app",
    image: "/assets/case-studies/nar-app.webp",
    stats: [
      { value: "UX", label: "Empathy-led product design" },
      { value: "Live", label: "Recovery insights dashboard" },
      { value: "Opt-in", label: "Sponsor linking model" }
    ],
    bodyHtml: `
<section>
  <h2>Challenge</h2>
  <p>Recovery support tools often feel clinical or coercive. Never Alone needed a companion that respects autonomy while still offering structure, motivation, and optional sponsor connection.</p>
</section>
<section>
  <h2>Approach</h2>
  <p>Empathy-led UX: motivational dashboard, real-time recovery insights, and sponsor linking designed as opt-in support—not surveillance.</p>
</section>
<section>
  <h2>Outcome</h2>
  <p>A compassion-centered mobile experience that balances accountability with dignity for people in recovery.</p>
</section>`
  },
  {
    slug: "schedually",
    title: "Time-Blocking Wizard: Proactive Schedule Protection for Multi-Calendar Chaos",
    summary:
      "Professionals managing multiple calendars need boundaries between work, personal, and family time. This time-blocking tool flips the scheduling model—defining protected blocks upfront instead of reactively. Having a visual template reduced decision fatigue while preventing cross-context scheduling conflicts.",
    category: "UX",
    from: "Schedually",
    sourceUrl: "https://daneoleary.com/ux/schedually",
    image: "/assets/case-studies/schedually.webp",
    stats: [
      { value: "Proactive", label: "Blocks before bookings" },
      { value: "Multi-cal", label: "Work · personal · family" },
      { value: "Less load", label: "Decision fatigue down" }
    ],
    bodyHtml: `
<section>
  <h2>Challenge</h2>
  <p>People juggling work, personal, and family calendars were reacting to conflicts after they appeared—decision fatigue and context bleed were the default.</p>
</section>
<section>
  <h2>Approach</h2>
  <p>Flip the model: define protected blocks first with a visual template, then schedule around them. Proactive boundaries instead of reactive firefighting.</p>
</section>
<section>
  <h2>Outcome</h2>
  <p>Clearer multi-calendar hygiene and fewer cross-context collisions, with less cognitive load when planning the week.</p>
</section>`
  }
];

/**
 * @param {string} slug
 * @returns {CaseStudy | undefined}
 */
export function getCaseStudy(slug) {
  return CASE_STUDIES.find((c) => c.slug === slug);
}
