// File: next.config.js
const withPWA = require('next-pwa')({
  dest: 'public'
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ✅ ДОБАВЬТЕ ЭТУ СТРОКУ
  output: 'export', 
};

module.exports = withPWA(nextConfig);