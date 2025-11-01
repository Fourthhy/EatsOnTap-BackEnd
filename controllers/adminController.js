import Users from '../models/user.js';
import eligibilityBasicEd from '../models/eligibilityBasicEd.js';
import eligibilityHigherEd from '../models/eligibilityHigherEd.js';
import event from "../models/event.js";

import claimPerMealCount from '../models/admin/claimPerMealCount.js';
import claimTrends from '../models/admin/claimTrends.js';
import eligibilityCount from '../models/admin/eligibilityCount.js';
import programStatusCount from '../models/admin/programStatusCount.js';

//Approving Meal Eligibility Request and Scheduled Meal Eligibiltiy Request

//Transforming Status from "PENDING" to "APPROVED"

//dito rin papasok yung 3rd setting, titignan nia kung naka enable ba na merong time mag bigay ng credit si PSAS

const approveMealEligibilityRequest = async (req, res) => {
    try {
        const eligibilityRequestList = await eligibilityBasicEd.findOne({ eligibilityID: req.params.eligibilityID });
        if (!eligibilityRequestList) {
            return res.status(404).json({ message: "meal eligibility list does not exist" });
        }
        eligibilityRequestList.status = 'APPROVED';
        await eligibilityRequestList.save()
        res.status(200).json({ message: `meal eligibility list ${eligibilityRequestList.eligibilityID} is now APPROVED` })
    } catch (error) {
        throw new Error(error.message);
    }
}

const approveScheduleMealEligibilityRequest = async (req, res) => {
    try {
        const eligibilityRequestList = await eligibilityHigherEd.findOne({ eligibilityID: req.params.eligibilityID });
        if (!eligibilityRequestList) {
            return res.status(404).json({ message: "meal eligibility list does not exist" });
        }
        eligibilityRequestList.status = 'APPROVED';
        await eligibilityRequestList.save()
        res.status(200).json({ message: `meal eligibility list ${eligibilityRequestList.eligibilityID} is now APPROVED` })
    } catch (error) {
        throw new Error(error.message);
    }
}

const approveEvents = async (req, res) => {
    try {
        const schoolEvent = await event.findOne({ eventID: req.params.eventID });
        if (!schoolEvent) {
            res.status(404).json({ message: "No such event exist!" });
        }
        schoolEvent.status = 'APPROVED';
        await schoolEvent.save()
        res.status(200).json({ message: `${schoolEvent.eventName} event is now approved!` });
    } catch (error) {
        throw new Error(error)
    }
}

const fetchClaimPerMealCount = async (req, res, next) => {
  try {
    // Get values from request (adjust source as needed: query, params, or body)
    const { entryDay, entryMonth, entryYear } = req.query;

    // Build a query object—Parse to Number if these come in as strings!
    const query = {};
    if (entryDay != null) query.entryDay = Number(entryDay);
    if (entryMonth != null) query.entryMonth = Number(entryMonth);
    if (entryYear != null) query.entryYear = Number(entryYear);

    // Perform the search
    const claimCount = await claimPerMealCount.findOne(query);

    if (!claimCount) {
      return res.status(404).json({ message: "No record found!" });
    }

    res.status(200).json(claimCount);
  } catch (error) {
    next(error);
  }
};




export {
    approveMealEligibilityRequest,
    approveScheduleMealEligibilityRequest,
    approveEvents
}