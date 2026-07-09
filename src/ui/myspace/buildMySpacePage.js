import {
  MYSPACE_PROFILE,
  topFriends,
  friendComments,
  blogs,
  findContentById
} from "../../content/myspace-content.js";

const ADMIN_LINKS = [
  "Edit Profile",
  "Account Settings",
  "Add/Edit Photos",
  "Add/Change Videos",
  "Manage Calendar",
  "Manage Blog",
  "Manage Address Book"
];

const VIEW_MY_LINKS = ["Profile", "Pics", "Videos", "Blog"];

const NAV_TABS = [
  "Home",
  "Browse",
  "Search",
  "Mail",
  "Blog",
  "Bulletins",
  "Forum",
  "Groups",
  "Favorites",
  "Invite"
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildChrome(firstName) {
  const nav = NAV_TABS.map(
    (tab) =>
      `<span class="ms-nav__item${tab === "Home" ? " is-active" : ""}">${escapeHtml(tab)}</span>`
  ).join('<span class="ms-nav__sep">|</span>');

  return `
      <header class="ms-header">
        <div class="ms-header__brand">
          <strong class="ms-header__logo">myspace</strong>
          <span class="ms-header__tag">a place for friends</span>
        </div>
        <form class="ms-header__search" action="#" onsubmit="return false">
          <label class="ms-header__search-label">Search:</label>
          <input class="ms-header__search-input" type="text" readonly tabindex="-1" />
          <button class="ms-header__search-btn" type="button" tabindex="-1">Go</button>
        </form>
        <nav class="ms-header__account" aria-label="Account">
          <a href="#" tabindex="-1">Help</a>
          <span>|</span>
          <a href="#" tabindex="-1">Login</a>
          <span>|</span>
          <a href="#" tabindex="-1">Signup</a>
        </nav>
      </header>
      <nav class="ms-nav" aria-label="Site">${nav}</nav>
    `;
}

function buildLeftColumn(firstName) {
  const interests = Object.entries(MYSPACE_PROFILE.interests)
    .map(
      ([key, value]) => `
        <div class="ms-interests__row">
          <div class="ms-interests__label">${escapeHtml(key)}</div>
          <div class="ms-interests__value">${escapeHtml(value)}</div>
        </div>`
    )
    .join("");

  const adminLinks = ADMIN_LINKS.map(
    (label) => `<span class="ms-contact__link">${escapeHtml(label)}</span>`
  ).join("");

  const viewLinks = VIEW_MY_LINKS.map((l) => escapeHtml(l)).join(" | ");

  return `
      <aside class="ms-col ms-col--left">
        <h1 class="ms-profile__name">${escapeHtml(firstName)}</h1>
        <div class="ms-profile__card">
          <img class="ms-profile__photo" src="${escapeHtml(MYSPACE_PROFILE.photo)}" alt="" width="120" height="102" />
          <ul class="ms-profile__meta">
            <li>${escapeHtml(MYSPACE_PROFILE.headline)}</li>
            <li>${escapeHtml(MYSPACE_PROFILE.location)}</li>
            <li>Status: ${escapeHtml(MYSPACE_PROFILE.status)}</li>
            <li>Hometown: ${escapeHtml(MYSPACE_PROFILE.hometown)}</li>
          </ul>
        </div>
        <p class="ms-profile__mood">Mood: ${escapeHtml(MYSPACE_PROFILE.mood)}</p>
        <p class="ms-profile__login">Last Login: ${escapeHtml(MYSPACE_PROFILE.lastLogin)}</p>
        <p class="ms-profile__view">View My: ${viewLinks}</p>

        <section class="ms-module ms-module--blue">
          <h2 class="ms-module__title">Contacting ${escapeHtml(firstName)}</h2>
          <div class="ms-contact__grid">${adminLinks}</div>
        </section>

        <section class="ms-module ms-module--blue">
          <h2 class="ms-module__title">MySpace URL</h2>
          <p class="ms-module__body"><a href="#" tabindex="-1">${escapeHtml(MYSPACE_PROFILE.url)}</a></p>
        </section>

        <section class="ms-module ms-module--blue">
          <h2 class="ms-module__title">${escapeHtml(firstName)}&apos;s Interests</h2>
          <div class="ms-interests">${interests}</div>
        </section>
      </aside>
    `;
}

/**
 * @param {string} firstName
 * @param {string | null} hoverId
 */
function buildDashboard(firstName, hoverId) {
  const blogRows = blogs
    .map(
      (item) => `
        <a class="ms-blog__link${hoverId === item.id ? " is-hover" : ""}" href="#" data-ms-link="${escapeHtml(item.id)}">
          <span class="ms-blog__title">${escapeHtml(item.title)}</span>
          <span class="ms-blog__meta">${escapeHtml(item.date)} — ${escapeHtml(item.preview)}</span>
        </a>`
    )
    .join("");

  const friendCells = topFriends
    .map((friend) => {
      const avatar = friend.photo
        ? `<img class="ms-friend__img" src="${escapeHtml(friend.photo)}" alt="" />`
        : `<span class="ms-friend__initials" style="background:${escapeHtml(friend.color)}">${escapeHtml(friend.initials)}</span>`;
      return `
          <div class="ms-friend">
            <span class="ms-friend__name">${escapeHtml(friend.name)}</span>
            ${avatar}
          </div>`;
    })
    .join("");

  const comments = friendComments
    .map(
      (c) => `
        <div class="ms-comment">
          <strong class="ms-comment__author">${escapeHtml(c.friend)}</strong>
          <p class="ms-comment__text">&ldquo;${escapeHtml(c.text)}&rdquo;</p>
        </div>`
    )
    .join("");

  return `
      ${buildChrome(firstName)}
      <div class="ms-body">
        ${buildLeftColumn(firstName)}
        <main class="ms-col ms-col--right">
          <h2 class="ms-section-title">${escapeHtml(firstName)}&apos;s Latest Blog Entries</h2>
          <div class="ms-blog">${blogRows}</div>

          <section class="ms-module ms-module--orange">
            <h2 class="ms-module__title">${escapeHtml(firstName)}&apos;s Blurbs</h2>
            <div class="ms-module__body">
              <h3 class="ms-blurb__label">About me:</h3>
              <p class="ms-blurb__text">${escapeHtml(MYSPACE_PROFILE.aboutMe)}</p>
              <h3 class="ms-blurb__label">Who I&apos;d like to meet:</h3>
              <p class="ms-blurb__text">${escapeHtml(MYSPACE_PROFILE.hereFor)}</p>
            </div>
          </section>

          <section class="ms-module ms-module--orange">
            <h2 class="ms-module__title">Dane&apos;s Friends</h2>
            <div class="ms-module__body">
              <p class="ms-friends__count">${escapeHtml(firstName)} has ${topFriends.length} friends.</p>
              <div class="ms-friends">${friendCells}</div>
            </div>
          </section>

          <section class="ms-module ms-module--blue">
            <h2 class="ms-module__title">Friend Comments</h2>
            <div class="ms-module__body ms-comments">${comments}</div>
          </section>
        </main>
      </div>
    `;
}

/** @param {{ title: string, date: string, body: string }} item */
function buildDetail(item, firstName) {
  return `
      ${buildChrome(firstName)}
      <div class="ms-body">
        ${buildLeftColumn(firstName)}
        <main class="ms-col ms-col--right">
          <article class="ms-detail">
            <a class="ms-detail__back" href="#" data-ms-link="__back">&larr; Back to Profile</a>
            <h2 class="ms-detail__title">${escapeHtml(item.title)}</h2>
            <p class="ms-detail__date">${escapeHtml(item.date)}</p>
            <div class="ms-detail__body">${escapeHtml(item.body)}</div>
          </article>
        </main>
      </div>
    `;
}

/**
 * Build MySpace profile HTML for the CRT capture viewport.
 * @param {{ view: "dashboard" | "detail", selectedId?: string | null, hoverId?: string | null }} options
 * @returns {string}
 */
export function buildMySpacePage({ view, selectedId = null, hoverId = null }) {
  const firstName = MYSPACE_PROFILE.name.split(" ")[0];
  const isDetail = view === "detail" && selectedId;
  const detail = isDetail ? findContentById(selectedId) : null;

  if (isDetail && detail) {
    return buildDetail(detail, firstName);
  }

  return buildDashboard(firstName, hoverId);
}
