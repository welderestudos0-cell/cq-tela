module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Remove todos os console.log, console.warn, console.error em produção
      process.env.NODE_ENV === 'production' && 'transform-remove-console',
    ].filter(Boolean),
  };
};
