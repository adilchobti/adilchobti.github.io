// Dynamic footer year
const yearNode = document.getElementById("year");
if (yearNode) yearNode.textContent = new Date().getFullYear();

// Progressive reveal, with a no-JS-friendly fallback.
const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach(item => revealObserver.observe(item));
} else {
  revealItems.forEach(item => item.classList.add("is-visible"));
}

// Pause the moving focus ticker when the page is not visible.
document.addEventListener("visibilitychange", () => {
  const ticker = document.querySelector(".ticker-track");
  if (ticker) ticker.style.animationPlayState = document.hidden ? "paused" : "running";
});
