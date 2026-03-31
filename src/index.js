require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/DB");

const userRoutes = require("./routes/user.route");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// connect DB
connectDB();

// routes
app.use("/api/users", userRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));