import Notification from '../models/notification.js';
import moment from "moment-timezone";

const NOTIFICATION_PERMISSIONS = {
    "Meal Request": ["ADMIN"],
    "Event Creation": ["ADMIN", "CHANCELLOR"],
    "Export Report": ["ADMIN", "CHANCELLOR"],
    "Setting Change": ["ADMIN", "SUPER-ADMIN", "CHANCELLOR"],
    "Upcoming Event": ["ADMIN", "ADMIN-ASSISTANT", "CHANCELLOR"],
    "Update Student Registry": ["ADMIN", "ADMIN-ASSISTANT", "SUPER-ADMIN", "CHANCELLOR"],
    "Event Credit Bestowment": ["ADMIN", "ADMIN-ASSISTANT", "CHANCELLOR"]
};

/**
 * Adds a notification to a specific date group.
 * @param {string} type - The notification type
 * @param {string} description - The specific notification details.
 */
const addNotification = async (type, description) => {
    // 1. Get current UTC time and add exactly 8 hours (in milliseconds)
    const phTimeOffset = 8 * 60 * 60 * 1000;
    const phTime = new Date(Date.now() + phTimeOffset);

    // 2. Set 'today' to exactly midnight of the Philippine day.
    const today = new Date(Date.UTC(
        phTime.getUTCFullYear(),
        phTime.getUTCMonth(),
        phTime.getUTCDate()
    ));

    // Look up the required roles based on the type
    const targetAudience = NOTIFICATION_PERMISSIONS[type] || [];

    return await Notification.findOneAndUpdate(
        { date: today },
        {
            $push: {
                data: {
                    notificationType: [type],
                    description: description,
                    targetRoles: targetAudience,
                    time: phTime,
                    readBy: [] // 🟢 THE FIX: Initialized as an empty array to match your Schema
                }
            }
        },
        { upsert: true, new: true, runValidators: true }
    );
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
        const userRole = req.body.role;
        const currentUserID = req.body.userID;

        if (!userRole) {
            return res.status(400).json({ message: "Please provide a role." });
        }

        // 2. Gather the matched keys (Which notification types can this role see?)
        // Object.keys() creates an array of all the types, then we filter it
        const allowedTypes = Object.keys(NOTIFICATION_PERMISSIONS).filter(type =>
            NOTIFICATION_PERMISSIONS[type].includes(userRole)
        );

        // 3. The Aggregation Pipeline
        const aggregatedDocs = await Notification.aggregate([
            { $unwind: "$data" },

            // SEARCH BY TYPE: Only keep notifications whose type is in our 'allowedTypes' array
            { $match: { "data.notificationType": { $in: allowedTypes } } },

            { $sort: { "data.time": -1 } },
            { $limit: 20 }, // LIMIT TO 30
            {
                $group: {
                    _id: "$date",
                    data: { $push: "$data" }
                }
            },
            { $sort: { "_id": -1 } }
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 4. Format the Output
        const formattedResult = aggregatedDocs.map((group) => {
            const groupDate = new Date(group._id);
            groupDate.setHours(0, 0, 0, 0);

            let dateLabel = (groupDate.getTime() === today.getTime())
                ? "Today"
                : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(groupDate);

            const formattedData = group.data.map(item => ({
                notificationId: item._id,
                notificationType: item.notificationType[0],
                description: item.description,
                isRead: currentUserID ? item.readBy.includes(currentUserID) : false,
                time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'UTC' }).format(new Date(item.time))
            }));

            return {
                date: dateLabel,
                data: formattedData
            };
        });

        res.status(200).json(formattedResult);
    } catch (error) {
        next(error);
    }
};

const markAsRead = async (req, res, next) => {
    try {
        // Grab the array of IDs and the userID from the request body
        const { notificationIds, userID } = req.body;

        if (!notificationIds || !Array.isArray(notificationIds) || !userID) {
            return res.status(400).json({ message: "Please provide an array of notificationIds and a userID." });
        }

        if (notificationIds.length === 0) {
            return res.status(200).json({ message: "No notifications to update." });
        }

        // 🟢 THE FIX: Bulk update multiple subdocuments at once
        await Notification.updateMany(
            { "data._id": { $in: notificationIds } }, // Find documents containing these IDs
            { $addToSet: { "data.$[elem].readBy": userID } }, // Add user to readBy
            { arrayFilters: [{ "elem._id": { $in: notificationIds } }] } // Apply only to the specific array elements
        );

        res.status(200).json({ message: "Notifications marked as read!" });
    } catch (error) {
        next(error);
    }
};

export {
    generateNotification,
    fetchNotifications,
    markAsRead,
    addNotification
}