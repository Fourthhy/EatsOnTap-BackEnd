// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

// Middleware to check for a valid JWT
const authSecurity = (req, res, next) => {
  let token;

  //Check if token exists in headers
  // The token is usually sent as: Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header (split "Bearer <token>" and take the second element)
      token = req.headers.authorization.split(' ')[1];

      //Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user data to the request object
      // We don't fetch the full user document from the DB here for performance, 
      // but we attach the essential data from the token's payload.
      req.user = decoded; 
      
      // Move to the next middleware or controller function
      next();
    } catch (error) {
      // This catches errors like invalid signature or token expiration
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed or expired.' });
    }
  }

  // If no token is provided at all
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }
};

// Middleware to authorize FOOD-SERVER role
const foodServerAuth = (req, res, next) => {
    // req.user is available here thanks to the 'authSecurity' middleware
    if (req.user && req.user.role === 'FOOD-SERVER') {
        next(); // Authorized, proceed to controller
    } else {
        // 403 Forbidden status code
        res.status(403).json({ message: 'Forbidden: Only FOOD-SERVER can perform this action.' });
    }
};

// Middleware to authorize CANTEEN-STAFF role
const canteenStaffAuth = (req, res, next) => {
    // req.user is available here thanks to the 'authSecurity' middleware
    if (req.user && req.user.role === 'CANTEEN-STAFF') {
        next(); // Authorized, proceed to controller
    } else {
        // 403 Forbidden status code
        res.status(403).json({ message: 'Forbidden: Only CANTEEN-STAFF can perform this action.' });
    }
};

export { 
    authSecurity,
    foodServerAuth,
    canteenStaffAuth
 };