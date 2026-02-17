// Année footer
document.getElementById("year")?.textContent = new Date().getFullYear();

/* =========================
   Fade-in on scroll (safe)
   ========================= */
(() => {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  // Si le navigateur ne supporte pas IntersectionObserver → on affiche tout
  if (!("IntersectionObserver" in window)) {
    els.forEach(el => el.classList.add("is-visible"));
    return;
  }

  // Respect reduce motion
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    els.forEach(el => el.classList.add("is-visible"));
    return;
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target); // important
      }
    });
  }, { threshold: 0.15 });

  els.forEach(el => obs.observe(el));
})();

/* =========================
   Lightbox (only if present)
   ========================= */
(() => {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");

  // Si la lightbox n'existe pas sur la page → on ne fait rien
  if (!lightbox || !lightboxImg || !lightboxCaption) return;

  document.querySelectorAll(".chart img").forEach(img => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxImg.src = img.src;

      const cap = img.closest("figure")?.querySelector("figcaption")?.textContent || "";
      lightboxCaption.textContent = cap;

      lightbox.classList.add("active");
    });
  });

  // Fermer en cliquant à côté
  lightbox.addEventListener("click", () => {
    lightbox.classList.remove("active");
    lightboxImg.src = "";
    lightboxCaption.textContent = "";
  });

  // Fermer avec Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      lightbox.classList.remove("active");
      lightboxImg.src = "";
      lightboxCaption.textContent = "";
    }
  });
})();
