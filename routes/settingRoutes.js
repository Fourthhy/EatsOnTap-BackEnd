const express = require('express');
const router = express.Router();

const settingController = require('../controllers/settingController');

router.post('/createDefaultSetting', settingController.createDefaultSetting);

router.get('/fetchSetting/:settingName', settingController.fetchSetting);

router.put('/enableSetting/:SETTING_NAME', settingController.enableSetting);

router.put('/disableSetting/:SETTING_NAME', settingController.disableSetting);

router.put('/editSetting', settingController.editSetting);

router.get('/fetchAllSettings', settingController.fetchAllSettings);

module.exports = router;