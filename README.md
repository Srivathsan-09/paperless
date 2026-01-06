# Paperless - Backend Authentication System

A secure multi-user authentication system for the Paperless web application using Google OAuth 2.0 and JWT tokens.

## Features

- ✅ Google Sign-In authentication (OAuth 2.0)
- ✅ JWT-based authentication (no sessions)
- ✅ Multi-user support with data isolation
- ✅ MongoDB database integration
- ✅ Automatic user creation and login tracking
- ✅ Secure token management (7-day expiration)

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **Passport.js** - Authentication middleware
- **passport-google-oauth20** - Google OAuth strategy
- **jsonwebtoken** - JWT token generation

## Project Structure

```
PLS - Copy/
├── config/
│   ├── db.js              # MongoDB connection
│   └── passport.js        # Passport Google OAuth strategy
├── models/
│   └── User.js            # User schema and model
├── routes/
│   └── auth.js            # Authentication routes
├── server.js              # Main Express server
├── .env                   # Environment variables (DO NOT COMMIT)
├── .env.example           # Environment variables template
├── .gitignore             # Git ignore file
└── package.json           # Dependencies and scripts
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` file:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
JWT_SECRET=your_super_secret_jwt_key_here
MONGODB_URI=mongodb://localhost:27017/Paperless
PORT=5000
FRONTEND_URL=http://localhost:5000
```

### 3. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen
6. Add authorized redirect URI: `http://localhost:5000/auth/google/callback`
7. Copy **Client ID** and **Client Secret** to `.env` file

### 4. Start MongoDB

Make sure MongoDB is running locally:

```bash
# Windows
mongod

# macOS/Linux
sudo systemctl start mongod
```

Or use MongoDB Atlas (cloud) and update `MONGODB_URI` in `.env`

### 5. Run the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## API Endpoints

### Authentication Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth login |
| GET | `/auth/google/callback` | OAuth callback (handles redirect) |
| GET | `/auth/logout` | Logout endpoint |
| GET | `/auth/login-failed` | Login failure handler |

### Root Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information and available endpoints |

## Authentication Flow

1. **User clicks "Continue with Google"** on frontend
   - Frontend redirects to: `http://localhost:5000/auth/google`

2. **Google OAuth consent screen**
   - User signs in with Google account
   - Grants permissions (profile, email)

3. **Callback handling**
   - Google redirects to: `/auth/google/callback`
   - Backend checks if user exists in MongoDB:
     - **Existing user**: Updates `lastLogin` timestamp
     - **New user**: Creates new user document

4. **JWT token generation**
   - Server generates JWT with user's `_id` and `email`
   - Token expires in 7 days

5. **Redirect to dashboard**
   - User redirected to: `/dashboard?token=<JWT_TOKEN>`
   - Frontend stores token and uses it for authenticated requests

## Database Schema

### Users Collection

```javascript
{
  googleId: String,      // Unique Google account ID
  name: String,          // User's full name
  email: String,         // User's email (unique)
  profilePic: String,    // Profile picture URL
  createdAt: Date,       // Account creation timestamp
  lastLogin: Date        // Last login timestamp
}
```

## Security Features

- ✅ **No password storage** - Uses Google OAuth only
- ✅ **No Google tokens stored** - Access tokens are never saved
- ✅ **JWT secrets from env** - Sensitive data in environment variables
- ✅ **CORS protection** - Configured for specific frontend URL
- ✅ **Session-less** - Stateless JWT authentication
- ✅ **Token expiration** - 7-day automatic expiration
- ✅ **.env in .gitignore** - Prevents credential leaks

## Frontend Integration

### Login Button

```html
<a href="http://localhost:5000/auth/google" class="google-login-btn">
  Continue with Google
</a>
```

### Handling Token on Dashboard

```javascript
// Extract token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
  // Store token in localStorage or memory
  localStorage.setItem('authToken', token);
  
  // Remove token from URL
  window.history.replaceState({}, document.title, '/dashboard');
}
```

### Making Authenticated Requests

```javascript
// Add token to request headers
fetch('/api/expenses', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
})
```

## Testing

### 1. Test Server Startup

```bash
npm start
```

Expected output:
```
MongoDB connected successfully: localhost
Database: Paperless
🚀 Server running on port 5000
📍 API URL: http://localhost:5000
🔐 Google OAuth: http://localhost:5000/auth/google
```

### 2. Test Google OAuth Flow

1. Navigate to: `http://localhost:5000/auth/google`
2. Sign in with Google account
3. Should redirect to: `http://localhost:5000/dashboard?token=<JWT>`

### 3. Verify Database

```bash
# Connect to MongoDB
mongosh

# Switch to Paperless database
use Paperless

# View users
db.users.find().pretty()
```

### 4. Decode JWT Token

Visit [jwt.io](https://jwt.io) and paste your token to verify:
- Contains user `id` and `email`
- Expires in 7 days

## Troubleshooting

### MongoDB Connection Error

**Error:** `Error connecting to MongoDB`

**Solution:**
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `.env` file
- For MongoDB Atlas, ensure IP whitelist is configured

### Google OAuth Error

**Error:** `redirect_uri_mismatch`

**Solution:**
- Verify redirect URI in Google Cloud Console matches exactly:
  `http://localhost:5000/auth/google/callback`
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

### JWT Secret Error

**Error:** `secretOrPrivateKey must have a value`

**Solution:**
- Ensure `JWT_SECRET` is set in `.env` file
- Restart the server after updating `.env`

## Future Enhancements

- [ ] JWT verification middleware for protected routes
- [ ] Refresh token implementation
- [ ] User profile update endpoints
- [ ] Account deletion endpoint
- [ ] Rate limiting for authentication routes
- [ ] Email verification (optional)

## License

ISC

## Author

Paperless Team

---

**Note:** Never commit the `.env` file to version control. Always use `.env.example` as a template.
