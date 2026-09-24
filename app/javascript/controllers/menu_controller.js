import { Controller } from "@hotwired/stimulus"

// Het ...-menu sluit als je ernaast klikt of op Escape drukt.
export default class extends Controller {
  closeOutside(event) {
    if (!this.element.contains(event.target)) this.close()
  }

  close() {
    this.element.open = false
  }
}
