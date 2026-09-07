/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // firebase-admin & googleapis are server-only; keep them out of the client bundle
    serverComponentsExternalPackages: [
      "firebase-admin",
      "googleapis",
      "@microsoft/microsoft-graph-client",
      "handlebars",
    ],
  },
};

export default nextConfig;
