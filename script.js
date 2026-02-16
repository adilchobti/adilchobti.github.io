// Card click (open repo) - but don't trigger if user clicks a link or an image
document.querySelectorAll(".card-clickable").forEach(card => {
  card.addEventListener("click", e => {
    if (e.target.closest("a") || e.target.closest("img")) return;
    const href = card.dataset.href;
    const target = card.dataset.target || "_self";
    if (href) window.open(href, target);
  });
});

// Lightbox: only runs on pages that contain #lightbox
const lightbox = document.getElementById("lightbox");
if (lightbox) {
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");

  document.querySelectorAll(".chart img").forEach(img => {
    img.addEventListener("click", e => {
      e.stopPropagation();
      lightboxImg.src = img.src;
      const cap = img.closest("figure")?.querySelector("figcaption")?.textContent || "";
      lightboxCaption.textContent = cap;
      lightbox.classList.add("active");
      lightbox.setAttribute("aria-hidden", "false");
    });
  });

  // click outside image to close
  lightbox.addEventListener("click", () => {
    lightbox.classList.remove("active");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.src = "";
  });

  // ESC to close
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && lightbox.classList.contains("active")) {
      lightbox.classList.remove("active");
      lightbox.setAttribute("aria-hidden", "true");
      lightboxImg.src = "";
    }
  });
}
