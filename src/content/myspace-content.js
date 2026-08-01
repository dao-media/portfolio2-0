export const MYSPACE_PHOTO_DANE = "/assets/myspace/dane.jpg";
export const MYSPACE_PHOTO_TOM = "/assets/myspace/myspacetom.webp";

export const MYSPACE_PROFILE = {
  name: "Dane O'Leary",
  handle: "daneoleary",
  photo: MYSPACE_PHOTO_DANE,
  displayName: "Dane",
  tagline: '★ "The Design Archaeologist™"',
  mood: "caffeinated 🍵",
  lastLogin: "7/7/2026",
  headline: "Designer · Developer · Design Archaeologist™",
  location: "Virginia, USA",
  status: "In a relationship",
  hereFor:
    "Hiring managers who read past the resume. Founders who care whether users can actually use the thing. Fellow designers who think design systems are exciting (we exist, and we found each other's profiles somehow). Jules Verne, obviously. And whoever's flying those things the Pentagon won't explain.",
  hometown: "Northern Virginia",
  url: "myspace.com/daneoleary",
  aboutMe: `Hey, I'm Dane. Designer, web developer, and self-appointed Design Archaeologist™ — which basically means I spend my days excavating messy interfaces, tangled codebases, and half-buried brand identities to figure out what's actually underneath. Spoiler: it's usually something worth saving.

I've been doing this for 14+ years. I run my own studio, Dane O'Leary Media, where I've shipped work for everyone from biotech companies running clinical trials to an addiction recovery platform to stock trading dashboards — the kind of projects where the design isn't decoration, it's whether someone actually gets help, gets enrolled, or makes a confident decision. These days I'm also a fractional Senior Web Developer at VYNE Creative, a boutique agency where I recently built LINEAR, a tokenized design system spanning Figma and Webflow. Before that, I spent years as a design lead at a marketing + design agency, juggling more concurrent brands than I'd like to admit.

My toolbox: Figma, Webflow, WordPress, and enough Three.js/WebGL to convince a browser it's looking at real clouds. My philosophy: accessibility isn't a compliance checkbox — WCAG 2.2 AA is the floor, not the trophy. If your grandmother can't use it, I'm not done yet.

When I'm not designing, I'm writing about UX on LinkedIn, reading Jules Verne, watching too many films, going down UAP disclosure rabbit holes, or reading physics for fun (yes, for fun). Ask me about Greece.

Click around. Read the blog. Sign the guestbook. It's 2006 somewhere.`,
  interests: {
    General: "UX & accessibility · design systems · WebGL/shaders · film · Jules Verne · physics (recreationally) · UAP disclosure · Greece",
    Music: "whatever's on while the MacBook fan renders volumetric clouds",
    Movies: "too many films, title sequences, slow burns",
    Heroes: "Every designer who names their layers and documents their systems."
  }
};

export const friendComments = [
  { friend: "Sarah K.", text: "The CRT power-on on your portfolio?? Chef's kiss." },
  { friend: "Marcus", text: "Webflow + Three.js tutorial when?" },
  { friend: "Tom", text: "Thanks for being my friend!" }
];

export const topFriends = [
  { id: "tom", name: "Tom", photo: MYSPACE_PHOTO_TOM, color: "#4a6fa5", initials: "T" },
  { id: "figma", name: "Figma", color: "#a259ff", initials: "F" },
  { id: "webflow", name: "Webflow", color: "#4353ff", initials: "W" },
  { id: "framer", name: "Framer", color: "#000000", initials: "Fr" },
  { id: "verne", name: "J. Verne", color: "#3d8b6e", initials: "JV" },
  { id: "linear", name: "LINEAR", color: "#c98a3d", initials: "L" },
  { id: "sky", name: "Sky Vista", color: "#3d7fc9", initials: "SV" },
  { id: "mx", name: "MX", color: "#c74b4b", initials: "MX" }
];

export const nowPlaying = {
  artist: "MacBook Pro (2021)",
  song: "fan hum (volumetric clouds remix)",
  album: "Rendering Live",
  profileSong: true
};

export const bulletins = [
  {
    id: "welcome",
    title: "Welcome — thanks for stopping by",
    date: "Jul 7, 2026",
    preview: "Click around. Read the blog. Sign the guestbook. It's 2006 somewhere.",
    body: `Hey — if you clicked through from the monitor, you found the profile.

I'm Dane: designer, developer, and self-appointed Design Archaeologist™. This desk scene is the About vignette for my portfolio — same energy as the old web, better typography (hopefully).

Start with the blog entries on the right. That's the real tour.`
  },
  {
    id: "available",
    title: "Open for select freelance & collabs",
    date: "Jul 1, 2026",
    preview: "Product design, creative front-end, Webflow + custom code hybrids.",
    body: `I'm taking on a small number of projects where design and implementation need to live in the same brain.

Best fit:
• Marketing sites with real craft (Webflow, custom embeds, motion)
• Design systems & component libraries
• Interactive storytelling / 3D-adjacent web experiences

If you're building something that needs to feel intentional — not template-shaped — say hi.`
  },
  {
    id: "now-playing",
    title: "Currently listening to: a MacBook fan",
    date: "Jun 28, 2026",
    preview: "the hum of a 2021 MacBook Pro fan rendering volumetric clouds",
    body: `Profile song of the week is whatever the laptop is doing while Sky Vista raymarches another cloud pass.

If you can hear it through the CRT, you're too close.`
  }
];

