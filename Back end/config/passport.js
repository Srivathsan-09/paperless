const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

// 🔍 DEBUG (TEMPORARY – DO NOT REMOVE UNTIL IT WORKS)
console.log("GOOGLE_CLIENT_ID =>", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET =>", process.env.GOOGLE_CLIENT_SECRET);

module.exports = function () {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:5000/auth/google/callback",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const { id, displayName, emails, photos } = profile;
          const mode = req.query.state || 'login'; // Default to login if undefined
          console.log(`Google Auth Callback | Mode: ${mode} | Google ID: ${id} | Email: ${emails[0].value}`);

          let user = await User.findOne({ googleId: id });

          if (!user) {
            // STRICT ENFORCEMENT: ONLY 'signup' mode creates a user
            if (mode === 'signup') {
              console.log(`✅ Mode is SIGNUP & User not found -> Creating new account for: ${emails[0].value}`);
              user = await User.create({
                googleId: id,
                name: displayName,
                email: emails[0].value,
                profilePic: photos?.[0]?.value || "",
                createdAt: new Date(),
                lastLogin: new Date(),
              });
              // Flag this as a new user for the frontend redirect logic
              user.isNewUser = true;
            } else {
              // mode is 'login' or unspecified, but account doesn't exist
              console.warn(`❌ Login failed: Account not found for ${emails[0].value} (Mode: ${mode})`);
              return done(null, false, { message: 'Account not found. Please sign up first.' });
            }
          } else {
            console.log(`✅ User found: ${user.email}. Logging in...`);
            user.lastLogin = new Date();
            await user.save();
          }

          return done(null, user);
        } catch (err) {
          console.error("Google OAuth Error:", err);
          return done(err, null);
        }
      }
    )
  );
};
