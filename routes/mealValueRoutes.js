const express = require('express');
const router = express.Router();

const mealValueController = require('../controllers/mealValueController');

router.get('/getMealValue', mealValueController.getMealValue);

router.put('/updateMealValue', mealValueController.updateMealValue);

module.exports = router;