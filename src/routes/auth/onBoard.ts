import { Router } from "express";
import { User } from "../../models/User";
import {
  generateToken,
  authenticateToken,
  AuthRequest,
} from "../../middleware/auth";

const auth = Router();

// Signup endpoint
auth.post("/signup", async (req: any, res: any) => {
  try {
    const { username, email, password } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required",
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Check if user already exists by email or username
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email or username already exists",
      });
    }

    // Create new user
    const newUser = new User({
      username,
      email: email.toLowerCase(),
      password,
    });

    const savedUser = await newUser.save();

    // Generate JWT token
    const token = generateToken((savedUser._id as any).toString());

    res.status(201).json({
      success: true,
      message: "User created successfully",
      token,
      user: {
        id: (savedUser._id as any).toString(),
        username: savedUser.username,
        email: savedUser.email,
      },
    });
  } catch (error: any) {
    console.error("Signup error:", error);

    // Handle mongoose validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Login endpoint
auth.post("/login", async (req: any, res: any) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username

    // Validate required fields
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/username and password are required",
      });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = generateToken((user._id as any).toString());

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: (user._id as any).toString(),
        username: user.username,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get current user (protected route)
auth.get(
  "/me",
  authenticateToken as any,
  async (req: AuthRequest, res: any) => {
    try {
      res.json({
        success: true,
        user: req.user,
      });
    } catch (error: any) {
      console.error("Get user error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Logout (client-side should remove token, but this endpoint can be used for logging)
auth.post("/logout", authenticateToken as any, (req: AuthRequest, res: any) => {
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

export default auth;
