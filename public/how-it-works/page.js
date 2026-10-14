/* Lightweight, native motion. No procurement APIs are called by this page. */
(() => {
  "use strict";

  // Fixed event names and locations only: never form values or visitor identifiers.
  // Demo started is emitted only when a run actually begins.
  // Full explanation in 7.85s; no infinite loop.

  // Scroll work is coalesced in one RAF; layout reads precede all writes.

  // Subtle pointer-only magnetic buttons: never move touch targets.

  // Local deterministic demo. It has no network or message-sending operations.

  // Native details preserve keyboard semantics; CSS grid animates the answer.
  document.documentElement.classList.add("js");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) =>
        entry.target.classList.toggle("in-view", entry.isIntersecting),
      ),
    { threshold: 0.2 },
  ).observe($("#final"));


  const menuToggle = $(".menu-toggle");
  const menu = $("#mobile-menu");
  function closeMenu() {
    menu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }
  menuToggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
  });
  $$("a", menu).forEach((a) => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      closeMenu();
      menuToggle.focus();
    }
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", closeMenu);

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -25px 0px" },
  );
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  const hero = $("#hero-stage");
  const labels = [
    "رفع الكراسة",
    "قراءة البنود",
    "تحديد الموردين المناسبين",
    "إرسال طلبات التسعير بعد اختيارك",
    "وصول العروض",
    "المقارنة — والقرار لك",
  ];
  let heroStep = 0;
  let heroElapsed = 0;
  let heroVisible = true;
  let heroPaused = false;
  let heroFrame = 0;
  let heroPrevious = 0;
  let countFrame = 0;
  const durations = [950, 1100, 1300, 1000, 1400, 2100];
  const motionButton = $("#hero-motion");
  function countPrice() {
    cancelAnimationFrame(countFrame);
    const target = $("#hero-price");
    if (reduced.matches) {
      target.textContent = "10,760";
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / 650);
      target.textContent = Math.round(
        11950 - 1190 * (1 - Math.pow(1 - t, 3)),
      ).toLocaleString("en-US");
      if (t < 1) countFrame = requestAnimationFrame(tick);
    }
    countFrame = requestAnimationFrame(tick);
  }
  function setHeroStep(step) {
    heroStep = step;
    hero.dataset.stage = String(step);
    $("#hero-status").textContent = labels[step];
    $("#hero-count").textContent = `${String(step + 1).padStart(2, "0")} / 06`;
    $(".progress-track>span", hero).style.width = `${((step + 1) / 6) * 100}%`;
    if (step === 5) countPrice();
  }
  function heroTick(now) {
    heroFrame = 0;
    if (
      reduced.matches ||
      heroPaused ||
      !heroVisible ||
      document.hidden ||
      heroStep >= 5
    )
      return;
    if (heroPrevious) heroElapsed += Math.min(100, now - heroPrevious);
    heroPrevious = now;
    if (heroElapsed >= durations[heroStep]) {
      heroElapsed = 0;
      setHeroStep(heroStep + 1);
    }
    if (heroStep < 5) heroFrame = requestAnimationFrame(heroTick);
    else {
      motionButton.textContent = "أعد مشاهدة الرحلة ↻";
      motionButton.setAttribute("aria-label", "إعادة مشاهدة رحلة الطلب");
      motionButton.setAttribute("aria-pressed", "false");
    }
  }
  function syncHero() {
    cancelAnimationFrame(heroFrame);
    heroFrame = 0;
    heroPrevious = 0;
    if (reduced.matches) {
      setHeroStep(5);
      motionButton.hidden = true;
    } else {
      motionButton.hidden = false;
      if (!heroPaused && heroVisible && !document.hidden && heroStep < 5)
        heroFrame = requestAnimationFrame(heroTick);
    }
  }
  motionButton.addEventListener("click", () => {
    if (heroStep === 5) {
      heroElapsed = 0;
      heroPaused = false;
      setHeroStep(0);
      motionButton.textContent = "إيقاف الحركة Ⅱ";
      motionButton.setAttribute("aria-label", "إيقاف الحركة");
    } else {
      heroPaused = !heroPaused;
      motionButton.textContent = heroPaused
        ? "متابعة الحركة ▶"
        : "إيقاف الحركة Ⅱ";
      motionButton.setAttribute(
        "aria-label",
        heroPaused ? "متابعة الحركة" : "إيقاف الحركة",
      );
      motionButton.setAttribute("aria-pressed", String(heroPaused));
    }
    syncHero();
  });
  new IntersectionObserver(
    (entries) => {
      heroVisible = entries[0].isIntersecting;
      syncHero();
    },
    { threshold: 0.1 },
  ).observe(hero);
  document.addEventListener("visibilitychange", syncHero);
  const steps = $$(".story-step");
  const panels = $$(".story-panel");
  const screen = $("#story-screen");
  const chaos = $(".chaos-stage");
  const bottomCta = $("#bottom-cta");
  let storyActive = -1;
  let scrollFrame = 0;
  let chaosAssembly = -1;
  function updateScroll() {
    scrollFrame = 0;
    const viewport = window.innerHeight;
    const mobile = window.innerWidth <= 640;
    const rects = steps.map((step) => step.getBoundingClientRect());
    const chaosRect = chaos.getBoundingClientRect();
    const heroRect = $(".hero").getBoundingClientRect();
    const supplierRect = $("#suppliers").getBoundingClientRect();
    const finalRect = $("#final").getBoundingClientRect();
    const footerRect = $(".footer").getBoundingClientRect();
    const demoRect = $("#demo").getBoundingClientRect();
    const workflowRect = $("#workflow").getBoundingClientRect();
    const anchor = mobile
      ? Math.min(viewport - 70, viewport < 700 ? 460 : 540)
      : viewport * 0.52;
    let active = 0;
    rects.forEach((rect, index) => {
      if (rect.top <= anchor) active = index;
    });
    const assembly = reduced.matches
      ? 1
      : Math.max(
          0,
          Math.min(1, (viewport * 0.84 - chaosRect.top) / (viewport * 0.48)),
        );
    const showBottom =
      mobile &&
      heroRect.bottom < 50 &&
      supplierRect.top > viewport &&
      finalRect.top > viewport &&
      footerRect.top > viewport &&
      !(demoRect.top < viewport && demoRect.bottom > 0) &&
      !(workflowRect.top < viewport && workflowRect.bottom > 0) &&
      !$("#supplier-dialog").open;
    $("#navbar").classList.toggle("scrolled", window.scrollY > 28);
    bottomCta.hidden = !showBottom;
    if (active !== storyActive) {
      storyActive = active;
      screen.dataset.active = String(active);
      $("#mobile-story-number").textContent = $(
        ".step-number",
        steps[active],
      ).textContent;
      $("#mobile-story-title").textContent = $(
        "h3",
        steps[active],
      ).innerText.replace(/\s+/g, " ");
      $("#mobile-story-description").textContent = $(
        "p",
        steps[active],
      ).textContent;
      steps.forEach((step, index) =>
        step.classList.toggle("active", index === active),
      );
      panels.forEach((panel, index) => {
        panel.classList.toggle("visible", index === active);
        panel.inert = index !== active;
      });
      $$(".story-dots i").forEach((dot, index) =>
        dot.classList.toggle("active", index === active),
      );
      $("#story-counter").textContent = `${String(active + 1).padStart(
        2,
        "0",
      )} / 05`;
    }
    if (Math.abs(chaosAssembly - assembly) > 0.001) {
      chaosAssembly = assembly;
      chaos.style.setProperty("--assembly", assembly.toFixed(3));
    }
  }
  function scheduleScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }
  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleScroll, { passive: true });
  new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) =>
        entry.target.classList.toggle("in-view", entry.isIntersecting),
      ),
    { threshold: 0.25 },
  ).observe($("#suppliers"));
  $$(".magnetic").forEach((button) => {
    button.addEventListener(
      "pointermove",
      (event) => {
        if (reduced.matches || !finePointer.matches) return;
        const r = button.getBoundingClientRect();
        const x = (event.clientX - r.left - r.width / 2) * 0.045;
        const y = (event.clientY - r.top - r.height / 2) * 0.07;
        button.style.transform = `translate(${x}px,${y}px)`;
      },
      { passive: true },
    );
    button.addEventListener("pointerleave", () => {
      button.style.transform = "";
    });
    button.addEventListener("blur", () => {
      button.style.transform = "";
    });
  });
  const demoButton = $("#demo-start");
  const demoStatus = $("#demo-status");
  const activity = $("#demo-activity");
  const demoResults = $("#demo-results");
  const demoLabels = [
    "نحدد التخصص…",
    "وجدنا موردين مناسبين في المثال",
    "نحاكي إرسال طلب التسعير — بدون إرسال حقيقي",
    "3 عروض افتراضية وصلت. قارن واختر.",
  ];
  let demoRunning = false;
  let demoTimeout = 0;
  let demoStep = 0;
  function renderDemo(index) {
    demoStatus.textContent = demoLabels[index];
    $$("span", activity).forEach((el, i) =>
      el.classList.toggle("done", i <= index),
    );
  }
  function finishDemo() {
    clearTimeout(demoTimeout);
    renderDemo(3);
    demoResults.hidden = false;
    demoButton.hidden = true;
    demoRunning = false;
  }
  function advanceDemo() {
    if (!demoRunning) return;
    renderDemo(demoStep);
    if (demoStep === 3) {
      finishDemo();
      return;
    }
    demoStep += 1;
    demoTimeout = setTimeout(advanceDemo, 850);
  }
  demoButton.addEventListener("click", () => {
    if (demoRunning) return;
    demoRunning = true;
    demoStep = 0;
    demoResults.hidden = true;
    activity.hidden = false;
    demoButton.disabled = true;
    demoButton.textContent = "نشغّل التجربة التوضيحية…";
    if (reduced.matches) finishDemo();
    else advanceDemo();
  });
  $("#demo-reset").addEventListener("click", () => {
    clearTimeout(demoTimeout);
    demoRunning = false;
    demoStep = 0;
    demoResults.hidden = true;
    activity.hidden = true;
    demoButton.hidden = false;
    demoButton.disabled = false;
    demoButton.innerHTML =
      'ابدأ البحث عن الموردين <span aria-hidden="true">←</span>';
    demoStatus.textContent = "جاهز للتجربة — عروض وأسماء افتراضية.";
    demoButton.focus({ preventScroll: true });
  });
  $$(".faq-item").forEach((item) => {
    const summary = $("summary", item);
    let closeTimer = 0;
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      clearTimeout(closeTimer);
      if (item.classList.contains("is-open")) {
        item.classList.remove("is-open");
        if (reduced.matches) item.open = false;
        else
          closeTimer = setTimeout(() => {
            item.open = false;
          }, 360);
      } else {
        item.open = true;
        requestAnimationFrame(() => item.classList.add("is-open"));
      }
    });
  });

  const dialog = $("#supplier-dialog");
  const backgroundRoots = $$(".navbar, main, .footer, #bottom-cta, .skip");
  let dialogTrigger = null;
  $$("[data-supplier-open]").forEach((button) =>
    button.addEventListener("click", () => {
      dialogTrigger = button;
      dialog.showModal();
      backgroundRoots.forEach((root) => {
        root.inert = true;
        root.setAttribute("aria-hidden", "true");
      });
      document.body.classList.add("dialog-open");
      bottomCta.hidden = true;
      $("#supplier-form-status").textContent = "";
    }),
  );
  $(".dialog-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    backgroundRoots.forEach((root) => {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    });
    document.body.classList.remove("dialog-open");
    $("#supplier-form").reset();
    if (dialogTrigger) dialogTrigger.focus({ preventScroll: true });
    scheduleScroll();
  });
  $("#supplier-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = `طلب انضمام كمورد إلى فرق بناء\n\nاسم المنشأة: ${values.get("company")}\nالتخصصات والمواد: ${values.get("specialties")}\nالمدينة: ${values.get("city")}`;
    const mailto = `mailto:info@farq.sa?subject=${encodeURIComponent("طلب انضمام مورد — فرق بناء")}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    const status = $("#supplier-form-status");
    status.textContent =
      "إذا ما فتح تطبيق البريد، راسل info@farq.sa لطلب الانضمام. لم تُرسل الرسالة تلقائيًا.";
  });

  function onMotionChange() {
    cancelAnimationFrame(countFrame);
    if (reduced.matches && demoRunning) finishDemo();
    $$(".magnetic").forEach((button) => {
      button.style.transform = "";
    });
    syncHero();
    scheduleScroll();
  }
  reduced.addEventListener("change", onMotionChange);
  window.addEventListener("pagehide", () => {
    clearTimeout(demoTimeout);
    cancelAnimationFrame(heroFrame);
    cancelAnimationFrame(countFrame);
    cancelAnimationFrame(scrollFrame);
  });
  syncHero();
  scheduleScroll();
})();
