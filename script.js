document.getElementById("year")?.textContent = new Date().getFullYear();

/* Fade in */
const els = document.querySelectorAll(".reveal");

const obs = new IntersectionObserver((entries)=>{
entries.forEach(entry=>{
if(entry.isIntersecting){
entry.target.classList.add("is-visible");
}
});
},{threshold:0.15});

els.forEach(el=>obs.observe(el));

/* Lightbox */
const lightbox=document.getElementById("lightbox");
const lightboxImg=document.getElementById("lightbox-img");
const lightboxCaption=document.getElementById("lightbox-caption");

document.querySelectorAll(".chart img").forEach(img=>{
img.addEventListener("click",()=>{
lightboxImg.src=img.src;
lightboxCaption.textContent=img.nextElementSibling?.textContent || "";
lightbox.classList.add("active");
});
});

lightbox?.addEventListener("click",()=>{
lightbox.classList.remove("active");
});
