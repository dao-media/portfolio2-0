export const MYSPACE_PHOTO_DANE = "/assets/myspace/dane.jpg";
export const MYSPACE_PHOTO_TOM = "/assets/myspace/myspacetom.webp";

export const MYSPACE_PROFILE = {
  name: "Dane O'Leary",
  handle: "daneoleary",
  photo: MYSPACE_PHOTO_DANE,
  mood: "Building Portfolio 2.0 🎬",
  lastLogin: "Today",
  headline: "Designer · Developer · Scene builder",
  location: "Virginia, USA",
  status: "Single",
  hereFor: "Friends, Networking, Portfolio stalkers",
  hometown: "Northern Virginia",
  url: "myspace.com/daneoleary",
  aboutMe: `Designer/developer building cinematic web experiences. Portfolio 2.0 = scroll-driven 3D vignettes with real UI you can click — like this monitor.`,
  interests: {
    General: "Typography, film grain, early internet",
    Music: "Indie, electronic, good bridges",
    Movies: "Slow burns, title sequences",
    Books: "Design essays, sci-fi, 2am READMEs"
  }
};

export const friendComments = [
  { friend: "Sarah K.", text: "The CRT power-on on your portfolio?? Chef's kiss." },
  { friend: "Marcus", text: "Webflow + Three.js tutorial when?" }
];

export const topFriends = [
  { id: "tom", name: "Tom", photo: MYSPACE_PHOTO_TOM, color: "#4a6fa5", initials: "T" },
  { id: "sarah", name: "Sarah K.", color: "#c75b7a", initials: "SK" },
  { id: "marcus", name: "Marcus", color: "#3d8b6e", initials: "M" },
  { id: "lena", name: "Lena", color: "#8b5fc7", initials: "L" },
  { id: "devon", name: "Devon", color: "#c98a3d", initials: "D" },
  { id: "priya", name: "Priya", color: "#3d7fc9", initials: "P" },
  { id: "alex", name: "Alex R.", color: "#7a7a7a", initials: "AR" },
  { id: "jules", name: "Jules", color: "#c74b4b", initials: "J" }
];

export const nowPlaying = {
  artist: "Tycho",
  song: "Awake",
  album: "Awake",
  profileSong: true
};

export const bulletins = [
  {
    id: "welcome",
    title: "Welcome — thanks for stopping by",
    date: "Jul 6, 2026",
    preview: "This desk scene is the same retro setup from my live site, reimagined for the new portfolio.",
    body: `Hey — if you clicked through from the monitor, you found the bulletin board.

I'm Dane O'Leary: designer, developer, and chronic over-builder of tiny interactive worlds. This proof-of-concept is the next evolution of my portfolio — cinematic camera moves, scroll-driven vignettes, and scenes you can actually touch.

The retro PC you see here is the same family of 3D work I've been shipping on my current site. Portfolio 2.0 keeps the desk, swaps the CLI for something more… 2006.`
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

If you're building something that needs to feel intentional—not template-shaped—say hi.`
  },
  {
    id: "now-playing",
    title: "Now playing: early-internet nostalgia",
    date: "Jun 28, 2026",
    preview: "MySpace layouts, AIM away messages, and hand-coded HTML tables.",
    body: `Every era of the web leaves a fingerprint. Mine includes custom MySpace themes, pirated HTML tutorials, and the sincere belief that a marquee tag could solve branding.

This admin panel is deliberately functional—not a screenshot—because the best portfolio pieces are the ones you can poke. Bulletins for quick updates, blogs for longer stories. Same energy as the old web, better typography (hopefully).`
  }
];

export const blogs = [
  {
    id: "origin",
    title: "Origin story: from MySpace HTML to Three.js",
    date: "Jun 12, 2026",
    preview: "The through-line from teenage profile hacks to cinematic WebGL scenes.",
    body: `The first "product" I ever shipped was a MySpace profile with a stolen background tile and a carefully misaligned div table. It was ugly. It was mine.

Years later I'm still doing the same thing with better tools: building a frame, putting something human inside it, and hiding a joke or two for whoever scrolls far enough.

The retro PC scene on my current site started as a nostalgia exercise and turned into a real technical rabbit hole—GLB pipelines, canvas terminals, desk UV anchoring, Furby hair lines (don't ask). Portfolio 2.0 keeps that craft and changes the interaction model: scroll to move the camera, click to read.`
  },
  {
    id: "desk-as-ui",
    title: "The desk is the UI",
    date: "May 30, 2026",
    preview: "Why I'm treating 3D vignettes like product surfaces, not just hero eye candy.",
    body: `There's a version of this project that's only a reel of cool camera moves. That's not the version I'm building.

Each vignette is a surface:
• Something to look at (composition, lighting, motion)
• Something to do (click, drag, read, explore)

The monitor isn't decoration—it's a bulletin board and blog index wearing a CRT costume. Touch targets have to work on mobile. Detail views have to be readable. The 3D scene sells the mood; the content still has to carry the story.`
  },
  {
    id: "what-next",
    title: "What comes after the proof of concept",
    date: "May 18, 2026",
    preview: "Case studies, music player vignette, and importing the full retro desk build.",
    body: `This repo is deliberately scoped as a POC. The architecture already separates vignettes, scroll control, and screen renderers so the next pieces slot in cleanly:

1. Import the full retro PC scene (models, desk, props) from production
2. Replace placeholder vignettes with case-study orbits
3. Add audio / "now playing" vignette tied to my music work
4. Polish scroll choreography (Lenis or GSAP ScrollTrigger)

If you're reading this on the in-world monitor: yes, the meta recursion is intentional.`
  }
];

export function findContentById(id) {
  return (
    bulletins.find((item) => item.id === id) ||
    blogs.find((item) => item.id === id) ||
    null
  );
}
