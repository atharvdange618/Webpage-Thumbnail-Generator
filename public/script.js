const $ = (id) => document.getElementById(id);

const form = $("form");
const input = $("url");
const submitBtn = $("submit");
const status = $("status");
const stage = $("stage");
const img = $("thumb");
const download = $("download");
const copyBtn = $("copy");

let currentBlob = null;
let currentUrl = null;
let timer = null;

// Clipboard image writes need ClipboardItem and a secure context (localhost counts)
copyBtn.hidden = !(window.ClipboardItem && navigator.clipboard?.write);

// Accept "example.com" as well as full URLs; returns null when it can't be a web page
function normalize(raw) {
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

function setState(state) {
  stage.dataset.state = state;
  submitBtn.disabled = state === "loading";
  submitBtn.textContent = state === "loading" ? "Working…" : "Generate";
}

function startTimer() {
  const started = Date.now();
  $("elapsed").textContent = "0s";
  $("phase").textContent = "Looking for an Open Graph image";
  timer = setInterval(() => {
    const secs = Math.floor((Date.now() - started) / 1000);
    $("elapsed").textContent = `${secs}s`;
    // The server doesn't report progress; an OG fetch is usually done by now
    if (secs === 3) $("phase").textContent = "Still working. Screenshots can take up to 20s";
  }, 250);
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

async function generate() {
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
    const resp = await fetch(`/thumbnail?url=${encodeURIComponent(url.href)}`);
    if (!resp.ok) {
      throw new Error(
        resp.status === 400
          ? "The server didn't accept that URL."
          : "The page couldn't be loaded. Check the address, or the site may block bots."
      );
    }

    const blob = await resp.blob();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentBlob = blob;
    currentUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The server sent back something that isn't an image."));
      img.src = currentUrl;
    });

    const source = resp.headers.get("X-Thumbnail-Source") === "og" ? "Open Graph image" : "Screenshot";
    const host = url.hostname.replace(/^www\./, "");
    img.alt = `Thumbnail of ${host}`;
    download.href = currentUrl;
    download.download = `${host.split(".")[0]}-thumbnail.png`;
    $("metaSource").textContent = source;
    $("metaSize").textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    $("metaFile").textContent = `PNG · ${Math.round(blob.size / 1024)} KB`;

    setState("done");
    status.textContent =
      source === "Screenshot" ? "Done. The page has no usable Open Graph image, so this is a screenshot." : "Done. Made from the page's Open Graph image.";
  } catch (err) {
    console.error(err);
    $("errorText").textContent = err.message.startsWith("Failed to fetch")
      ? "Couldn't reach the server. Is the container running?"
      : err.message;
    setState("error");
    status.textContent = $("errorText").textContent;
  } finally {
    stopTimer();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate();
});

$("retry").addEventListener("click", generate);

input.addEventListener("input", () => {
  if (input.hasAttribute("aria-invalid")) {
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ [currentBlob.type]: currentBlob })]);
    copyBtn.textContent = "Copied";
  } catch (err) {
    console.error(err);
    copyBtn.textContent = "Copy failed";
  }
  setTimeout(() => (copyBtn.textContent = "Copy image"), 1600);
});
