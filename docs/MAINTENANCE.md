# Unattended maintenance for A Glimmer

Site: appgprj_6acca963b1748191808696de5f1d6bbc. Public URL: https://aglimmer.xyz. Source: https://github.com/stong123456/aglimmer.

## Authorized daily work

The owner requested daily recovery snapshots, source checks and restore verification. The linked Sites cloud task runs at 04:20 Asia/Shanghai. Do not create duplicate schedules; inspect `get_site.automations` before changing cadence. Do not republish source during routine maintenance.

1. Call Sites `get_site` for this exact project. Use its supported `siwc_bypass_bearer_token` only for this site. This is owner service access, not a visitor's Supabase session. If unavailable, stop and report access failure. Do not invent a token or rotate encryption keys.
2. Retrieve the tracked `scripts/maintenance-client.mjs` from the linked source revision or the owner's public GitHub repository. The client is fixed to https://aglimmer.xyz/api/maintenance and the exact project ID; inspect those bindings before running it.
3. Launch the client with Node 24 in a retained TTY. After `Ready for maintenance JSON on hidden stdin.`, pass one newline-terminated JSON object containing `project_id` and `service_token`. Keep credentials only in memory; never put them in arguments, files, prompt text, repository, logs or reports.
4. The client derives a maintenance-scoped HMAC from supported service access, resumes today's backup in bounded chunks, checks up to 144 due sources (selected Chinese prose prioritized; withdrawn poetry skipped), runs today's sample restore verification, then reads back aggregate state. The Worker compares only a stored hash of the scoped credential. The client never downloads profile rows or audio backups to the cloud task.
5. Verify a complete backup and a successful drill. An `empty-or-large-only-canary` result verifies the encryption/storage recovery path, not a real user's original recording. Report that distinction. No live database restore or account deletion is authorized by this task.
6. On a credential error, failed/incomplete backup, missing snapshot, exhausted capacity, failed integrity check or newly repeated unavailable source, notify the owner with aggregate facts and the next action. Keep routine unchanged success quiet. Do not send email or contact anyone else.

A source probe reads only a small Range from the reviewed original URL, or official YouTube embed metadata. It does not establish full playback, legal clearance in every country, emotional quality or a full listening review. Only repeated 404/410 checks separated by the stored six-hour retry window automatically hide an entry. A regional 403, timeout or rate limit stays uncertain and must not become a takedown by itself. A successful source response clears automatic failure state; explicit moderator takedowns remain in force.

## Scope and recovery limits

Snapshots are AES-256-GCM encrypted with path-bound authentication. Original media is split into 4 MB chunks with SHA-256 read-back checks, deduplicated by content. The current bounded internal budget is 256 MB, 1000 original objects, 10000 rows per business table, and seven days' target retention. Jobs resume incomplete work and never label a partial snapshot complete. Maintenance failure can delay expiry cleanup; operators must respond to failures.

There is no cross-account/off-site destination in this deployment. Both data and the backup encryption key remain in the same site environment. These recovery copies address accidental data changes, not total loss of the site/provider account. Keep independent user exports and arrange independent operator storage before promising long-term archival service.

Before any full restoration, merge the newest `backup_deletions` and `closed_identities` from the surviving operational ledger, apply `safeRestoreRows`, and restore to a separate database/bucket first. Restored voices default private, messages pending; original dates and signatures remain unchanged. Verify all media chunks, row counts, foreign keys and access isolation. Never overwrite the live database or republish historical permission state from a maintenance task. A full production restoration requires a separate, concrete recovery operation.

`tests/maintenance-production.mjs` decrypts the generated format, restores a sample original, imports business rows into separate D1, and rejects corrupted chunks. It uses isolated synthetic data. The production drill only performs private scratch-object sample restoration and metadata projection, never a live database overwrite.
