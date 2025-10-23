const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

//Router for user login
router.post('/login', authController.loginUser);

//Router for user logout
router.post('/logout', authController.logoutUser);

//Router for class adviser login
router.post('/loginClassAdviser', authController.loginClassAdviser);

//Router for class adviser logout
router.post('/logoutClassAdviser', authController.logoutClassAdviser);

module.exports = router;