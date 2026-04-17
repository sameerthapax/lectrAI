module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Remove any 'plugins' list that contains 'transform-react-jsx-self'
  };
};
