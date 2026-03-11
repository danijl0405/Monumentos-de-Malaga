var express = require('express');
var path = require('path');

var router = express.Router();
var APP_TITLE = 'Monumentos de Malaga';
var FOOTER_TEXT = 'Examen de Daniel Jimenez Luque - 2DAW - Malaga';

router.get('/', function(req, res) {
  res.render('index', {
    title: APP_TITLE,
    footerText: FOOTER_TEXT
  });
});

router.get('/api/monumentos', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'monumentos.geojson'));
});

router.post('/api/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  if (username === 'admin' && password === '1234') {
    return res.json({
      success: true,
      username: 'admin'
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Credenciales incorrectas'
  });
});

module.exports = router;
