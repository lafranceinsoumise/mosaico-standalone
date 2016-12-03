'use strict';

const gm = require('gm').subClass({imageMagick: true});
const request = require('request');

module.exports = (req, res, next) => {
  var [width, height] = req.query.params.split(',');

  if (req.query.method == 'placeholder') {
    var out = gm(width, height, '#707070');
    res.set('Content-Type', 'image/png');
    var x = 0, y = 0;
    var size = 40;
    // stripes
    while (y < height) {
      out = out
        .fill('#808080')
        .drawPolygon([x, y], [x + size, y], [x + size*2, y + size], [x + size*2, y + size*2])
        .drawPolygon([x, y + size], [x + size, y + size*2], [x, y + size*2]);
      x = x + size*2;
      if (x > width) { x = 0; y = y + size*2; }
    }
    // text
    out = out.fill('#B0B0B0').fontSize(20).drawText(0, 0, width + ' x ' + height, 'center');
    out.stream('png').pipe(res);

    return;
  }

  if (req.query.method === 'resize') {
    var ir = gm(request(req.query.src));
    ir.format({bufferStream: true}, (err, format) => {
      if (err) return next(err);

      res.set('Content-Type', 'image/'+format.toLowerCase());
      ir.autoOrient().resize(width == 'null' ? null : width, height == 'null' ? null : height).stream().pipe(res);
    });

    return;
  }

  if (req.query.method === 'cover') {
    var ic = gm(request(req.query.src));
    ic.format({bufferStream: true}, (err,format) => {
      if (err) return next(err);

      res.set('Content-Type', 'image/'+format.toLowerCase());
      ic.autoOrient().resize(width,height+'^').gravity('Center').extent(width, height+'>').stream().pipe(res);
    });

    return;
  }
};
