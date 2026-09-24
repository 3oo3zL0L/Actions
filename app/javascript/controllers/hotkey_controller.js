import { Controller } from "@hotwired/stimulus"

// Druk op / of n om meteen een nieuwe actie te typen, waar je ook bent op de pagina.
export default class extends Controller {
  static targets = [ "input" ]

  focus(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || !["/", "n"].includes(event.key)) return
    if (event.target.closest("input, textarea, select, [contenteditable], dialog")) return

    event.preventDefault()
    this.inputTarget.focus()
    this.inputTarget.scrollIntoView({ block: "center", behavior: "smooth" })
  }
}
