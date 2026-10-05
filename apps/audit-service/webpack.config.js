module.exports = function (options) {
  const externals = options.externals || {};
  return {
    ...options,
    externals: [
      ...(Array.isArray(externals) ? externals : [externals]),
      // pdfkit uses package subpath imports (#standard-fonts/*) that break when bundled
      function ({ request }, callback) {
        if (
          request === 'pdfkit' ||
          (typeof request === 'string' && request.startsWith('pdfkit/'))
        ) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ],
  };
};
