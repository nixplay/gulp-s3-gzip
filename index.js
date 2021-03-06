'use strict';

var es = require('event-stream');
var knox = require('knox');
var gutil = require('gulp-util');
var mime = require('mime');
var streamToQueue = require('stream-to-queue');
mime.default_type = 'text/plain';

module.exports = function (aws, options) {
  options = options || {};

  if (!options.delay) { options.delay = 0; }
  if (!options.concurrency) { options.concurrency = 10; }

  var client = knox.createClient(aws);
  var waitTime = 0;
  var regexGzip = /\.([a-z]{2,})\.gz$/i;
  var regexGeneral = /\.([a-z]{2,})$/i;

  return streamToQueue(function (file, cb) {

      // Verify this is a file
      if (!file.isBuffer()) { return cb(null, file); }

      var uploadPath = file.path.replace(file.base, options.uploadPath || '');
      uploadPath = uploadPath.replace(new RegExp('\\\\', 'g'), '/');
      var headers = { 'x-amz-acl': 'public-read' };
      if (options.headers) {
          for (var key in options.headers) {
              headers[key] = options.headers[key];
          }
      }

      var hasGzipExtension = false;
      if (regexGzip.test(file.path)) {
          // Set proper encoding for gzipped files, remove .gz suffix
          headers['Content-Encoding'] = 'gzip';

          if (options.removeGzipExtension) {
            uploadPath = uploadPath.substring(0, uploadPath.length - 3);
          } else {
            hasGzipExtension = true;
          }
      } else if (options.gzippedOnly) {
        // Ignore non-gzipped files
        return cb(null, file);
      }

      // special case file extension handler for .gzipped files
      var sanitizedUploadPath = uploadPath;
      if (hasGzipExtension) {
        sanitizedUploadPath = uploadPath.substring(0, uploadPath.length - 3);
      }

      // Set content type based of file extension
      if (!headers['Content-Type'] && regexGeneral.test(sanitizedUploadPath)) {
        headers['Content-Type'] = mime.lookup(sanitizedUploadPath);
        if (options.encoding) {
          headers['Content-Type'] += '; charset=' + options.encoding;
        }
      }

      headers['Content-Length'] = file.stat.size;

      client.putBuffer(file.contents, uploadPath, headers, function(err, res) {
        if (err || res.statusCode !== 200) {
          gutil.log(gutil.colors.red('[FAILED]', file.path + " -> " + uploadPath));
          gutil.log(gutil.colors.red('[ERROR]', err));
        } else {
          gutil.log(gutil.colors.green('[SUCCESS]', file.path + " -> " + uploadPath));
          res.resume();
        }
        return cb(null, file);
      });
  }, options.concurrency);
};
