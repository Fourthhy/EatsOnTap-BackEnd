const express = require('express');
const router = express.Router();

const usercontroller = require('../controllers/usercontroller');
const notificationController = require('../controllers/notificationController.js');

const upload = require('../middlewares/multer.js').default;

//New route for adding users
router.post('/addUser', usercontroller.addUser);

//New route for getting all users
router.get('/getAllUsers', usercontroller.getAllUsers);

//New route for adding users using CSV
router.post('/usingCSV', upload.single('user_information'), usercontroller.createUsersFromCSV)

//New route for resetting user password
router.put('/resetPassword', usercontroller.resetUserPassword)

//New route for editing user name
router.put('/editName', usercontroller.editName);

//Route for marking notifications as read
router.post('/markAsRead', notificationController.markAsRead);

module.exports = router;