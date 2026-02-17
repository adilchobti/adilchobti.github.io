document.getElementById("year").textContent = new Date().getFullYear();

/* Lightbox */

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");

document.querySelectorAll(".chart img").forEach(img => {
  img.addEventListener("click", () => {
    lightboxImg.src = img.src;
    lightboxCaption.textContent =
      img.closest("figure")?.querySelector("figcaption")?.textContent || "";
    lightbox.classList.add("active");
  });
});

lightbox?.addEventListener("click", () => {
  lightbox.classList.remove("active");
});
