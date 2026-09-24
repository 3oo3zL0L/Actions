import { Controller } from "@hotwired/stimulus"

// Enter zet op de lijst, Shift+Enter maakt een nieuwe regel. Het veld groeit mee met de tekst.
export default class extends Controller {
  static targets = [ "input" ]

  submitOnEnter(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && this.inputTarget.value.trim()) {
      event.preventDefault()
      this.element.requestSubmit()
    }
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
