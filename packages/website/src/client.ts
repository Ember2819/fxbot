// The site's only script. Every page reads fine without it: it adds the theme toggle, the copy buttons, and blobs
// whose eyes follow the pointer.
import "./site.css";

const root = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)");

// The toggle flips the theme the page shows. A choice that matches the system's is forgotten, so the page follows
// the system again.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
  button.hidden = false;
  button.addEventListener("click", () => {
    const shown = root.dataset.theme ?? (dark.matches ? "dark" : "light");
    const next = shown === "dark" ? "light" : "dark";
    const system = dark.matches ? "dark" : "light";
    if (next === system) delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === system) localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    const text = button.closest("[data-code]")?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ""));
      button.dataset.done = "";
      setTimeout(() => delete button.dataset.done, 1500);
    } catch {}
  });
}

// Each following blob looks toward the pointer and leans after it, as in the app. One update a frame, and none for
// blobs off the screen.
const blobs = [...document.querySelectorAll<SVGSVGElement>("svg.blob[data-follow]")];
let pointer: [number, number] | null = null;
let frame = 0;
const f = (n: number) => n.toFixed(1);
function look() {
  frame = 0;
  if (!pointer) return;
  const [x, y] = pointer;
  for (const svg of blobs) {
    const box = svg.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) continue;
    const [dx, dy] = [x - (box.left + box.width / 2), y - (box.top + box.height / 2)];
    const distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, distance / (box.width * 1.5));
    svg.querySelector(".blob-eyes")?.setAttribute("transform", `translate(${f((dx / distance) * 9 * reach)} ${f((dy / distance) * 7 * reach)})`);
    svg.querySelector(".blob-lean")?.setAttribute("transform", `rotate(${f((dx / distance) * 6 * reach)} 50 60)`);
  }
}
if (blobs.length) {
  addEventListener("pointermove", (event) => ((pointer = [event.clientX, event.clientY]), (frame ||= requestAnimationFrame(look))), { passive: true });
  addEventListener("scroll", () => (frame ||= requestAnimationFrame(look)), { passive: true });
}
