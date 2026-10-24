(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* 浏览器禁用存储时，页面照常工作 */
      }
    }
  };

  const session = {
    get(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        /* 忽略 */
      }
    }
  };

  /* ============================================================
     全局进度、页头与章节轨
     ============================================================ */

  const pageProgress = $("#pageProgress");
  const siteHeader = $("#siteHeader");

  function updatePageProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (pageProgress) pageProgress.style.width = `${ratio * 100}%`;
    if (siteHeader) siteHeader.classList.toggle("is-scrolled", window.scrollY > 48);
  }

  let progressFrame = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(() => {
        updatePageProgress();
        progressFrame = 0;
      });
    },
    { passive: true }
  );
  updatePageProgress();

  const railItems = $$(".rail-item");
  const chapters = $$("main > section[id]");
  if ("IntersectionObserver" in window && chapters.length) {
    const chapterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          railItems.forEach((item) => {
            const current = item.dataset.section === entry.target.id;
            item.classList.toggle("is-current", current);
            if (current) item.setAttribute("aria-current", "location");
            else item.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-42% 0px -50% 0px", threshold: 0 }
    );
    chapters.forEach((chapter) => chapterObserver.observe(chapter));
  }

  /* ============================================================
     声音：默认关闭，只使用浏览器合成音
     ============================================================ */

  let audioContext = null;
  let soundOn = storage.get("sysu-archive-sound") === "on";
  const soundToggle = $("#soundToggle");

  function updateSoundLabel() {
    if (!soundToggle) return;
    soundToggle.setAttribute("aria-pressed", String(soundOn));
    soundToggle.setAttribute("aria-label", soundOn ? "关闭声音" : "开启声音");
    const label = $(".tool-label", soundToggle);
    if (label) label.textContent = soundOn ? "静音" : "声音";
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function noiseBurst(duration = 0.16, frequency = 1400, volume = 0.035) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const fade = 1 - i / length;
      channel[i] = (Math.random() * 2 - 1) * fade;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  function playPaper() {
    if (!soundOn) return;
    noiseBurst(0.2, 1800, 0.026);
  }

  function playStamp() {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(96, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.24);
    noiseBurst(0.1, 900, 0.03);
  }

  if (soundToggle) {
    updateSoundLabel();
    soundToggle.addEventListener("click", () => {
      soundOn = !soundOn;
      storage.set("sysu-archive-sound", soundOn ? "on" : "off");
      updateSoundLabel();
      if (soundOn) {
        ensureAudio();
        playPaper();
      }
    });
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target.closest(
        ".action-primary, .dossier-card, .era-arrow, .card-generate"
      );
      if (!target) return;
      if (target.matches(".card-generate")) playStamp();
      else playPaper();
    },
    true
  );

  /* ============================================================
     开场：盖章、显影、跳过
     ============================================================ */

  const hero = $("#opening");
  const skipIntro = $("#skipIntro");
  const introVeil = $("#introVeil");
  const introStamp = $("#introStamp");
  const introInertTargets = $$("main, .site-header, .chapter-rail, .site-footer");
  const navigationType =
    performance.getEntriesByType("navigation")[0]?.type || "navigate";
  const returningFromPerson =
    (navigationType === "back_forward" &&
      (session.get("sysu-return-from-person") === "1" ||
        /\/people\//.test(document.referrer || ""))) ||
    (location.hash === "#roster" && session.get("sysu-return-from-person") === "1");
  if (hero) session.set("sysu-return-from-person", "0");
  let introTimers = [];

  function setIntroInert(value) {
    introInertTargets.forEach((target) => {
      target.inert = value;
    });
  }

  function finishIntro() {
    const wasVisible = introVeil?.classList.contains("is-visible");
    introTimers.forEach((timer) => window.clearTimeout(timer));
    introTimers = [];
    introVeil?.classList.remove("is-visible", "is-stamping", "is-leaving");
    document.body.classList.remove("intro-lock");
    setIntroInert(false);
    if (hero) {
      hero.classList.add("no-intro", "is-entered", "is-stamped");
    }
    if (skipIntro) skipIntro.hidden = true;
    if (wasVisible) {
      window.requestAnimationFrame(() => {
        $(".action-primary")?.focus({ preventScroll: true });
      });
    }
  }

  function playIntro() {
    if (!hero) return;
    introTimers.forEach((timer) => window.clearTimeout(timer));
    introTimers = [];
    hero.classList.remove("no-intro", "is-entered", "is-stamped");
    if (skipIntro) skipIntro.hidden = false;

    if (reducedMotion || !introVeil) {
      finishIntro();
      return;
    }

    introVeil.classList.remove("is-stamping", "is-leaving");
    introVeil.classList.add("is-visible");
    document.body.classList.add("intro-lock");
    setIntroInert(true);
    window.requestAnimationFrame(() => {
      introStamp?.focus({ preventScroll: true });
    });
  }

  function openArchive() {
    if (
      !introVeil ||
      !introVeil.classList.contains("is-visible") ||
      introVeil.classList.contains("is-stamping")
    ) {
      return;
    }
    if (reducedMotion) {
      finishIntro();
      return;
    }
    introVeil.classList.add("is-stamping");
    hero?.classList.add("is-entered");
    introTimers.push(
      window.setTimeout(() => {
        hero?.classList.add("is-stamped");
        playStamp();
      }, 300)
    );
    introTimers.push(
      window.setTimeout(() => introVeil.classList.add("is-leaving"), 1050)
    );
    introTimers.push(window.setTimeout(finishIntro, 1780));
  }

  if (hero) {
    if (returningFromPerson || location.hash === "#roster") finishIntro();
    else playIntro();
  }

  if (skipIntro) {
    skipIntro.addEventListener("click", () => {
      if (introVeil?.classList.contains("is-visible")) {
        if (reducedMotion) {
          finishIntro();
          return;
        }
        introVeil.classList.add("is-leaving");
        introTimers.forEach((timer) => window.clearTimeout(timer));
        introTimers = [];
        introTimers.push(window.setTimeout(finishIntro, 720));
      } else {
        finishIntro();
      }
    });
  }

  introStamp?.addEventListener("click", openArchive);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && introVeil?.classList.contains("is-visible")) {
      finishIntro();
    }
  });

  /* ============================================================
     照片显影
     ============================================================ */

  const developTargets = $$(".dossier-card, .era-person, .spirit-node");
  if ("IntersectionObserver" in window && developTargets.length) {
    const developObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-developed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    developTargets.forEach((target) => developObserver.observe(target));
  } else {
    developTargets.forEach((target) => target.classList.add("is-developed"));
  }

  /* ============================================================
     纸张接管转场
     ============================================================ */

  const takeovers = $$(".paper-takeover");
  if (!reducedMotion && "IntersectionObserver" in window && takeovers.length) {
    const takeoverObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.target.dataset.played === "1") return;
          entry.target.dataset.played = "1";
          entry.target.classList.add("is-running");
          window.setTimeout(() => entry.target.classList.remove("is-running"), 820);
        });
      },
      { threshold: 0.22 }
    );
    takeovers.forEach((takeover) => takeoverObserver.observe(takeover));
  }

  /* ============================================================
     名录筛选
     ============================================================ */

  const grid = $("#indexGrid");
  const cards = grid ? $$(".dossier-card", grid) : [];
  const roleButtons = $$("#roleFilters .chip");
  const keywordButtons = $$("#keywordFilters .chip");
  const mobileRoleFilter = $("#mobileRoleFilter");
  const mobileKeywordFilter = $("#mobileKeywordFilter");
  const searchInput = $("#rosterSearch");
  const filterCount = $("#filterCount");
  const emptyState = $("#emptyState");
  const resetFilters = $("#resetFilters");
  const archiveGap = $(".archive-gap");
  const viewButtons = $$(".view-switch button");
  const footprints = $("#footprints");
  const footprintList = $("#footprintList");
  const peopleData = Array.isArray(window.ARCHIVE_PEOPLE) ? window.ARCHIVE_PEOPLE : [];
  const filterState = { role: "all", keyword: "all", query: "", view: "cards" };
  // Share option values and filter state across the desktop buttons and mobile selects.
  [[mobileRoleFilter, roleButtons, "role"], [mobileKeywordFilter, keywordButtons, "keyword"]]
    .forEach(([select, buttons, key]) => {
      if (!select) return;
      select.replaceChildren(...buttons.map(button => {
        const option = document.createElement("option");
        option.value = button.dataset[key];
        option.textContent = button.textContent;
        return option;
      }));
      select.addEventListener("change", () => {
        filterState[key] = select.value;
        applyFilters();
      });
    });
  let filterTimer = 0;
  const dossierText = new Map(
    (Array.isArray(window.ARCHIVE_PEOPLE) ? window.ARCHIVE_PEOPLE : []).map((person) => {
      const bits = [
        person.name,
        person.dates,
        person.place,
        person.stageLabel,
        person.roleLabel,
        person.dept,
        person.years,
        person.anchorLabel,
        person.line,
        person.lede,
        person.quote && person.quote.text,
        ...(person.keywords || []),
        ...(person.sections || []).flatMap((section) => [section.title, ...(section.paras || [])]),
        ...(person.timeline || []).flatMap((item) => [item.year, item.text])
      ];
      return [person.id, bits.filter(Boolean).join(" ")];
    })
  );

  function normalized(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function alignSearchResults() {
    const filterBar = document.querySelector(".filter-bar");
    if (!filterBar) return;
    const header = document.querySelector(".site-header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const anchor = filterBar.previousElementSibling;
    let staticTop = filterBar.getBoundingClientRect().top + window.scrollY;
    if (anchor) {
      const margin = parseFloat(getComputedStyle(anchor).marginBottom) || 0;
      staticTop = anchor.getBoundingClientRect().bottom + margin + window.scrollY;
    }
    const desired = Math.max(0, staticTop - headerH);
    if (Math.abs(desired - window.scrollY) < 8) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, desired);
    root.style.scrollBehavior = previous;
  }

  function cardMatches(card) {
    const roleMatch = filterState.role === "all" || card.dataset.role === filterState.role;
    const keywords = normalized(card.dataset.keywords);
    const keywordMatch =
      filterState.keyword === "all" || keywords.includes(normalized(filterState.keyword));
    const haystack = normalized(
      [
        card.dataset.name,
        card.dataset.year,
        card.dataset.keywords,
        card.dataset.role,
        card.textContent,
        dossierText.get(card.dataset.person)
      ].join(" ")
    );
    const queryMatch = !filterState.query || haystack.includes(normalized(filterState.query));
    return roleMatch && keywordMatch && queryMatch;
  }

  function applyFilters({ animate = true } = {}) {
    if (!grid) return;
    window.clearTimeout(filterTimer);
    roleButtons.forEach(item => item.setAttribute("aria-pressed", String(item.dataset.role === filterState.role)));
    keywordButtons.forEach(item => item.setAttribute("aria-pressed", String(item.dataset.keyword === filterState.keyword)));
    [[mobileRoleFilter, "role"], [mobileKeywordFilter, "keyword"]].forEach(([select, key]) => {
      if (!select) return;
      select.value = filterState[key];
      select.classList.toggle("is-active", filterState[key] !== "all");
    });
    const matches = cards.filter(cardMatches);
    const anyFilter =
      filterState.role !== "all" || filterState.keyword !== "all" || filterState.query !== "";

    const update = () => {
      cards.forEach((card) => {
        const match = matches.includes(card);
        card.hidden = !match;
        card.classList.remove("card-enter");
      });
      if (archiveGap) archiveGap.hidden = anyFilter || matches.length === 0;
      if (emptyState) emptyState.hidden = matches.length !== 0 || !anyFilter;
      const footprintView = filterState.view === "footprints";
      grid.hidden = footprintView;
      if (footprints) footprints.hidden = !footprintView || matches.length === 0;
      renderFootprints(matches);
      if (filterCount) {
        filterCount.textContent = `${String(matches.length).padStart(2, "0")} 份档案`;
      }
      if (filterState.query) {
        void grid.offsetHeight;
        alignSearchResults();
        requestAnimationFrame(() => alignSearchResults());
      }
      if (animate && !reducedMotion && !footprintView) {
        matches.forEach((card, index) => {
          card.style.animationDelay = `${Math.min(index * 34, 210)}ms`;
          card.classList.add("card-enter");
          window.setTimeout(() => {
            card.classList.remove("card-enter");
            card.style.animationDelay = "";
          }, 420 + index * 34);
        });
      }
      grid.classList.remove("is-filtering");
    };

    if (animate && !reducedMotion && filterState.view === "cards") {
      grid.classList.add("is-filtering");
      filterTimer = window.setTimeout(update, 145);
    } else {
      update();
    }
  }

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterState.role = button.dataset.role;
      applyFilters();
    });
  });

  keywordButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.keyword;
      filterState.keyword = filterState.keyword === next && next !== "all" ? "all" : next;
      applyFilters();
    });
  });

  let searchTimer = 0;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        filterState.query = searchInput.value;
        applyFilters();
      }, 120);
    });
  }

  function resetAllFilters() {
    filterState.role = "all";
    filterState.keyword = "all";
    filterState.query = "";
    if (searchInput) searchInput.value = "";
    applyFilters();
  }

  if (resetFilters) resetFilters.addEventListener("click", resetAllFilters);

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterState.view = button.dataset.view;
      viewButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button))
      );
      applyFilters({ animate: false });
    });
  });

  /* 人物足迹与档案卡共用筛选结果；年份只决定排列顺序。 */
  function renderFootprints(matches) {
    if (!footprintList) return;
    const ids = new Set(matches.map(card => card.dataset.person));
    const people = peopleData.filter(person => ids.has(person.id))
      .sort((a, b) => Number(a.anchorYear) - Number(b.anchorYear) || a.no.localeCompare(b.no));
    const fragment = document.createDocumentFragment();
    people.forEach(person => {
      const item = document.createElement("li");
      item.className = "footprint-item";
      const link = document.createElement("a");
      link.className = "footprint-link";
      link.href = `people/${person.id}.html`;
      link.dataset.person = person.id;
      const time = document.createElement("time");
      time.className = "footprint-year";
      time.dateTime = String(person.anchorYear);
      time.textContent = person.anchorYear;
      const photo = document.createElement("img");
      photo.className = "footprint-photo";
      photo.src = person.image;
      photo.alt = "";
      photo.width = 64;
      photo.height = 80;
      photo.loading = "lazy";
      const copy = document.createElement("div");
      copy.className = "footprint-copy";
      const name = document.createElement("h4");
      name.textContent = person.name;
      const event = document.createElement("p");
      event.textContent = person.anchorLabel;
      const stage = document.createElement("span");
      stage.className = "footprint-stage";
      stage.textContent = person.stageLabel;
      const arrow = document.createElement("span");
      arrow.className = "footprint-arrow";
      arrow.textContent = "→";
      arrow.setAttribute("aria-hidden", "true");
      copy.append(name, event);
      link.append(time, photo, copy, stage, arrow);
      item.append(link);
      fragment.append(item);
    });
    footprintList.replaceChildren(fragment);
  }

  if (returningFromPerson && grid) {
    try {
      const saved = JSON.parse(session.get("sysu-roster-state") || "null");
      if (saved) {
        filterState.role = roleButtons.some(b => b.dataset.role === saved.role) ? saved.role : "all";
        filterState.keyword = keywordButtons.some(b => b.dataset.keyword === saved.keyword) ? saved.keyword : "all";
        filterState.query = typeof saved.query === "string" ? saved.query : "";
        filterState.view = saved.view === "footprints" ? "footprints" : "cards";
        if (searchInput) searchInput.value = filterState.query;
        viewButtons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === filterState.view)));
      }
    } catch { /* 忽略旧的或不可用的本地浏览状态。 */ }
  }
  applyFilters({ animate: false });

  /* ============================================================
     时代长卷
     ============================================================ */

  const eraTrack = $("#eraTrack");
  const eraPanels = eraTrack ? $$(".era-panel", eraTrack) : [];
  const eraPage = $("#eraPage");
  const eraPrev = $("#eraPrev");
  const eraNext = $("#eraNext");
  let eraIndex = 0;
  let eraTarget = null;
  let eraScrollEnd = 0;

  function setEraIndex(index, { scroll = false } = {}) {
    if (!eraPanels.length) return;
    const next = Math.max(0, Math.min(eraPanels.length - 1, index));
    if (scroll) {
      eraTarget = next;
      const left = Math.min(
        eraPanels[next].offsetLeft - eraPanels[0].offsetLeft,
        eraTrack.scrollWidth - eraTrack.clientWidth
      );
      eraTrack.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
      // Only deliberate navigation brings an off-screen heading back into view.
      // Horizontal swipes and resize synchronization keep the reader's vertical position.
      if (next !== eraIndex && window.matchMedia("(max-width: 760px)").matches) {
        const heading = $("h3", eraPanels[next]);
        const headerHeight = siteHeader?.getBoundingClientRect().height || 0;
        const rect = heading?.getBoundingClientRect();
        if (rect && (rect.top < headerHeight + 16 || rect.bottom > window.innerHeight - 16)) {
          window.scrollTo({
            top: Math.max(0, window.scrollY + rect.top - headerHeight - 16),
            behavior: reducedMotion ? "auto" : "smooth"
          });
        }
      }
      if (Math.abs(eraTrack.scrollLeft - left) < 1) {
        eraTarget = null;
        syncEraIndex();
      }
      return;
    }
    const changed = next !== eraIndex;
    eraIndex = next;
    const pageText = `${String(eraIndex + 1).padStart(2, "0")} / ${String(eraPanels.length).padStart(2, "0")}`;
    if (eraPage && eraPage.textContent !== pageText) eraPage.textContent = pageText;
    if (eraPrev) eraPrev.disabled = eraIndex === 0;
    if (eraNext) eraNext.disabled = eraIndex === eraPanels.length - 1;
    if (changed) playPaper();
  }

  function syncEraIndex() {
    if (!eraTrack || !eraPanels.length) return;
    const first = eraPanels[0].offsetLeft;
    let closest = 0;
    let distance = Infinity;
    eraPanels.forEach((panel, index) => {
      const left = Math.min(panel.offsetLeft - first, eraTrack.scrollWidth - eraTrack.clientWidth);
      const delta = Math.abs(left - eraTrack.scrollLeft);
      if (delta < distance) {
        distance = delta;
        closest = index;
      }
    });
    setEraIndex(closest);
  }

  if (eraTrack) {
    let eraFrame = 0;
    eraTrack.addEventListener(
      "scroll",
      () => {
        window.clearTimeout(eraScrollEnd);
        eraScrollEnd = window.setTimeout(() => { eraTarget = null; }, 150);
        if (eraFrame) return;
        eraFrame = window.requestAnimationFrame(() => {
          syncEraIndex();
          eraFrame = 0;
        });
      },
      { passive: true }
    );
    eraTrack.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setEraIndex((eraTarget ?? eraIndex) - 1, { scroll: true });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setEraIndex((eraTarget ?? eraIndex) + 1, { scroll: true });
      } else if (event.key === "Home") {
        event.preventDefault();
        setEraIndex(0, { scroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        setEraIndex(eraPanels.length - 1, { scroll: true });
      }
    });
  }

  eraPrev?.addEventListener("click", () => setEraIndex((eraTarget ?? eraIndex) - 1, { scroll: true }));
  eraNext?.addEventListener("click", () => setEraIndex((eraTarget ?? eraIndex) + 1, { scroll: true }));
  syncEraIndex();

  /* ============================================================
     精神图谱
     ============================================================ */

  const spiritMap = $("#spiritMap");
  const spiritLines = $("#spiritLines");
  const spiritButtons = $$(".keyword-btn");
  const spiritNodes = spiritMap ? $$(".spirit-node", spiritMap) : [];
  const spiritResultText = $("#spiritResultText");
  const spiritReset = $("#spiritReset");
  let activeSpirit = "";

  function renderSpiritLines(keyword) {
    if (!spiritMap || !spiritLines) return;
    spiritLines.replaceChildren();
    if (!keyword) return;
    const mapRect = spiritMap.getBoundingClientRect();
    const startY = mapRect.height / 2;
    spiritNodes.forEach((node) => {
      const keywords = node.dataset.keywords.split(/\s+/);
      if (!keywords.includes(keyword)) return;
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - mapRect.left;
      const y = rect.top + rect.height / 2 - mapRect.top;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M 0 ${startY} C ${x * 0.38} ${startY}, ${x * 0.62} ${y}, ${x} ${y}`);
      path.classList.add("is-match");
      spiritLines.append(path);
    });
  }

  function setSpirit(keyword) {
    activeSpirit = keyword === activeSpirit ? "" : keyword;
    spiritButtons.forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.spirit === activeSpirit))
    );
    spiritMap?.classList.toggle("has-active", Boolean(activeSpirit));
    const matches = [];
    spiritNodes.forEach((node) => {
      const keywords = node.dataset.keywords.split(/\s+/);
      const match = !activeSpirit || keywords.includes(activeSpirit);
      node.classList.toggle("is-match", Boolean(activeSpirit) && match);
      node.classList.toggle("is-dimmed", Boolean(activeSpirit) && !match);
      if (activeSpirit && match) matches.push(node.dataset.spiritPerson);
    });
    $$("#spiritMobileList a").forEach((link) => {
      const name = $(".ml-name", link)?.textContent;
      link.hidden = Boolean(activeSpirit) && !matches.includes(name);
    });
    if (spiritResultText) {
      spiritResultText.textContent = activeSpirit
        ? `与“${activeSpirit}”相连：${matches.join("、")}。`
        : "点左侧任意一个词，查看相连的人物。";
    }
    if (spiritReset) {
      spiritReset.textContent = activeSpirit ? "清除这条线索" : "回到全部档案";
    }
    renderSpiritLines(activeSpirit);
  }

  spiritButtons.forEach((button) => {
    button.addEventListener("click", () => setSpirit(button.dataset.spirit));
  });
  spiritReset?.addEventListener("click", (event) => {
    if (!activeSpirit) {
      resetAllFilters();
      return;
    }
    event.preventDefault();
    setSpirit(activeSpirit);
  });

  let spiritResize = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(spiritResize);
    spiritResize = window.setTimeout(() => {
      syncEraIndex();
      if (activeSpirit) renderSpiritLines(activeSpirit);
    }, 160);
  });

  /* ============================================================
     返回名录时保留滚动位置
     ============================================================ */

  document.addEventListener("click", (event) => {
    if (event.target.closest(".dossier-card, .footprint-link")) {
      session.set("sysu-roster-state", JSON.stringify(filterState));
      session.set("sysu-roster-scroll", String(window.scrollY));
      session.set("sysu-return-from-person", "1");
    }
  });

  if (returningFromPerson && grid) {
    const storedScroll = session.get("sysu-roster-scroll");
    const saved = Number(storedScroll);
    if (storedScroll !== null && Number.isFinite(saved) && saved >= 0) {
      window.addEventListener(
        "load",
        () => window.setTimeout(() => {
          const root = document.documentElement;
          const previous = root.style.scrollBehavior;
          root.style.scrollBehavior = "auto";
          window.scrollTo(0, saved);
          root.style.scrollBehavior = previous;
        }, 60),
        { once: true }
      );
    }
  }
})();
