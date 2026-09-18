const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Phase 1 is now a runtime dependency. This repo has no root workspace manifest,
// so Metro needs the dependency-free shared package in its explicit file map.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../../packages/planning')];

module.exports = config;
