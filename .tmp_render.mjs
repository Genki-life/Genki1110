import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/app/applet/.aistudio/artifacts/brain/8a2de827-d9e5-4b5b-8a94-ac561b61c5f2';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist'
  ]
});
const context = await browser.newContext({
  viewport: { width: 520, height: 680 },
  deviceScaleFactor: 2
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

async function cdpScreenshot(outPath) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 40, y: 120, width: 440, height: 420, scale: 1 }
  });
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
}

// 1. No-Fur Mode (View A)
for (const [angle, file] of [
  ['front', path.join(ARTIFACT_DIR, 'nofur_front.png')],
  ['side', path.join(ARTIFACT_DIR, 'nofur_side.png')],
  ['back', path.join(ARTIFACT_DIR, 'nofur_back.png')]
]) {
  await page.goto(`http://localhost:3000/?avatarDebug=1&furMode=A&angle=${angle}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await cdpScreenshot(file);
  console.log('Captured No-Fur:', angle);
}

// 2. Full-Fur Mode (View B)
for (const [angle, file] of [
  ['front', '/tmp/fullfur_front.png'],
  ['side', '/tmp/fullfur_side.png'],
  ['back', '/tmp/fullfur_back.png']
]) {
  await page.goto(`http://localhost:3000/?avatarDebug=1&furMode=B&angle=${angle}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3200);
  await cdpScreenshot(file);
  console.log('Captured Full-Fur:', angle);
}

// Stitch turnaround images in browser canvas
const stitchPage = await context.newPage();
await stitchPage.setViewportSize({ width: 1560, height: 620 });

async function makeComposite(files, titles, headerTitle, outPath) {
  const b64s = files.map(f => fs.readFileSync(f).toString('base64'));
  await stitchPage.setContent(`
    <html>
      <body style="margin:0; background:#14131c; font-family:system-ui,sans-serif; color:#f4f4f6; display:flex; flex-direction:column; align-items:center; justify-content:center; height:620px;">
        <div style="font-size:18px; font-weight:600; margin-bottom:12px; letter-spacing:0.04em; color:#d8d6e8;">${headerTitle}</div>
        <div style="display:flex; gap:18px; align-items:center; justify-content:center;">
          ${b64s.map((b, i) => `
            <div style="display:flex; flex-direction:column; align-items:center; background:#1c1b26; border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:10px;">
              <img src="data:image/png;base64,${b}" style="width:450px; height:490px; object-fit:cover; border-radius:10px;" />
              <div style="margin-top:8px; font-size:15px; font-weight:600; color:#e2e8f0;">${titles[i]}</div>
            </div>
          `).join('')}
        </div>
      </body>
    </html>
  `);
  await stitchPage.waitForTimeout(300);
  await stitchPage.screenshot({ path: outPath });
}

await makeComposite(
  [
    path.join(ARTIFACT_DIR, 'nofur_front.png'),
    path.join(ARTIFACT_DIR, 'nofur_side.png'),
    path.join(ARTIFACT_DIR, 'nofur_back.png')
  ],
  ['正面 (Front - 无毛发底层)', '侧面 (Side - 无毛发底层)', '背面 (Back - 无毛发底层)'],
  'Nova 底层 3D 造型三视图（视图 A：隐藏毛发 / 仅底层网格与五官）',
  path.join(ARTIFACT_DIR, 'nofur_turnaround.png')
);

await makeComposite(
  ['/tmp/fullfur_front.png', '/tmp/fullfur_side.png', '/tmp/fullfur_back.png'],
  ['正面 (Front - 完整毛发 furLength=0.31)', '侧面 (Side - 完整毛发 furLength=0.31)', '背面 (Back - 完整毛发 furLength=0.31)'],
  'Nova 完整毛发模式运行验证（视图 B：保持 furLength=0.31 及全部正式配置不变）',
  path.join(ARTIFACT_DIR, 'fullfur_verify.png')
);

await browser.close();
console.log('Done rendering No-Fur and Full-Fur turnarounds!');
