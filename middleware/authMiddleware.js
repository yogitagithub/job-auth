const jwt = require('jsonwebtoken');
const User = require('../models/User');




exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: false, message: 'Authorization token missing or invalid.' });
    }

    // Bearer <token>
    const token = authHeader.slice(7).trim();

    // 1) Verify JWT signature + expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      // decoded -> { userId, phoneNumber, role, iat, exp }
    } catch (err) {
      return res.status(401).json({ status: false, message: 'Invalid or expired token.', error: err.message });
    }

    // 2) Ensure this token is the active session for the user
    const user = await User.findById(decoded.userId).select('_id role token');
    if (!user) {
      return res.status(401).json({ status: false, message: 'User not found.' });
    }
    if (!user.token || user.token !== token) {
      // Token was cleared on logout or rotated on re-login
      return res.status(401).json({ status: false, message: 'Session expired. Please log in again.' });
    }

    // Attach to request for downstream handlers
    req.user = { userId: String(user._id), role: user.role, phoneNumber: decoded.phoneNumber };
    req.token = token;

    return next();
  } catch (err) {
    return res.status(401).json({ status: false, message: 'Unauthorized.', error: err.message });
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





