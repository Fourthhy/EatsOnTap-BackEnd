import Notification from '../models/notification.js';

const addNotification = async (type, description, io = null) => {
    try {
        console.log(`🔔 Generating Notification: [${type}] ${description}`);

        // 1. Save to Database
        const newNotif = new Notification({
            notificationType: type, // Ensure model expects String or Array based on your schema
            description: description,
            date: new Date()
        });

        await newNotif.save();

        // 2. Emit Socket Event (Only if IO is provided)
        if (io) {
            io.emit('receive-notification', newNotif);
            console.log('📡 Socket Emitted to Client');
        }

        return newNotif; // Return the object so the caller can use it

    } catch (error) {
        console.error("❌ Error in addNotification:", error);
        throw error; 
    }
};

const generateNotification = async (req, res, next) => {
    try {
        const { type, description } = req.body;

        if (!type || !description) {
            return res.status(400).json({ message: "Type and Description are required." });
        }

        // Get the socket instance from Express
        const io = req.app.get('socketio');

        // Call the logic function
        const data = await addNotification(type, description, io);

        res.status(201).json({
            message: "Notification created",
            data: data
        });

    } catch (error) {
        next(error);
    }
};

const fetchNotifications = async (req, res, next) => {
    try {
        // 1. Fetch Last 10 Notifications (Sorted Newest First)
        const rawNotifications = await Notification.find()
            .sort({ date: -1 })
            .limit(10);

        // 2. Grouping Logic
        const groupedResult = [];

        rawNotifications.forEach((notif) => {
            const d = new Date(notif.date);
            
            // Create a comparable key object
            const dateKey = {
                month: d.getMonth() + 1, // JS months are 0-11
                day: d.getDate(),
                year: d.getFullYear()
            };

            // Check if the last group in our array belongs to this same date
            const lastGroup = groupedResult[groupedResult.length - 1];

            // Helper to check date equality
            const isSameDate = lastGroup && 
                lastGroup.Date.month === dateKey.month &&
                lastGroup.Date.day === dateKey.day &&
                lastGroup.Date.year === dateKey.year;

            if (isSameDate) {
                // Add to existing group
                lastGroup.notifications.push(notif);
            } else {
                // Create new group
                groupedResult.push({
                    Date: dateKey,
                    notifications: [notif]
                });
            }
        });

        res.status(200).json(groupedResult);

    } catch (error) {
        next(error);
    }
};

// Optional: Mark as Read function
const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.body;
        await Notification.findByIdAndUpdate(id, { isRead: true });
        res.status(200).json({ message: "Marked as read" });
    } catch (error) {
        next(error);
    }
}

export {
    generateNotification,
    fetchNotifications,
    markAsRead,
    addNotification
}