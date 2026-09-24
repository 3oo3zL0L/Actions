import { Controller } from "@hotwired/stimulus"

// Enter zet op de lijst, Shift+Enter maakt een nieuwe regel. Het veld groeit mee met de tekst.
// N vanuit het niets springt naar het veld, net als de snelkoppeling op je beginscherm (/#capture_body).
export default class extends Controller {
  static targets = [ "input" ]

  connect() {
    if (this.inputTarget.id && location.hash === `#${this.inputTarget.id}`) this.inputTarget.focus()
  }

  submitOnEnter(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && this.inputTarget.value.trim()) {
      event.preventDefault()
      this.element.requestSubmit()
    }
  }

  shortcut(event) {
    if (event.key !== "n" || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.target.closest("input, textarea, select, [contenteditable]")) return

    event.preventDefault()
    this.inputTarget.focus()
  }

  grow() {
    this.inputTarget.style.height = "auto"
    this.inputTarget.style.height = `${Math.min(this.inputTarget.scrollHeight, 220)}px`
  }

  reset(event) {
    if (event.detail.success) {
      this.inputTarget.value = ""
      this.grow()
    }
  }
}
