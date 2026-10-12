import type { NextConfig } from 'next';
// Vinext examines multipart requests before route dispatch. Allow enough room
// for the 10 MB audio cap plus metadata; the API enforces the file limit itself.
const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: '12mb' } } };
export default nextConfig;
