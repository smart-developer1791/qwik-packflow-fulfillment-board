<div align="center">

# ✦ Packflow

**Minimal Qwik fulfillment board with optimistic packing tickets**

[![Qwik](https://img.shields.io/badge/Qwik-1.19.2-18B6F6?style=for-the-badge&logo=qwik&logoColor=white)](https://qwik.dev/)
[![Qwik City](https://img.shields.io/badge/Qwik_City-Static_SSG-111827?style=for-the-badge)](https://qwik.dev/docs/qwikcity/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2.2-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Netlify](https://img.shields.io/badge/Netlify-Static_Deploy-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://netlify.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

*Packflow is a compact Qwik pet project for a fictional fulfillment floor. The board stays static, while packing tickets appear immediately, sync after the UI responds, and remain retryable if the mock carrier sync fails.*

</div>

---

## ✨ Highlights

- Static-first Qwik City project with the Qwik static adapter, not Netlify Edge
- Distinct warehouse-floor composition with lane selector, packing bench, optimistic queue, and floor log
- Optimistic packing tickets that appear before mock carrier confirmation
- Retryable failed carrier pings, local draft recovery, and browser persistence
- Lane, service, handling, parcel count, and packing note controls without any external state library
- Tailwind CSS 4 with a cargo-inspired fulfillment palette

---

## ❓ Why Qwik

This project shows Qwik as a better fit for static pages that still need meaningful interaction:

- The fulfillment board is useful as static HTML
- Queue handlers wake only after user interaction
- The packing ticket appears immediately
- Failed optimistic work stays visible and retryable

---

## 🛠️ Tech Stack

| Layer | Technology |
|------|------------|
| Framework | Qwik 1.19 |
| Routing | Qwik City |
| Styling | Tailwind CSS 4 + custom CSS tokens |
| State | Qwik `useStore` and optimistic local mutations |
| Persistence | `localStorage` |
| Deployment | Static output for Netlify |

---

## 🗂️ Project Structure

```text
qwik-packflow-fulfillment-board/
├── adapters/
│   └── static/
│       └── vite.config.ts
├── public/
│   ├── favicon.svg
│   └── manifest.json
├── src/
│   ├── lib/
│   │   └── packflow.ts
│   ├── routes/
│   │   └── index.tsx
│   ├── global.css
│   └── root.tsx
├── netlify.toml
├── package.json
└── README.md
```

---

## 🚀 Local Development

### 📦 Install

```bash
npm install
```

### ▶️ Run

```bash
npm run dev
```

The dev script binds to `0.0.0.0` for dev containers.

### 🏗️ Build

```bash
npm run build
```

### 🔍 Preview

```bash
npm run preview
```

---

## 🌐 Deployment

### 🌍 Netlify (Recommended)

1. Push your code to GitHub
2. Connect repository to Netlify
3. Build settings are auto-configured via `netlify.toml`
4. Deploy

### 🔗 Static Adapter Origin

Before publishing a cloned or renamed deployment, update the fallback `origin` in `adapters/static/vite.config.ts`. Qwik City's static adapter uses this URL for generated static metadata such as sitemap and route data. The current fallback points to `https://qwik-packflow-fulfillment-board.netlify.app`, and it can still be overridden with the `SITE_URL` environment variable.

### ⚠️ Node and Undici Note

Qwik City uses `undici` during build and preview work. `undici` tracks modern Node Web API support closely, so newer `undici` releases can require newer Node versions. If this project keeps `undici` floating with `"undici": "*"`, keep Netlify and CI on a fresh Node version; newer Node is the safer default. The included `netlify.toml` sets the build runtime explicitly for that reason.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

---

## 📄 License

MIT License. See `LICENSE`.
