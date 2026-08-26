const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	output: "standalone",
	// Explicitly set the project root to the frontend directory
	outputFileTracingRoot: __dirname,
	// Word database is server-only - no client-side access needed
};

module.exports = nextConfig;
