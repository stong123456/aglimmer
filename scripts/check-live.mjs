const base = process.argv[2] || 'https://aglimmer.xyz';
const origin = new URL(base);
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
  throw Error('Use HTTPS for a public site.');
const started = Date.now();
try {
  const [home, health] = await Promise.all(
    ['/', '/api/health'].map((p) =>
      fetch(new URL(p, origin), { signal: AbortSignal.timeout(15000), redirect: 'follow' }),
    ),
  );
  const storage = await health.json();
  const html = await home.text();
  const ok =
    home.status === 200 &&
    /A Glimmer/.test(html) &&
    health.status === 200 &&
    storage.ok === true &&
    storage.storage === 'D1 + R2';
  console.log(
    JSON.stringify({
      ok,
      checkedAt: new Date().toISOString(),
      homeStatus: home.status,
      healthStatus: health.status,
      durationMs: Date.now() - started,
    }),
  );
  if (!ok) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: 'Network or service check failed',
    }),
  );
  process.exitCode = 1;
}
