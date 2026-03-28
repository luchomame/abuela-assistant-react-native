const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Tell Metro to bundle .bin files as assets
config.resolver.assetExts.push("bin", "gguf");

module.exports = config;
