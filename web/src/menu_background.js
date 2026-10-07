const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class MenuBackground {
  constructor(container, count = 30) {
    this.container = container;
    if (!container) return;

    for (let index = 0; index < count; index++) {
      const letter = document.createElement("span");
      letter.className = "menu-rain-letter";
      letter.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      letter.style.setProperty("--x", `${Math.random() * 100}%`);
      letter.style.setProperty("--delay", `${-Math.random() * 12}s`);
      letter.style.setProperty("--duration", `${9 + Math.random() * 9}s`);
      letter.style.setProperty("--drift", `${-45 + Math.random() * 90}px`);
      letter.style.setProperty("--size", `${16 + Math.random() * 22}px`);
      container.appendChild(letter);
    }
  }
}