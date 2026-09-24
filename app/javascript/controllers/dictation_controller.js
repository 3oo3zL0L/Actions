import { Controller } from "@hotwired/stimulus"

// Inspreken. Waar de browser zelf kan luisteren (Chrome, Safari) doen we dat in het Nederlands.
// Anders openen we het toetsenbord en wijzen we de dicteerknop van de telefoon aan.
// Hoe dan ook wordt de tekst als ingesproken verstuurd, zodat Claude hem in losse acties splitst.
export default class extends Controller {
  static targets = [ "input", "spoken", "button", "tip" ]

  disconnect() {
    this.recognition?.abort()
  }

  toggle() {
    this.inputTarget.focus()

    if (this.listening) {
      this.stop()
    } else {
      this.start()
    }
  }

  start() {
    this.listening = true
    this.spokenTarget.value = "true"
    this.buttonTarget.setAttribute("aria-pressed", "true")

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (Recognition) {
      this.listen(new Recognition())
    } else {
      this.showTip()
    }
  }

  stop() {
    this.listening = false
    this.recognition?.stop()
    this.buttonTarget.setAttribute("aria-pressed", "false")
    this.tipTarget.hidden = true
  }

  reset() {
    this.stop()
    this.spokenTarget.value = "false"
  }

  listen(recognition) {
    const before = this.inputTarget.value.trim()

    recognition.lang = "nl-NL"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const heard = Array.from(event.results, (result) => result[0].transcript).join(" ")
      this.inputTarget.value = [ before, heard ].filter(Boolean).join(" ")
      this.inputTarget.dispatchEvent(new Event("input"))
    }
    recognition.onerror = () => this.showTip()
    recognition.onend = () => { if (this.listening) this.stop() }
    recognition.start()

    this.recognition = recognition
  }

  showTip() {
    this.tipTarget.innerHTML = this.tipText
    this.tipTarget.hidden = false
  }

  get tipText() {
    const agent = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(agent)) return "Tik op de <b>microfoon rechtsonder op je toetsenbord</b> en praat. Klaar? Tik op <b>Op de lijst</b>."
    if (/Android/.test(agent)) return "Tik op de <b>microfoon op je toetsenbord</b> en praat. Klaar? Tik op <b>Op de lijst</b>."
    if (/Mac/.test(agent)) return "Druk twee keer op <b>fn</b> en praat. Klaar? Druk op <b>Enter</b>."
    if (/Windows/.test(agent)) return "Druk op <b>Windows + H</b> en praat. Klaar? Druk op <b>Enter</b>."
    return "Start het dicteren van je toetsenbord en praat. Klaar? Druk op <b>Enter</b>."
  }
}
