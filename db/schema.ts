import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull(),
  avatarKey: text('avatar_key'),
  avatarMime: text('avatar_mime'),
  createdAt: text('created_at').notNull(),
});
export const voices = sqliteTable(
  'voices',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => profiles.id),
    title: text('title').notNull(),
    signature: text('signature').notNull(),
    recordedAt: text('recorded_at').notNull(),
    createdAt: text('created_at').notNull(),
    mood: text('mood').notNull(),
    topic: text('topic'),
    transcript: text('transcript').notNull().default(''),
    source: text('source').notNull().default(''),
    duration: integer('duration').notNull(),
    size: integer('size').notNull(),
    audioKey: text('audio_key').notNull(),
    mime: text('mime').notNull(),
    visibility: text('visibility').notNull(),
    status: text('status').notNull(),
    featured: integer('featured').notNull().default(0),
    futureYear: integer('future_year'),
    parentId: text('parent_id'),
    reviewNote: text('review_note').notNull().default(''),
    reviewedAt: text('reviewed_at'),
    reviewedBy: text('reviewed_by'),
  },
  (t) => [
    index('voices_public').on(t.status, t.featured, t.createdAt),
    index('voices_owner').on(t.ownerId, t.createdAt),
  ],
);
export const reactions = sqliteTable(
  'reactions',
  {
    userId: text('user_id').notNull(),
    voiceId: text('voice_id').notNull(),
    kind: text('kind').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.voiceId, t.kind] })],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    voiceId: text('voice_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull(),
    resolved: integer('resolved').notNull().default(0),
  },
  (t) => [index('reports_voice').on(t.voiceId)],
);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull(),
  voiceId: text('voice_id').notNull(),
  action: text('action').notNull(),
  note: text('note').notNull(),
  createdAt: text('created_at').notNull(),
});
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => profiles.id),
    topic: text('topic').notNull(),
    kind: text('kind').notNull(),
    body: text('body').notNull().default(''),
    signature: text('signature').notNull(),
    createdAt: text('created_at').notNull(),
    status: text('status').notNull(),
    mediaKey: text('media_key'),
    mime: text('mime'),
    size: integer('size').notNull().default(0),
    reviewNote: text('review_note').notNull().default(''),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
  },
  (t) => [
    index('messages_channel').on(t.topic, t.status, t.createdAt),
    index('messages_owner').on(t.ownerId),
  ],
);
export const authIdentities = sqliteTable('auth_identities', {
  subject: text('subject').primaryKey(),
  userId: text('user_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
export const authThrottle = sqliteTable(
  'auth_throttle',
  {
    id: text('id').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('auth_throttle_expiry').on(t.expiresAt)],
);
