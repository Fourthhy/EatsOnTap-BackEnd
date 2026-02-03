const sendEmail = require('../utils/email');

// Example usage inside a controller
const notifyStudent = async (req, res, next) => {
    try {
        const studentEmail = "student@lvcc.edu.ph"; 
        
        await sendEmail({
            email: studentEmail,
            subject: 'Meal Eligibility Approved',
            template: 'notification', // matches notification.pug
            data: {
                firstName: 'John',
                message: 'Your section has been approved for free meals today. You may now claim your meal at the canteen.',
                url: 'http://localhost:3000/student/dashboard'
            }
        });

        res.status(200).json({ message: "Email sent!" });
    } catch (error) {
        console.error("Email error:", error);
        next(error);
    }
};