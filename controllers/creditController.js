import Credit from "../models/credit.js";

const creditImport = async (req, res, next) => {
    try {
        const credit = new Credit(req.body);
        await credit.save();
        res.status(201).json(credit);
    } catch (error) {
        next(error)
    }
}

export {creditImport}