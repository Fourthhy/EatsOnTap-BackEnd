import User from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken"

import classAdviser from "../models/classAdviser.js";

//function to generate the jwt
const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1d', //token expires in 1 day
    });
}

const loginUser = async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    //Check if user exists and if the password matches
    if (user && (await bcrypt.compare(password, user.password))) {
        res.json({
            userID: user.userID,
            email: user.email,
            role: user.role,
            token: generateToken(user), // <- this is the token key, please take note of that   
        });
    } else {
        res.status(404).json({ message: "Invalid Token " });
    }
}

const logoutUser = async (req, res) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 5 * 1000), // set to expire immediately
        httpOnly: true,
    });
    res.status(200).json({ success: true, message: 'User logged out' });
}

const loginClassAdviser = async (req, res) => {
    const { email, password } = req.body;

    const adviser = await classAdviser.findOne({ email });

    if (adviser && (await bcrypt.compare(password, adviser.password))) {
        res.json({
            userID: adviser.userID,
            email: adviser.email,
            section: adviser.section,
            token: generateToken(adviser)
        })
    } else {
        res.status(404).json({ message: "Invalid token" })
    }
}

const logoutClassAdviser = async (req, res) => {
    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 5 * 1000),
        httpOnly: true
    });
    res.status(200).json({ success: true, message: 'User Logged out' });
}

export {
    loginUser,
    logoutUser,
    loginClassAdviser,
    logoutClassAdviser
}