export const blogs = [
  {
    id: "design-archaeologist",
    title: "Digging in the Dirt: Confessions of a Design Archaeologist",
    date: "Mar 14, 2024",
    preview: "Most designers want a blank canvas. I learned to love the dig site.",
    mood: "nostalgic",
    music: "whatever was on while excavating a 15,000-line CSS file",
    body: `People ask where "The Design Archaeologist" came from. Honest answer: from years of inheriting other people's projects. The website with six generations of contractors buried in the stylesheet. The brand with three logos and no idea which one is real. The 15,000-line CSS file nobody had audited since it was born.

Most designers want a blank canvas. I learned to love the dig site. Because when you excavate carefully — layer by layer, asking why every weird decision got made — you find the good bones. The thing the original team was trying to build before deadlines and turnover got in the way. My whole practice is built on that: don't bulldoze, excavate. Understand before you redesign. The artifacts tell you what the users needed all along.

Fourteen years in, I've stopped apologizing for preferring the messy projects. That's where the interesting stuff is buried.`
  },
  {
    id: "studio-years",
    title: "40 Clients and a Laptop: The Studio Years",
    date: "Nov 2, 2024",
    preview: "Running your own studio teaches you things no agency job can.",
    mood: "proud",
    music: "late-night freelance playlist (untitled)",
    body: `Running your own studio teaches you things no agency job can. Like how to be the designer, developer, strategist, project manager, and accounts-receivable department before lunch.

Dane O'Leary Media started as freelance work and quietly became something closer to a one-person agency — 40+ clients over the years, across fintech, biotech, healthcare, and recovery. Some highlights that still make me proud: HIPAA-compliant clinical trial sites with pre-qualification flows that meaningfully boosted patient enrollment. Trading dashboards where clear data visualization was the difference between confidence and hesitation. And Never Alone Recovery — designing an accountability system for people fighting addiction, where "user retention" means something much heavier than it does on a SaaS deck.

That's the era that taught me my actual specialty: removing friction from complex, high-stakes systems. When the stakes are someone's health, money, or recovery, "intuitive" stops being a buzzword.`
  },
  {
    id: "agency-years",
    title: "The Agency Years: Eight Brands, One Designer, Zero Chill",
    date: "Jan 8, 2026",
    preview: "If the studio years taught me depth, the agency years taught me plate-spinning.",
    mood: "reflective",
    music: "something loud enough to drown out Slack",
    body: `For about six years I was a design lead at a marketing + design agency, and if the studio years taught me depth, the agency years taught me plate-spinning. At one point I was solo-managing a whole network of behavioral health brands — multiple sites, multiple identities, one me — for over two years straight.

What I took from it: systems thinking isn't optional at that scale. You can't hand-craft every page across eight concurrent engagements; you build patterns, templates, and standards that let quality survive the chaos. It's also where I got serious about mentoring and stakeholder work — learning that half of senior design is translation: user needs into business language, business goals into pixels.

The agency chapter closed in late 2025. No regrets, a lot of gray hairs, and a systems brain I use every single day now.`
  },
  {
    id: "clouds-and-robots",
    title: "Teaching Clouds to Float (and Robots to Read)",
    date: "Jul 7, 2026",
    preview: "Sky Vista, LINEAR, and designing for a second audience — machines.",
    mood: "caffeinated",
    music: "the hum of a 2021 MacBook Pro fan rendering volumetric clouds",
    body: `Two obsessions are running my life right now.

First: Sky Vista, the WebGL cloudscape on my portfolio hero. Raymarched volumetric clouds, a full day/night cycle, sun and moon and stars, and a pointer-driven vortex you can stir with your cursor — all procedural, all running live in Webflow. It took an embarrassing number of iterations. Worth every one. Sometimes you build something just to prove the browser can do it.

Second, and bigger: LINEAR, a tokenized design system I built at VYNE Creative — a three-tier token architecture (primitives → semantic → component) spanning a Figma library and Webflow clonable, with accessibility encoded right into the components. It came out of auditing a 15,000-line CSS file and deciding never again.

And the thread connecting everything lately: I've started designing for a second audience — machines. AI agents are browsing the web now, and most sites are illegible to them. I call it Machine Experience (MX): semantic architecture, llms.txt, agents.json — making sure your site makes sense whether the visitor has eyes or an API key. Accessibility was always about designing for every kind of visitor. Turns out that now includes the robots.`
  }
];

export function findContentById(id) {
  return (
    bulletins.find((item) => item.id === id) ||
    blogs.find((item) => item.id === id) ||
    null
  );
}

/**
 * Hit/hover ids may be scoped (`post-id#title`, `post-id#more`) so title and
 * "[view more]" highlight independently while navigating to the same post.
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
export function resolveMySpaceNavId(id) {
  if (id == null || id === "") return null;
  if (id === "__back") return "__back";
  const hash = id.indexOf("#");
  return hash === -1 ? id : id.slice(0, hash);
}
