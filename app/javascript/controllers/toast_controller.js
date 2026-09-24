import { Controller } from "@hotwired/stimulus"

// Meldingen komen onderin even langs en gaan vanzelf weer weg. Tik erop om ze meteen weg te halen.
export default class extends Controller {
  connect() {
    this.element.addEventListener("click", () => this.dismiss())
    this.timer = setTimeout(() => this.dismiss(), this.element.classList.contains("toast--alert") ? 8000 : 4000)
  }

  disconnect() {
    clearTimeout(this.timer)
  }

  dismiss() {
    this.element.classList.add("toast--leaving")
    setTimeout(() => this.element.remove(), 200)
  }
}
