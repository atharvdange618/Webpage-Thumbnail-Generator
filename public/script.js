document.getElementById("generateBtn").addEventListener("click", async () => {
  const urlInput = document.getElementById("urlInput");
  const url = urlInput.value.trim();
  const previewArea = document.getElementById("previewArea");
  const errorMsg = document.getElementById("errorMsg");
  const imgEl = document.getElementById("thumbImg");
  const linkEl = document.getElementById("downloadLink");
  const generateBtn = document.getElementById("generateBtn");

  // Reset UI
  previewArea.classList.add("hidden");
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");

  if (!url) {
    errorMsg.textContent = "Please enter a valid URL.";
    errorMsg.classList.remove("hidden");
    return;
  }

  // Revoke any existing object URL to free memory
  if (imgEl.src && imgEl.src.startsWith("blob:")) {
    URL.revokeObjectURL(imgEl.src);
  }
  if (linkEl.href && linkEl.href.startsWith("blob:")) {
    URL.revokeObjectURL(linkEl.href);
  }

  // Extract domain for filename
  let filename;
  try {
    const urlObj = new URL(url);
    // Remove www. if present and get hostname without TLD
    const domain = urlObj.hostname.replace(/^www\./, "").split(".")[0];
    filename = `${domain}-thumbnail.png`;
  } catch (e) {
    // Fallback to default if URL parsing fails
    filename = "thumbnail.png";
  }

  // Show loading state
  generateBtn.disabled = true;
  generateBtn.classList.add("loading");
  generateBtn.innerHTML = '<span class="spinner"></span> Generating...';

  try {
    const resp = await fetch(`/thumbnail?url=${encodeURIComponent(url)}`);
    if (!resp.ok) throw new Error("Network response was not OK");

    // 1) Get a Blob from the HTTP response
    const blob = await resp.blob();

    // 2) Create an object URL for the Blob
    const blobUrl = URL.createObjectURL(blob);

    // 3) Display in <img>
    imgEl.src = blobUrl;

    // 4) Set up download link with meaningful filename
    linkEl.href = blobUrl;
    linkEl.download = filename;

    previewArea.classList.remove("hidden");

    // Set up revocation of the blob URL when image is downloaded
    linkEl.addEventListener(
      "click",
      () => {
        // Wait a bit before revoking to ensure download starts
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      },
      { once: true }
    );
  } catch (err) {
    console.error(err);
    errorMsg.textContent = "Failed to generate thumbnail.";
    errorMsg.classList.remove("hidden");
  } finally {
    // Reset button state
    generateBtn.disabled = false;
    generateBtn.classList.remove("loading");
    generateBtn.textContent = "Generate";
  }
});

// Clean up any object URLs when the page unloads
window.addEventListener("beforeunload", () => {
  const imgEl = document.getElementById("thumbImg");
  const linkEl = document.getElementById("downloadLink");

  if (imgEl.src && imgEl.src.startsWith("blob:")) {
    URL.revokeObjectURL(imgEl.src);
  }
  if (linkEl.href && linkEl.href.startsWith("blob:")) {
    URL.revokeObjectURL(linkEl.href);
  }
});
