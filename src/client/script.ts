type Mode = "og" | "screenshot";
type State = "idle" | "loading" | "done" | "error";
type Source = "Open Graph image" | "Live screenshot" | "Screenshot";

// Looks up an element and checks its type, so a renamed id fails loudly at load instead of later
function el<T extends HTMLElement>(id: string, type: { new (): T; prototype: T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return node;
}

const form = el("form", HTMLFormElement);
const input = el("url", HTMLInputElement);
const submitBtn = el("submit", HTMLButtonElement);
const status = el("status", HTMLElement);
const stage = el("stage", HTMLElement);
const img = el("thumb", HTMLImageElement);
const downloadPng = el("downloadPng", HTMLAnchorElement);
const downloadWebp = el("downloadWebp", HTMLAnchorElement);
const copyBtn = el("copy", HTMLButtonElement);
const retryBtn = el("retry", HTMLButtonElement);
const elapsed = el("elapsed", HTMLElement);
const phase = el("phase", HTMLElement);
const errorText = el("errorText", HTMLElement);
const metaSource = el("metaSource", HTMLElement);
const metaSize = el("metaSize", HTMLElement);
const modeHint = el("modeHint", HTMLElement);

const hints: Record<Mode, string> = {
  og: "Falls back to a screenshot if the page has none.",
  screenshot: "Skips the Open Graph image, which can be out of date. Takes up to 20s.",
};

const doneMessages: Record<Source, string> = {
  "Open Graph image": "Done. Made from the page's Open Graph image.",
  "Live screenshot": "Done. This is how the page looks right now.",
  Screenshot: "Done. The page has no usable Open Graph image, so this is a screenshot.",
};

const mode = (): Mode =>
  document.querySelector<HTMLInputElement>('input[name="source"]:checked')?.value === "screenshot"
    ? "screenshot"
    : "og";

let currentBlob: Blob | null = null;
let currentUrl: string | null = null;
let webpUrl: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Re-encode the loaded PNG in the browser so the download doesn't need a second
// server round trip (and, in live mode, a second screenshot)
async function toWebp(image: HTMLImageElement): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.9);
  });
  // Browsers that can't encode WebP (Safari) quietly hand back a PNG
  return blob?.type === "image/webp" ? blob : null;
}

// Clipboard image writes need ClipboardItem and a secure context (localhost counts).
// navigator.clipboard is undefined outside secure contexts even though the DOM types say otherwise.
copyBtn.hidden = !(window.isSecureContext && "ClipboardItem" in window);

// Accept "example.com" as well as full URLs; returns null when it can't be a web page
function normalize(raw: string): URL | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname;
    if (host !== "localhost" && !host.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function setState(state: State): void {
  stage.dataset.state = state;
  submitBtn.disabled = state === "loading";
  submitBtn.textContent = state === "loading" ? "Working…" : "Generate";
}

function startTimer(): void {
  const started = Date.now();
  elapsed.textContent = "0s";
  const live = mode() === "screenshot";
  phase.textContent = live ? "Taking a live screenshot" : "Looking for an Open Graph image";
  timer = setInterval(() => {
    const secs = Math.floor((Date.now() - started) / 1000);
    elapsed.textContent = `${secs}s`;
    // The server doesn't report progress; an OG fetch is usually done by now
    if (secs === 3 && !live) phase.textContent = "Still working. Screenshots can take up to 20s";
  }, 250);
}

function stopTimer(): void {
  clearInterval(timer);
  timer = undefined;
}

async function generate(): Promise<void> {
  const url = normalize(input.value);
  if (!url) {
    input.setAttribute("aria-invalid", "true");
    status.textContent = "That doesn't look like a web address. Try something like example.com.";
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  input.value = url.href.replace(/^https:\/\//, "");

  setState("loading");
  status.textContent = `Generating a thumbnail for ${url.hostname}…`;
  startTimer();

  try {
    const live = mode() === "screenshot";
    const resp = await fetch(
      `/thumbnail?url=${encodeURIComponent(url.href)}${live ? "&source=screenshot" : ""}`
    );
    if (!resp.ok) {
      // 400s carry a short reason, such as a private-network address
      throw new Error(
        resp.status === 400
          ? `The server didn't accept that URL: ${await resp.text()}.`
          : "The page couldn't be loaded. Check the address, or the site may block bots."
      );
    }

    const blob = await resp.blob();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentBlob = blob;
    const blobUrl = URL.createObjectURL(blob);
    currentUrl = blobUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        resolve();
      };
      img.onerror = () => {
        reject(new Error("The server sent back something that isn't an image."));
      };
      img.src = blobUrl;
    });

    const source: Source =
      resp.headers.get("X-Thumbnail-Source") === "og"
        ? "Open Graph image"
        : live
          ? "Live screenshot"
          : "Screenshot";
    const host = url.hostname.replace(/^www\./, "");
    img.alt = `Thumbnail of ${host}`;
    const name = `${host.split(".")[0] ?? host}-thumbnail`;
    downloadPng.href = blobUrl;
    downloadPng.download = `${name}.png`;
    downloadPng.textContent = `Download PNG · ${formatSize(blob.size)}`;

    if (webpUrl) URL.revokeObjectURL(webpUrl);
    webpUrl = null;
    const webp = await toWebp(img);
    downloadWebp.hidden = !webp;
    downloadPng.classList.toggle("primary", !webp);
    if (webp) {
      webpUrl = URL.createObjectURL(webp);
      downloadWebp.href = webpUrl;
      downloadWebp.download = `${name}.webp`;
      downloadWebp.textContent = `Download WebP · ${formatSize(webp.size)}`;
    }

    metaSource.textContent = source;
    metaSize.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;

    setState("done");
    status.textContent = doneMessages[source];
  } catch (err) {
    console.error(err);
    const message = errorMessage(err);
    errorText.textContent = message.startsWith("Failed to fetch")
      ? "Couldn't reach the server. Is the container running?"
      : message;
    setState("error");
    status.textContent = errorText.textContent;
  } finally {
    stopTimer();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void generate();
});

retryBtn.addEventListener("click", () => {
  void generate();
});

// Switching source re-runs the current URL so you can compare the two
document.querySelectorAll<HTMLInputElement>('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    modeHint.textContent = hints[mode()];
    const state = stage.dataset.state;
    if ((state === "done" || state === "error") && input.value.trim()) void generate();
  });
});

input.addEventListener("input", () => {
  if (input.hasAttribute("aria-invalid")) {
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  }
});

async function copyImage(): Promise<void> {
  if (!currentBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [currentBlob.type]: currentBlob })]);
    copyBtn.textContent = "Copied";
  } catch (err) {
    console.error(err);
    copyBtn.textContent = "Copy failed";
  }
  setTimeout(() => {
    copyBtn.textContent = "Copy image";
  }, 1600);
}

copyBtn.addEventListener("click", () => {
  void copyImage();
});
