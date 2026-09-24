import fs from 'node:fs';

if (process.env.GITHUB_ACTIONS === 'true' && process.env.CLOUDFLARE_API_TOKEN) {
  const path = 'wrangler.jsonc';
  const config = JSON.parse(fs.readFileSync(path, 'utf8'));
  config.main = './src/worker/production-demo-proxy.ts';
  fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log('MAX TOUR production deploy entrypoint switched to live demo proxy.');
}
