const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const dataRoot = path.resolve(monorepoRoot, 'packages/data');
const dataEntry = path.resolve(dataRoot, 'src/index.ts');
const uuidEntry = path.resolve(dataRoot, 'node_modules/uuid/dist/index.js');
const reactEntries = new Map([
  ['react', require.resolve('react', { paths: [projectRoot] })],
  ['react/jsx-runtime', require.resolve('react/jsx-runtime', { paths: [projectRoot] })],
  ['react/jsx-dev-runtime', require.resolve('react/jsx-dev-runtime', { paths: [projectRoot] })],
]);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@lumo/data': dataRoot,
};

// @lumo/data publishes TypeScript source. Resolve its entry explicitly because
// Expo 52's Metro cannot reliably follow pnpm's workspace symlink + exports map.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The workspace also contains React 19 for admin. Dependencies resolved from
  // pnpm's root store can otherwise mix React 19 JSX elements into this React
  // 18 Expo bundle, which ReactDOM rejects as invalid children.
  const reactEntry = reactEntries.get(moduleName);
  if (reactEntry) {
    return { type: 'sourceFile', filePath: reactEntry };
  }

  if (moduleName === '@lumo/data') {
    return { type: 'sourceFile', filePath: dataEntry };
  }

  // uuid 14 is exports-only and has no legacy `main`; Expo 52's resolver
  // otherwise looks for the nonexistent package-root index file.
  if (moduleName === 'uuid') {
    return { type: 'sourceFile', filePath: uuidEntry };
  }

  // The package uses Node ESM-style `.js` specifiers in TypeScript sources.
  // Metro needs the corresponding source extension during development builds.
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    for (const extension of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(
          context,
          moduleName.replace(/\.js$/, extension),
          platform,
        );
      } catch {
        // Try the next source extension, then fall back to Metro.
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
