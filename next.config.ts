import type { NextConfig } from 'next';
// Vinext examines multipart requests before route dispatch. Allow enough room
// for the 30 MB audio cap plus metadata; the API enforces the file limit itself.
const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: '32mb' } } };
export default nextConfig;
