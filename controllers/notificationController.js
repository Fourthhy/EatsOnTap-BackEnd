import Notification from '../models/notification.js';

const generateNotification = async (req, res, next) => {
    try {
        const { type, description } = req.body;

        if (!type || !description) {
            return res.status(400).json({ message: "Type and Description are required." });
        }

        // 1. Save to Database
        const newNotif = new Notification({
            notificationType: type,
            description: description,
            date: new Date()
        });

        await newNotif.save();

        // 2. Emit Socket Event
        const io = req.app.get('socketio');
        if (io) {
            // Emitting the actual notification object so frontend can display it immediately
            io.emit('receive-notification', newNotif);
            console.log('🔔 Socket Emitted: New Notification');
        } else {
            console.error('❌ Socket.io not found in request');
        }

        res.status(201).json({
            message: "Notification created",
            data: newNotif
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
    markAsRead   
}