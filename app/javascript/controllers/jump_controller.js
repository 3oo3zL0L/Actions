import { Controller } from "@hotwired/stimulus"

// Een link naar een veld dat er ook meteen in zet, zodat het toetsenbord opent.
export default class extends Controller {
  focus(event) {
    const target = document.getElementById(this.element.hash.slice(1))
    if (!target) return

    event.preventDefault()
    target.scrollIntoView({ block: "center", behavior: "smooth" })
    target.focus({ preventScroll: true })
  }
}
