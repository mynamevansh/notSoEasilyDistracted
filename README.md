# notSoEasilyDistracted

Manifest V3 Chrome extension architecture built with React, TypeScript, and Vite.

## Development

```bash
npm install
npm run dev
```

The Vite development server is useful for UI work. Build the extension package
before loading it in Chrome:

```bash
npm run validate:extension
```

## Load the unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` directory.
5. After a rebuild, select **Reload** for the extension.

The package contains independent popup, dashboard, blocked-page, and background
service-worker entry points. The initial manifest requests no permissions; add
permissions only when a corresponding feature is implemented.
