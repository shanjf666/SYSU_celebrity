(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  /* ============================================================
     字号
     ============================================================ */

  const sizes = [1.0625, 1.1875, 1.3125, 1.4375];
  const sizeDown = $("#sizeDown");
  const sizeUp = $("#sizeUp");
  const sizeReadout = $("#sizeReadout");
  let sizeIndex = 1;

  try {
    const saved = Number(localStorage.getItem("sysu-reader-size"));
    if (Number.isInteger(saved) && saved >= 0 && saved < sizes.length) sizeIndex = saved;
  } catch {
    /* 忽略 */
  }

  function applySize() {
    const value = sizes[sizeIndex];
    document.documentElement.style.setProperty("--reader-size", `${value}rem`);
    document.documentElement.style.setProperty(
      "--reader-leading",
      String(1.97 - sizeIndex * 0.025)
    );
    if (sizeReadout) sizeReadout.textContent = `${Math.round(value * 16)} px`;
    if (sizeDown) sizeDown.disabled = sizeIndex === 0;
    if (sizeUp) sizeUp.disabled = sizeIndex === sizes.length - 1;
    try {
      localStorage.setItem("sysu-reader-size", String(sizeIndex));
    } catch {
      /* 忽略 */
    }
  }

  sizeDown?.addEventListener("click", () => {
    sizeIndex = Math.max(0, sizeIndex - 1);
    applySize();
  });
  sizeUp?.addEventListener("click", () => {
    sizeIndex = Math.min(sizes.length - 1, sizeIndex + 1);
    applySize();
  });
  applySize();

  /* ============================================================
     阅读进度
     ============================================================ */

  const progress = $("#readerProgress");
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (progress) progress.style.width = `${ratio * 100}%`;
  }

  let frame = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        updateProgress();
        frame = 0;
      });
    },
    { passive: true }
  );
  updateProgress();

  /* ============================================================
     目录定位
     ============================================================ */

  const sections = $$(".article-section[id]");
  const contentsLinks = $$(".contents-list a");
  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          contentsLinks.forEach((link) => {
            link.classList.toggle("is-current", link.hash === `#${entry.target.id}`);
          });
        });
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  }

  /* ============================================================
     脚注：原位展开，可返回
     ============================================================ */

  $$(".fn-ref").forEach((ref) => {
    ref.setAttribute("aria-expanded", "false");
    ref.addEventListener("click", (event) => {
      const id = ref.dataset.fn;
      const note = id ? document.getElementById(id) : null;
      if (!note) return;
      event.preventDefault();
      const paragraph = ref.closest("p");
      if (paragraph && note.parentElement !== paragraph.parentElement) {
        paragraph.after(note);
      }
      const willOpen = note.hidden;
      note.hidden = !willOpen;
      ref.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        const close = $(".fn-close", note);
        close?.focus({ preventScroll: true });
      } else {
        ref.focus({ preventScroll: true });
      }
    });
  });

  $$(".fn-close").forEach((button) => {
    button.addEventListener("click", () => {
      const note = button.closest(".fn-inline");
      if (!note) return;
      note.hidden = true;
      const id = note.id;
      const ref = $(`.fn-ref[data-fn="${id}"]`);
      ref?.setAttribute("aria-expanded", "false");
      ref?.focus({ preventScroll: true });
    });
  });

  /* ============================================================
     图片查看
     ============================================================ */

  const lightbox = $("#lightbox");
  const lightboxImage = $("#lightboxImage");
  const lightboxCaption = $("#lightboxCaption");
  const lightboxMeta = $("#lightboxMeta");
  const lightboxClose = $("#lightboxClose");
  let lastFocus = null;

  function openLightbox(image) {
    if (!lightbox || !lightboxImage) return;
    lastFocus = document.activeElement;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "";
    if (lightboxCaption) {
      lightboxCaption.textContent = image.dataset.caption || image.alt || "人物影像";
    }
    if (lightboxMeta) {
      lightboxMeta.textContent = image.dataset.meta || "影像待补 · 示意";
    }
    lightbox.hidden = false;
    document.body.classList.add("is-locked");
    lightboxClose?.focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.classList.remove("is-locked");
    lastFocus?.focus?.({ preventScroll: true });
  }

  $$(".zoomable").forEach((image) => {
    image.addEventListener("click", () => openLightbox(image));
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(image);
      }
    });
  });

  lightboxClose?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox && !lightbox.hidden) {
      closeLightbox();
    }
  });

  /* ============================================================
     返回名录：从名录来的回到原滚动位置
     ============================================================ */

  const back = $("#backToIndex");
  back?.addEventListener("click", (event) => {
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (
        referrer &&
        referrer.origin === location.origin &&
        /(?:\/|\/index\.html?)$/.test(referrer.pathname) &&
        history.length > 1
      ) {
        event.preventDefault();
        history.back();
      }
    } catch {
      /* 使用普通链接 */
    }
  });
})();
