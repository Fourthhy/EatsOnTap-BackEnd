const express = require('express');
const router = express.Router();

const usercontroller = require('../controllers/usercontroller')

//New route for creating users
router.post('/user/create-user', usercontroller.createUser);

//New route for getting users
router.get('/user/users', usercontroller.getUsers);

module.exports = router;