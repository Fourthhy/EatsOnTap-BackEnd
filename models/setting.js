const mongoose = require('mongoose');

const settingSchema =  new mongoose.Schema({
    setting: { type: String, required: true, enum: ['STUDENT-CLAIM', 'SUBMIT-MEAL-REQUEST', 'SCHEDULE-ASSIGN-CREDITS', 'REMOVE-CREDITS'] },
    settingActive: { type: Boolean, required: true }, //the first being checked if the setting is enabled to be used
    settingEnable: { type: Boolean, required: true }, //the scheduled setting, the scheduler will still work even if the settingEnable is false
    startMinute: { type: String, required: true },
    endMinute: { type: String, required: true },
    startHour: { type: String, required: true }, //accepts military time, and span
    endHour: { type: String, required: true }, //accepts military time, and span
    startDay: { type: String, required: true }, //1-31, but it has a validation on the months that have 30 days and 31 days, especially february that has a leap year day
    endDay: { type: String, required: true }, //1-31, but it has a validation on the months that have 30 days and 31 days, especially february that has a leap year day
    startMonth: { type: String, required: true }, //1-12
    endMonth: { type: String, required: true }, //1-12
    startDayOfWeek: { type: String, required: true }, //0-6 //has a validation
    endDayOfWeek: { type: String, required: true }, //0-6 //has a validation
});

//all setting must have a validation first if the input is within the valid ranges.

/* if SCHEDULE-ASSIGN-CREDITS is True: then the admin must set the time that the system will automatically give students their credits, 
must not be late than 9:30 am */ 

/* STUDENT-CLAIM setting enables if the student is able use their eligibility to claim free meal and food items */
/* SUBMIT-MEAL-REQUEST setting determines what time class advisers can submit their meals */
/*SCHEDULE-ASSIGN-CREDITS setting determine what time the system can assign credits */
/*REMOVE-CREDITS setting determine what time the system can remove credits */


module.exports = mongoose.model('Setting', settingSchema);

