

































function semCache(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.json = (body) => {
    if (!res.get('Content-Type')) res.type('application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  next();
}

module.exports = { semCache };
