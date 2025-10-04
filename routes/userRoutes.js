const express = require('express');
const router = express.Router();

const usercontroller = require('../controllers/usercontroller');

const upload = require('../middlewares/multer.js').default;

//New route for adding users
router.post('/', usercontroller.createUser);

//New route for getting all users
router.get('/', usercontroller.getUsers);

//New route for adding users using CSV
router.post('/usingCSV', upload.single('user_information'), usercontroller.createUsersFromCSV)

module.exports = router;