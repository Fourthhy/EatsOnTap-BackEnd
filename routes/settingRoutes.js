const express = require('express');
const router = express.Router();

const setttingController = require('../controllers/settingController');

router.post('/createDefaultSetting', setttingController.createDefaultSetting);

router.get('/seeSetting/:SETTING_NAME', setttingController.fetchSetting);

router.put('/enableSetting/:SETTING_NAME', setttingController.enableSetting);

router.put('/disableSetting/:SETTING_NAME', setttingController.disableSetting);

router.put('/editSetting', setttingController.editSetting);

module.exports = router;