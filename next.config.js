/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hybrid: API Routes sur Node.js, Pages sur Edge
  experimental: {
    serverComponentsExternalPackages: [
      'pdf-parse', 
      'mammoth', 
      'pdfjs-dist',
      'chrono-node',
      'fuse.js'
    ],
  },
  
  // Output adaptatif
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  
  // Headers CORS
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
  
  // Optimisations Webpack
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;