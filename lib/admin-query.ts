export const REVIEW_STATUSES = ['all', 'pending', 'approved', 'rejected'] as const;
export function adminQuery(url: string) {
  const p = new URL(url).searchParams;
  const status = p.get('status') ?? 'all';
  if (!REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number]))
    throw Error('无效的审核状态');
  const page = (name: string) => {
    const value = p.get(name) ?? '0';
    if (!/^\d{1,5}$/.test(value)) throw Error('无效的页码');
    return Number(value);
  };
  return {
    status,
    voices: page('voicePage'),
    messages: page('messagePage'),
    reports: page('reportPage'),
    limit: 20,
  };
}
export function pageInfo(page: number, total: number, limit: number) {
  return { page, total, limit, hasNext: (page + 1) * limit < total };
}
