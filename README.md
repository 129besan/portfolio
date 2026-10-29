# 129besan — Research & Engineering Portfolio

A motion-rich, accessible, **dependency-free static portfolio** built with vanilla HTML/CSS/JavaScript, WebGPU and the native HTML-in-Canvas API. The design deliberately favors real content and robust fallbacks over a fragile all-canvas site.

## Preview

```bash
python3 -m http.server 8000
# http://localhost:8000
```

For WebGPU use a secure context (HTTPS or localhost). Open the site in a modern browser. The page remains usable even when JavaScript, WebGPU, or native HTML-in-Canvas is unavailable.

## Visual engine

- `src/scene.js`: animated background rendered with a **real WebGPU WGSL shader**; low-overhead Canvas 2D particle fallback. Pixel resolution capped for performance.
- `src/html-in-canvas.js`: an **interactive HTML card inside a WebGPU canvas**, using `content="drawable"`, a `drawable` DOM subtree, `getElementImageDefaultSize()`, `GPUQueue.drawElementImageToTexture()` and `updateElementGeometry()` for hit testing. This is not html2canvas or an image screenshot. In other browsers the identical card is displayed as regular semantic HTML.
- `src/main.js`: project interactions, section reveals, reduced-motion support, accessibility toggles and navigation.
- `styles.css`: layout, responsive breakpoints, CSS orbital scene and cards.

HTML-in-Canvas is a very recent browser feature. At the time of authoring (October 2026) it targets Chrome 157+. Earlier Chromium builds and other browsers normally show the HTML fallback. WebGPU also requires a supported browser/GPU and HTTPS (localhost qualifies). See the official documentation: https://developer.chrome.com/docs/web-platform/html-in-canvas/webgpu

## Publishing

This repository is ready for **GitHub Pages**: select **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. No build step, secrets, API keys, cookies, tracking or backend. `.nojekyll` is included.

## Content / disclosure

Featured completed work links to existing public repositories; ongoing prototypes are labelled clearly. The research work is described at a high level. The page deliberately omits personal contact details, addresses, unpublished manuscripts, internal internship/client information and unverifiable project claims. The internships are labelled as short-term participation in 2026, not employment. Fricto/AppLockout and the Kaggle/creative-AI initiatives are clearly marked as ongoing/experimental; no production release, competition score or medal is claimed. The homemadeOS prototype is intentionally excluded because the author has not verified it works. The 2026 autonomous-driving competition result is a self-reported highlight; remove it if public verification or disclosure is undesirable.

**Kaggle profile:** the verified Kaggle profile URL is not currently available. The Kaggle card is intentionally plain text until the author supplies the exact link; do not assume the GitHub handle matches. To add the link, replace `.profile-destination-pending` in `index.html` with a real `<a href="https://www.kaggle.com/...">` entry after verifying the URL.

To customize, update text and links in `index.html`, theme values at the top of `styles.css`, and the visualization in `src/scene.js`.

## Accessibility and performance

- Native HTML retains focus, selection, hit testing and semantic accessibility in supported engines.
- Unsupported browsers render normal HTML for interactive content.
- `prefers-reduced-motion` disables nonessential movement by default; visitors can toggle motion manually.
- Keyboard focus, skip link, responsive layouts and descriptive project links.
- No dependencies, cookies or analytics; motion is paused when the document is hidden.

The exact native API path should be tested on Chrome 157+ with WebGPU enabled. Fallback behavior is the default elsewhere.