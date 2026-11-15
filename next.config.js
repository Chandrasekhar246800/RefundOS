/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'tesseract.js', 'pdf-parse'],
  },
};

module.exports = nextConfig;
