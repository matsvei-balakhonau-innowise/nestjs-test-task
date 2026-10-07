module.exports = function (options) {
  const externals = options.externals || {};
  return {
    ...options,
    externals: [
      ...(Array.isArray(externals) ? externals : [externals]),
      function ({ request }, callback) {
        if (!request || typeof request !== 'string') {
          return callback();
        }
        const externalPrefixes = ['swagger-ui-dist'];
        if (
          externalPrefixes.some(
            (prefix) => request === prefix || request.startsWith(`${prefix}/`),
          )
        ) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ],
  };
};
