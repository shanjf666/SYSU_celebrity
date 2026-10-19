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

  function playTick() {
    if (!soundOn) return;
    noiseBurst(0.04, 2600, 0.012);
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
        ".action-primary, .dossier-card, .era-arrow, .era-dot, .card-generate"
      );
      if (!target) return;
      if (target.matches(".card-generate")) playStamp();
      else if (target.matches(".era-dot")) playTick();
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
    navigationType === "back_forward" &&
    (session.get("sysu-return-from-person") === "1" ||
      /\/people\//.test(document.referrer || ""));
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
    if (returningFromPerson) finishIntro();
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

  const replayIntro = $("#replayIntro");
  replayIntro?.addEventListener("click", () => {
    session.set("sysu-return-from-person", "0");
    playIntro();
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
  const searchInput = $("#rosterSearch");
  const filterCount = $("#filterCount");
  const emptyState = $("#emptyState");
  const resetFilters = $("#resetFilters");
  const archiveGap = $(".archive-gap");
  const viewButtons = $$(".view-switch button");
  const chronology = $("#chronology");
  const filterState = { role: "all", keyword: "all", query: "", view: "cards" };
  let filterTimer = 0;

  function normalized(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
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
        card.textContent
      ].join(" ")
    );
    const queryMatch = !filterState.query || haystack.includes(normalized(filterState.query));
    return roleMatch && keywordMatch && queryMatch;
  }

  function applyFilters({ animate = true } = {}) {
    if (!grid) return;
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
      if (filterCount) {
        filterCount.textContent = `${String(matches.length).padStart(2, "0")} 份档案`;
      }
      if (animate && !reducedMotion) {
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

    if (animate && !reducedMotion) {
      grid.classList.add("is-filtering");
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(update, 145);
    } else {
      update();
    }
  }

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterState.role = button.dataset.role;
      roleButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button))
      );
      applyFilters();
    });
  });

  keywordButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.keyword;
      filterState.keyword = filterState.keyword === next && next !== "all" ? "all" : next;
      keywordButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item.dataset.keyword === filterState.keyword))
      );
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
    roleButtons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item.dataset.role === "all"))
    );
    keywordButtons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item.dataset.keyword === "all"))
    );
    applyFilters();
  }

  if (resetFilters) resetFilters.addEventListener("click", resetAllFilters);

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterState.view = button.dataset.view;
      viewButtons.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button))
      );
      const yearView = filterState.view === "years";
      if (grid) grid.hidden = yearView;
      if (emptyState && yearView) emptyState.hidden = true;
      if (chronology) chronology.hidden = !yearView;
      if (yearView) {
        updateChronology(Number($("#yearScrubber")?.value || 1924));
        $("#yearScrubber")?.focus({ preventScroll: true });
      }
    });
  });

  /* ============================================================
     年代尺
     ============================================================ */

  const yearScrubber = $("#yearScrubber");
  const yearReadout = $("#yearReadout");
  const yearPeople = $("#yearPeople");
  const yearTicks = $$(".year-tick");
  const peopleData = Array.isArray(window.ARCHIVE_PEOPLE) ? window.ARCHIVE_PEOPLE : [];

  function setRangeProgress(year) {
    if (!yearScrubber) return;
    const min = Number(yearScrubber.min);
    const max = Number(yearScrubber.max);
    const ratio = max > min ? ((year - min) / (max - min)) * 100 : 0;
    yearScrubber.style.setProperty("--range-progress", `${ratio}%`);
    yearScrubber.setAttribute("aria-valuetext", `${year} 年`);
  }

  function updateChronology(year) {
    if (yearReadout) yearReadout.textContent = String(year);
    setRangeProgress(year);
    yearTicks.forEach((tick) => {
      const tickYear = Number(tick.dataset.year);
      tick.classList.toggle("is-past", tickYear <= year);
      tick.classList.toggle("is-current", tickYear === year);
    });
    if (!yearPeople) return;
    yearPeople.replaceChildren();
    const matches = peopleData.filter((person) => Number(person.anchorYear) === year);
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "year-empty";
      empty.textContent = "这一年暂未收录人物。可以试试 1924、1926、1927、1932、1933、1940。";
      yearPeople.append(empty);
      return;
    }
    matches.forEach((person) => {
      const link = document.createElement("a");
      link.className = "year-person";
      link.href = `people/${person.id}.html`;
      link.innerHTML = `
        <span class="yp-no">${person.no}</span>
        <span><span class="yp-name">${person.name}</span><span class="yp-label">${person.anchorYear} · ${person.anchorLabel}</span></span>
        <span class="yp-arrow" aria-hidden="true">→</span>
      `;
      yearPeople.append(link);
    });
  }

  if (yearScrubber) {
    yearScrubber.addEventListener("input", () => {
      const year = Number(yearScrubber.value);
      updateChronology(year);
    });
    yearScrubber.addEventListener("change", playTick);
    updateChronology(Number(yearScrubber.value));
  }

  yearTicks.forEach((tick) => {
    tick.addEventListener("click", () => {
      if (!yearScrubber) return;
      yearScrubber.value = tick.dataset.year;
      updateChronology(Number(tick.dataset.year));
      yearScrubber.focus({ preventScroll: true });
      playTick();
    });
  });

  /* ============================================================
     时代长卷
     ============================================================ */

  const eraTrack = $("#eraTrack");
  const eraPanels = eraTrack ? $$(".era-panel", eraTrack) : [];
  const eraDots = $$(".era-dot");
  let eraIndex = 0;

  function setEraIndex(index, { scroll = false } = {}) {
    if (!eraPanels.length) return;
    const next = Math.max(0, Math.min(eraPanels.length - 1, index));
    const changed = next !== eraIndex;
    eraIndex = next;
    eraDots.forEach((dot) =>
      dot.setAttribute("aria-current", String(Number(dot.dataset.slide) === eraIndex))
    );
    if (scroll) {
      const first = eraPanels[0];
      const left = eraPanels[eraIndex].offsetLeft - first.offsetLeft;
      eraTrack.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
    }
    if (changed) playPaper();
  }

  function syncEraIndex() {
    if (!eraTrack || !eraPanels.length) return;
    const first = eraPanels[0].offsetLeft;
    let closest = 0;
    let distance = Infinity;
    eraPanels.forEach((panel, index) => {
      const delta = Math.abs(panel.offsetLeft - first - eraTrack.scrollLeft);
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
        setEraIndex(eraIndex - 1, { scroll: true });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setEraIndex(eraIndex + 1, { scroll: true });
      } else if (event.key === "Home") {
        event.preventDefault();
        setEraIndex(0, { scroll: true });
      } else if (event.key === "End") {
        event.preventDefault();
        setEraIndex(eraPanels.length - 1, { scroll: true });
      }
    });
  }

  $("#eraPrev")?.addEventListener("click", () => setEraIndex(eraIndex - 1, { scroll: true }));
  $("#eraNext")?.addEventListener("click", () => setEraIndex(eraIndex + 1, { scroll: true }));
  eraDots.forEach((dot) => {
    dot.addEventListener("click", () =>
      setEraIndex(Number(dot.dataset.slide), { scroll: true })
    );
  });

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
    if (!activeSpirit) return;
    event.preventDefault();
    setSpirit(activeSpirit);
  });

  let spiritResize = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(spiritResize);
    spiritResize = window.setTimeout(() => {
      if (activeSpirit) renderSpiritLines(activeSpirit);
    }, 160);
  });

  /* ============================================================
     返回名录时保留滚动位置
     ============================================================ */

  $$(".dossier-card").forEach((card) => {
    card.addEventListener("click", () => {
      session.set("sysu-roster-scroll", String(window.scrollY));
      session.set("sysu-return-from-person", "1");
    });
  });

  if (
    location.hash === "#roster" &&
    performance.getEntriesByType("navigation")[0]?.type === "back_forward"
  ) {
    const saved = Number(session.get("sysu-roster-scroll"));
    if (Number.isFinite(saved) && saved > 0) {
      window.addEventListener(
        "load",
        () => window.setTimeout(() => window.scrollTo(0, saved), 60),
        { once: true }
      );
    }
  }
})();
