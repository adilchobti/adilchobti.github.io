// Year
const y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();

// Lightbox only if present
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");

if (lightbox && lightboxImg && lightboxCaption) {
  document.querySelectorAll(".chart img").forEach(img => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      lightboxImg.src = img.src;
      const cap = img.closest("figure")?.querySelector("figcaption")?.textContent || "";
      lightboxCaption.textContent = cap;
      lightbox.classList.add("active");
    });
  });

  lightbox.addEventListener("click", () => {
    lightbox.classList.remove("active");
    lightboxImg.src = "";
    lightboxCaption.textContent = "";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      lightbox.classList.remove("active");
      lightboxImg.src = "";
      lightboxCaption.textContent = "";
    }
  });
}
