require("dotenv").config();
const express = require("express");
const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL;
const userRoutes = require("./routes/userRoutes");
const opportunityRoutes = require("./routes/opportunityRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const badgeRoutes = require("./routes/badgeRoutes");
const friendRoutes = require("./routes/friendRoutes")

const morgan = require("morgan")
const cors = require("cors");

const corsOptions = {
    origin: `${FRONTEND_URL}`,
};
app.use(cors(corsOptions));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"))

app.use(express.json());
app.use("/users", userRoutes);
app.use("/opportunities", opportunityRoutes);
app.use("/organizations", organizationRoutes);
app.use("/badges", badgeRoutes);
app.use("/friends", friendRoutes)

module.exports = app;
