// Webpack loader: replaces Vite's dynamic-import ignore comment with webpack's
// equivalent so @ffmpeg/ffmpeg's worker can load ffmpeg-core.js at runtime
// without webpack trying to statically bundle the URL.
module.exports = function (source) {
  return source.replace(/\/\* @vite-ignore \*\//g, '/* webpackIgnore: true */');
};
