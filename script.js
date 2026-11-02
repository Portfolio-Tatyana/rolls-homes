// КОНТАКТЫ: укажите e-mail компании, чтобы включить отправку заявок.
const CONTACT_EMAIL = "";

// ВИДЕО: muted + без loop; событие ended оставляет последний кадр на экране.
const hero = document.querySelector("[data-hero]");
const video = document.querySelector("[data-video]");
if (hero && video) {
  video.muted = true;
  video.volume = 0;
  video.loop = false;
  video.controls = false;
  video.addEventListener("playing", () => hero.classList.add("video-ready"), { once: true });
  video.addEventListener("ended", () => { video.pause(); hero.classList.add("video-ended"); });
  video.addEventListener("error", () => hero.classList.remove("video-ready"));
}

// ШАПКА: фиксированное состояние и полоска прогресса прокрутки.
const header = document.querySelector("[data-header]");
const setHeader = () => {
  header?.classList.toggle("scrolled", window.scrollY > 28);
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  header?.style.setProperty("--read-progress", `${maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0}%`);
};
setHeader();
window.addEventListener("scroll", setHeader, { passive: true });

// БУРГЕР: открытие/закрытие 3D-панели, фон, Esc и ссылки.
const menu = document.querySelector("[data-menu]");
const nav = document.querySelector("[data-nav]");
const closeMenu = () => {
  nav?.classList.remove("open");
  menu?.setAttribute("aria-expanded", "false");
  menu?.setAttribute("aria-label", "Открыть меню");
  header?.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
};
menu?.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  nav?.classList.toggle("open", open);
  header?.classList.toggle("menu-open", open);
  document.body.classList.toggle("menu-open", open);
});
nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
document.querySelector("[data-backdrop]")?.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
window.addEventListener("resize", () => { if (window.innerWidth > 740) closeMenu(); });

// ПОЯВЛЕНИЕ СЕКЦИЙ: запускается, когда блок попадает в область просмотра.
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries, obs) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("visible"); obs.unobserve(entry.target); }
  }), { threshold: .12, rootMargin: "0px 0px -30px 0px" });
  reveals.forEach((el) => observer.observe(el));
} else reveals.forEach((el) => el.classList.add("visible"));

// ФОТО: успешная загрузка перекрывает SVG; если файла нет, остаётся иллюстрация.
document.querySelectorAll("[data-photo]").forEach((photo) => {
  const revealPhoto = () => {
    if (photo.naturalWidth > 0) {
      photo.classList.add("ready");
      photo.closest(".card-art")?.classList.add("has-photo");
    }
  };
  if (photo.complete) revealPhoto();
  else photo.addEventListener("load", revealPhoto, { once: true });
});
// КАТАЛОГ: категория data-kind карточки совпадает с data-filter кнопки.
const filters = document.querySelectorAll("[data-filter]");
const cards = document.querySelectorAll("[data-card]");
const updateFilterCounts = () => filters.forEach((button) => {
  const count = button.dataset.filter === "all"
    ? cards.length
    : [...cards].filter((card) => card.dataset.kind === button.dataset.filter).length;
  const badge = button.querySelector("small");
  if (badge) badge.textContent = String(count).padStart(2, "0");
});
updateFilterCounts();
filters.forEach((button) => button.addEventListener("click", () => {
  filters.forEach((item) => item.classList.toggle("active", item === button));
  cards.forEach((card) => card.classList.toggle("hidden", button.dataset.filter !== "all" && card.dataset.kind !== button.dataset.filter));
}));

const dialog = document.querySelector("[data-dialog]");
const dialogTitle = document.querySelector("[data-title]");
const dialogInfo = document.querySelector("[data-info]");
const showDetails = (card) => {
  if (!dialog) return;
  dialogTitle.textContent = card.dataset.title || "Объект Rolls Homes";
  dialogInfo.textContent = card.dataset.info || "Расскажите нам, что ищете, и мы подберём подходящий формат.";
  dialog.showModal();
};
cards.forEach((card) => {
  card.querySelector(".card-art")?.addEventListener("click", () => showDetails(card));
  card.querySelector(".round")?.addEventListener("click", () => showDetails(card));
});
document.querySelector("[data-close]")?.addEventListener("click", () => dialog?.close());
document.querySelector("[data-dialog-link]")?.addEventListener("click", () => dialog?.close());
dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

const compare = document.querySelector("[data-compare]");
document.querySelector("[data-range]")?.addEventListener("input", (event) => compare?.style.setProperty("--split", `${event.target.value}%`));

if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.querySelectorAll("[data-tilt], .card, .service").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      card.style.setProperty("--px", `${(x + .5) * 100}%`);
      card.style.setProperty("--py", `${(y + .5) * 100}%`);
      card.style.transform = `perspective(950px) rotateX(${y * -4}deg) rotateY(${x * 4}deg) translateZ(5px)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

// 3D-МОДЕЛЬ: мышь/касание или стрелки клавиатуры меняют угол поворота.
const orbit = document.querySelector("[data-orbit]");
const model = document.querySelector("[data-model]");
if (orbit && model) {
  let dragging = false, lastX = 0, lastY = 0, rx = -25, ry = 42;
  const paint = () => { model.style.setProperty("--rx", `${rx}deg`); model.style.setProperty("--ry", `${ry}deg`); };
  orbit.addEventListener("pointerdown", (event) => {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    orbit.classList.add("dragging"); orbit.setPointerCapture(event.pointerId);
  });
  orbit.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    ry += (event.clientX - lastX) * .45;
    rx = Math.max(-60, Math.min(8, rx - (event.clientY - lastY) * .25));
    lastX = event.clientX; lastY = event.clientY; paint();
  });
  const stop = () => { dragging = false; orbit.classList.remove("dragging"); };
  orbit.addEventListener("pointerup", stop);
  orbit.addEventListener("pointercancel", stop);
  orbit.addEventListener("keydown", (event) => {
    const amount = event.shiftKey ? 18 : 8;
    if (event.key === "ArrowLeft") ry -= amount;
    else if (event.key === "ArrowRight") ry += amount;
    else if (event.key === "ArrowUp") rx = Math.min(8, rx + amount);
    else if (event.key === "ArrowDown") rx = Math.max(-60, rx - amount);
    else return;
    event.preventDefault(); paint();
  });
}

let toastTimer;
const toast = document.querySelector("[data-toast]");
const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 5000);
};
document.querySelector("[data-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!CONTACT_EMAIL) { showToast("Добавьте e-mail команды в начале script.js, чтобы подключить отправку заявок."); return; }
  const data = new FormData(event.currentTarget);
  const subject = encodeURIComponent(`Заявка с сайта Rolls Homes — ${data.get("topic")}`);
  const body = encodeURIComponent(`Имя: ${data.get("name")}\nТелефон: ${data.get("phone")}\nИнтересует: ${data.get("topic")}`);
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
});
document.querySelector("[data-year]").textContent = new Date().getFullYear();


