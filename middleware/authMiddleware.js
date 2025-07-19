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

   
    req.user = decoded; // e.g., { userId, mobile, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: 'Invalid or expired token.',
      error: err.message
    });
  }
};


// exports.verifyAdmin = (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({
//         status: false,
//         message: 'Authorization token missing or invalid.',
//       });
//     }

//     const token = authHeader.split(' ')[1];
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     if (decoded.role !== 'admin') {
//       return res.status(403).json({
//         status: false,
//         message: 'Access denied. Admins only.',
//       });
//     }

//     req.user = decoded; // { userId, role, ... }
//     next();
//   } catch (err) {
//     return res.status(401).json({
//       status: false,
//       message: 'Invalid or expired token.',
//       error: err.message,
//     });
//   }
// };


// middleware/authMiddleware.js (add this below verifyToken)

exports.verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next(); // user is admin
  } else {
    return res.status(403).json({
      status: false,
      message: 'Access denied. Admins only.'
    });
  }
};


