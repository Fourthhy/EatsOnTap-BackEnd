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
 * @param {Date} groupDate - The date document to target (e.g., today's date).
 * @param {Object} notificationData - The specific notification details.
 */
const addNotification = async (type, description) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Look up the required roles based on the type
    const targetAudience = NOTIFICATION_PERMISSIONS[type] || [];

    return await Notification.findOneAndUpdate(
        { date: today },
        {
            $push: {
                data: {
                    notificationType: [type],
                    description: description,
                    targetRoles: targetAudience, // Inject the roles directly into the DB
                    time: new Date(),
                    isRead: false
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

const fetchNotification = async (req, res, next) => {
    try {
        // 0. Safety Check
        if (!req.user || !req.user.role || !req.user._id) {
            return res.status(401).json({ message: "Unauthorized: User information is missing." });
        }
        // 1. Fetch the documents from the DB
        // We use .lean() to get plain JS objects, making it easier to manipulate
        const rawDocs = await Notification.find()
            .sort({ date: -1 })
            .limit(10)
            .lean();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 2. Map through each document (which represents a day)
        const formattedResult = rawDocs.map((doc) => {
            const docDate = new Date(doc.date);
            docDate.setHours(0, 0, 0, 0);

            // Determine if the label should be "Today"
            let dateLabel;
            if (docDate.getTime() === today.getTime()) {
                dateLabel = "Today";
            } else {
                dateLabel = new Intl.DateTimeFormat('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                }).format(docDate);
            }

            // 3. Map through the INNER 'data' array from your schema
            const filteredAndFormattedData = doc.data
                .filter(item => item.targetRoles && item.targetRoles.includes(req.user.role))
                .map(item => ({
                    notificationId: item._id,
                    notificationType: item.notificationType[0],
                    description: item.description,
                    // Check if THIS user has read it
                    isRead: item.readBy.some(id => id.toString() === req.user._id.toString()),
                    time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(new Date(item.time))
                }));

            return {
                date: dateLabel,
                data: filteredAndFormattedData // This will now contain your notifications
            };
        });

        res.status(200).json(formattedResult);
    } catch (error) {
        next(error);
    }
};

const fetchNotifications = async (req, res, next) => {
    try {
        const userRole = req.query.role || req.body.role || (req.user && req.user.role);
        const currentUserID = req.query.userID || req.body.userID || (req.user && req.user.userID);

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
                time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(new Date(item.time))
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
        // Grab the IDs from the request body
        const { notificationId, userID } = req.body;

        if (!notificationId || !userID) {
            return res.status(400).json({ message: "Missing notificationId or userID" });
        }

        const updatedDoc = await Notification.findOneAndUpdate(
            { "data._id": notificationId },
            {
                // $addToSet acts like $push, but prevents duplicate entries!
                $addToSet: { "data.$.readBy": userID }
            },
            { new: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({ message: "Notification not found." });
        }

        res.status(200).json({ message: "Notification marked as read!" });
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