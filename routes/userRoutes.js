const express = require('express');
const router = express.Router();

const usercontroller = require('../controllers/usercontroller')

//New route for creating users
router.post('/create-user', usercontroller.createUser);

//New route for getting all users
router.get('/users', usercontroller.getUsers);

module.exports = router;