const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  try {
   
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: 'Authorization token missing or invalid.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

   
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: 'Invalid or expired token.',
      error: err.message
    });
  }
};


exports.verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next(); 
  } else {
    return res.status(403).json({
      status: false,
      message: 'Access denied. Admins only.'
    });
  }
};

exports.verifyEmployerOnly = (req, res, next) => {
  const role = req.user?.role;

  if (role === "employer") {
    next(); 
  } else {
    return res.status(403).json({
      status: false,
      message: "Access denied. Employers only."
    });
  }
};

exports.verifyJobSeekerOnly = (req, res, next) => {
  const role = req.user?.role;

  if (role === "job_seeker") {
    next(); 
  } else {
    return res.status(403).json({
      status: false,
      message: "Access denied. Job seekers only."
    });
  }
};





