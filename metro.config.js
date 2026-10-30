// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for GGUF and ONNX asset resolution if bundled locally
config.resolver.assetExts.push('gguf', 'onnx', 'bin');

module.exports = config;
