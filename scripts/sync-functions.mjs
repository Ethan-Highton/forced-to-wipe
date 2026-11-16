import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXCLUDE = new Set(['server.js', 'setup.js', 'import-levelups.js', 'static.js']);

/** Copies the shared server code, config and UI into the Firebase layout under `root`. */
export function sync(root = process.env.FTW_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const configSrc = path.join(root, 'config.json');
  if (!fs.existsSync(configSrc)) {
    throw new Error(`config.json not found in ${root}. Copy config.example.json or run "npm run setup" first.`);
  }

  const serverOut = path.join(root, 'functions', 'server');
  fs.rmSync(serverOut, { recursive: true, force: true });
  fs.mkdirSync(serverOut, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'server'))) {
    if (f.endsWith('.js') && !EXCLUDE.has(f)) fs.copyFileSync(path.join(root, 'server', f), path.join(serverOut, f));
  }
  fs.copyFileSync(configSrc, path.join(root, 'functions', 'config.json'));

  const pub = path.join(root, 'public');
  fs.rmSync(pub, { recursive: true, force: true });
  fs.mkdirSync(pub, { recursive: true });
  fs.copyFileSync(path.join(root, 'index.html'), path.join(pub, 'index.html'));
  // PWA files live at the site root so the service worker can control the whole site.
  for (const f of ['manifest.webmanifest', 'sw.js']) {
    if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(pub, f));
  }
  for (const dir of ['css', 'js']) fs.cpSync(path.join(root, dir), path.join(pub, dir), { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    sync();
    console.log('Synced functions/server, functions/config.json and public/');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
