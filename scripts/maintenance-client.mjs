// Owner-only unattended maintenance client. Credentials arrive on hidden stdin, never argv or files.
import { createHmac } from 'node:crypto';
const input = await new Promise((resolve, reject) => {
  let s = '';
  const tty = !!process.stdin.isTTY;
  if (tty) {
    process.stdin.setRawMode(true);
    process.stderr.write('Ready for maintenance JSON on hidden stdin.\n');
  }
  process.stdin.setEncoding('utf8');
  function done() {
    if (tty) process.stdin.setRawMode(false);
    process.stdin.pause();
    resolve(s);
  }
  process.stdin.on('data', (c) => {
    s += c;
    if (s.length > 16000) reject(Error('Input too large'));
    if (s.includes('\n')) done();
  });
  process.stdin.on('end', done);
});
let parsed;
try {
  parsed = JSON.parse(input);
} catch {
  throw Error('Invalid maintenance configuration JSON');
}
const config = parsed,
  project = 'appgprj_6acca963b1748191808696de5f1d6bbc';
if (
  config.project_id !== project ||
  typeof config.service_token !== 'string' ||
  !config.service_token
)
  throw Error('Use supported owner service access from get_site for this exact site');
const token = createHmac('sha256', config.service_token)
  .update('aglimmer:maintenance:v1:' + project)
  .digest('hex');
async function call(action) {
  const r = await fetch('https://aglimmer.xyz/api/maintenance', {
    method: action ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'OAI-Sites-Authorization': 'Bearer ' + config.service_token,
      'X-Glimmer-Maintenance': token,
    },
    ...(action ? { body: JSON.stringify({ action }) } : {}),
    signal: AbortSignal.timeout(120000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(action + ' failed: ' + (data.error ?? r.status));
  return data;
}
const outputs = {};
let backup;
for (let i = 0; i < 80; i++) {
  backup = await call('backup');
  if (backup.status === 'complete') break;
  if (backup.status === 'busy')
    throw Error('Another maintenance request holds the lease; retry later');
}
if (backup.status !== 'complete')
  throw Error('Backup step budget exhausted; the partial snapshot remains retryable');
outputs.backup = backup;
outputs.sources = [];
for (let i = 0; i < 12; i++) {
  const x = await call('sources');
  outputs.sources.push(x);
  if (!x.checked) break;
}
outputs.drill = await call('drill');
outputs.readback = await call();
// Responses contain aggregate state only, never profile rows or object keys.
process.stdout.write(JSON.stringify(outputs) + '\n');
