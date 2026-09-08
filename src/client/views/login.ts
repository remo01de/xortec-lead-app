import { login } from "../api.js";

export function renderLoginView(container: HTMLElement, onSuccess: () => void): void {
  container.innerHTML = `
    <div class="login-wrap">
      <h1>Xortec Lead-App</h1>
      <form id="login-form" class="login-form">
        <label for="password">Passwort</label>
        <input id="password" type="password" autocomplete="current-password" required autofocus />
        <button class="primary" type="submit">Anmelden</button>
        <p id="login-error" class="login-error" hidden></p>
      </form>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>("#login-form")!;
  const input = container.querySelector<HTMLInputElement>("#password")!;
  const errorEl = container.querySelector<HTMLParagraphElement>("#login-error")!;
  const button = form.querySelector<HTMLButtonElement>("button")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    button.disabled = true;
    try {
      await login(input.value);
      onSuccess();
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : String(err);
      errorEl.hidden = false;
      input.value = "";
      input.focus();
    } finally {
      button.disabled = false;
    }
  });
}
