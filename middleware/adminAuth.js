module.exports = function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return next();
  const cookie = req.cookies && req.cookies.admin_session;
  if (cookie === password) return next();
  res.status(401).json({ error: 'Unauthorized' });
};
