const mongoose = require('mongoose');

const systemLoggerSchema = new mongoose.Schema({
    // 1. WHO (The Actor)
    // We store the ID and the Model Name so we know which collection to look in.
    actor: {
        id: { 
            type: mongoose.Schema.Types.ObjectId, 
            required: true,
            refPath: 'actor.type' // Dynamic reference based on 'type' field below
        },
        type: { 
            type: String, 
            required: true, 
            enum: ['User', 'ClassAdviser', 'Student'] // The 3 types of people in your app
        },
        name: { type: String }, // Snapshot of name (useful if user is later deleted)
        role: { type: String }  // e.g., 'ADMIN', 'ADVISER', 'BENEFICIARY'
    },

    // 2. WHAT (The Action)
    action: {
        type: String,
        required: true,
        enum: [
            'LOGIN', 
            'LOGOUT', 
            'CLAIM_MEAL',      // Free meal claim
            'CLAIM_ITEM',      // Specific food item claim
            'SUBMIT_LIST',     // Adviser submitting list
            'ACCEPT_LIST',     // Admin accepting list
            'ERROR'            // General fallback for failures
        ]
    },

    // 3. CONTEXT (Flexible Metadata)
    // Stores details specific to the action type
    metadata: {
        // For Claims
        mealType: { type: String }, // e.g., "LUNCH", "BREAKFAST"
        items: [{ type: String }],  // e.g., ["Rice", "Chicken Adobo"]
        
        // For Lists (Submit/Accept)
        referenceID: { type: String }, // The ID of the List/Event involved
        affectedCount: { type: Number }, // How many students were in the list?
        
        // General
        ipAddress: { type: String },
        device: { type: String },
        description: { type: String } // Human-readable summary
    },

    // 4. STATUS
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'WARNING'],
        default: 'SUCCESS'
    }

}, { 
    timestamps: true // Automatically creates 'createdAt' (The Timestamp)
});

// Indexing for faster history searching
systemLoggerSchema.index({ 'actor.id': 1, createdAt: -1 }); 
systemLoggerSchema.index({ action: 1 }); 

module.exports = mongoose.model('SystemLogger', systemLoggerSchema);