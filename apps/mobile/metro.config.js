const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The mobile app consumes dependency-free shared packages directly. This repo
// has no root workspace manifest, so Metro needs each runtime package in its
// explicit file map.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../../packages/planning'),
  path.resolve(__dirname, '../../packages/place-presentation'),
];

module.exports = config;
