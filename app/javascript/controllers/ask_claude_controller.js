import { Controller } from "@hotwired/stimulus"

// Vraag Claude: kies wat Claude moet doen, pas de prompt aan en trap hem af in Cowork, Chat of Code.
// Desktop opent via claude://, de telefoon via de universele links van claude.ai. De prompt gaat altijd
// ook naar het klembord, zodat er nooit iets verloren gaat als een app niet opent.
const DESTINATIONS = {
  cowork: { label: "Open in Cowork", url: (q) => `claude://cowork/new?q=${q}` },
  chat: { label: "Open in Chat", url: (q) => `claude://claude.ai/new?q=${q}`, mobile: () => "https://claude.ai/new" },
  code: { label: "Open in Code", url: (q) => `https://claude.ai/code/new?q=${q}` }
}

export default class extends Controller {
  static targets = [ "dialog", "title", "intents", "prompt", "destination", "launchLabel", "copyButton", "fallback", "chatNote" ]
  static values = { intents: Object }

  open({ params: { kind, title, brief } }) {
    this.kind = kind
    this.brief = brief
    this.titleTarget.textContent = title
    this.fallbackTarget.hidden = true

    this.adaptToDevice()
    this.renderIntents()
    this.restoreDestination()

    this.dialogTarget.showModal()
    this.promptTarget.focus()
    this.promptTarget.setSelectionRange(0, 0)
    this.promptTarget.scrollTop = 0
  }

  close() {
    this.dialogTarget.close()
  }

  closeOnBackdrop(event) {
    if (event.target === this.dialogTarget) this.close()
  }

  reset() {
    clearTimeout(this.fallbackTimer)
    window.removeEventListener("blur", this.onBlur)
  }

  chooseIntent(event) {
    this.selectIntent(event.currentTarget.dataset.intent)
  }

  chooseDestination() {
    this.launchLabelTarget.textContent = DESTINATIONS[this.destination].label
    remember("ask-claude:destination", this.destination)
  }

  async copy() {
    await this.writeClipboard()
    this.flashCopied()
  }

  async launch(event) {
    event.preventDefault()

    const prompt = this.promptTarget.value.trim()
    if (!prompt) return this.promptTarget.focus()

    await this.writeClipboard()

    const destination = DESTINATIONS[this.destination]
    const url = this.isMobile && destination.mobile ? destination.mobile() : destination.url(encodeURIComponent(prompt))

    if (url.startsWith("claude://")) {
      this.openAppLink(url)
    } else {
      window.open(url, "_blank", "noopener")
      this.done()
    }
  }

  // Een claude://-link opent de desktop-app en haalt de focus weg. Gebeurt dat niet, dan is er geen app.
  openAppLink(url) {
    this.onBlur = () => { clearTimeout(this.fallbackTimer); this.done() }
    window.addEventListener("blur", this.onBlur, { once: true })
    this.fallbackTimer = setTimeout(() => {
      window.removeEventListener("blur", this.onBlur)
      this.fallbackTarget.hidden = false
    }, 1500)

    window.location.href = url
  }

  done() {
    this.close()
    toast(`Gestart in ${this.destination === "cowork" ? "Cowork" : this.destination === "chat" ? "Chat" : "Code"}. Prompt staat ook op je klembord.`)
  }

  renderIntents() {
    const intents = Object.keys(this.intentsValue[this.kind] || {})
    this.intentsTarget.replaceChildren(...intents.map((intent) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "segment"
      button.textContent = intent
      button.dataset.intent = intent
      button.dataset.action = "ask-claude#chooseIntent keydown->ask-claude#navigateIntents"
      button.setAttribute("role", "radio")
      return button
    }))

    const last = recall(`ask-claude:intent:${this.kind}`)
    this.selectIntent(intents.includes(last) ? last : intents[0])
  }

  navigateIntents(event) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return

    event.preventDefault()
    const buttons = [ ...this.intentsTarget.children ]
    const next = buttons[(buttons.indexOf(event.currentTarget) + step + buttons.length) % buttons.length]
    this.selectIntent(next.dataset.intent)
    next.focus()
  }

  selectIntent(intent) {
    for (const button of this.intentsTarget.children) {
      const selected = button.dataset.intent === intent
      button.setAttribute("aria-checked", selected)
      button.tabIndex = selected ? 0 : -1
    }

    this.promptTarget.value = `${this.intentsValue[this.kind][intent]}\n\n${this.brief}`
    remember(`ask-claude:intent:${this.kind}`, intent)
  }

  restoreDestination() {
    const available = this.destinationTargets.filter((input) => !input.closest("[hidden]"))
    const saved = available.find((input) => input.value === recall("ask-claude:destination"))
    ;(saved || available[0]).checked = true
    this.chooseDestination()
  }

  adaptToDevice() {
    this.isMobile = matchMedia("(hover: none), (pointer: coarse)").matches && !matchMedia("(min-width: 900px)").matches
    for (const label of this.dialogTarget.querySelectorAll("[data-desktop-only]")) label.hidden = this.isMobile
    this.chatNoteTarget.textContent = this.isMobile ? "Opent de app, plak de prompt" : "Nieuw gesprek in de desktop-app"
  }

  async writeClipboard() {
    try {
      await navigator.clipboard.writeText(this.promptTarget.value.trim())
    } catch {
      this.promptTarget.select()
    }
  }

  flashCopied() {
    const label = this.copyButtonTarget.querySelector("span")
    label.textContent = "Gekopieerd"
    clearTimeout(this.copiedTimer)
    this.copiedTimer = setTimeout(() => { label.textContent = "Kopieer" }, 1600)
  }

  get destination() {
    return this.destinationTargets.find((input) => input.checked)?.value || "cowork"
  }
}

function toast(message) {
  const element = document.createElement("p")
  element.className = "toast"
  element.setAttribute("role", "status")
  element.dataset.controller = "toast"
  element.textContent = message
  document.querySelector(".toasts")?.append(element)
}

function remember(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}

function recall(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
