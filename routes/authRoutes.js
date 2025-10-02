const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

//Router for user login
router.post('/login', authController.loginUser);

//Router for user logout
router.post('/logout', authController.logoutUser);

module.exports = router;