const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: defaultConfig.resolver.assetExts.filter(
        (ext) => ext !== 'svg'
    ),
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'cjs',
      'mjs',
      'svg',
    ],
  },
};

module.exports = withNxMetro(
    mergeConfig(defaultConfig, customConfig),
    {
      debug: false,
    }
);