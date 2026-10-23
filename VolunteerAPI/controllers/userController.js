const prisma = require('../db/db'); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('../firebase/firebaseAdmin');
const sgMail = require('@sendgrid/mail');
const { getLevelFromPoints, pointsForOpportunity } = require('../lib/gamification');
const { BADGES, awardBadges, badgesForApplication } = require('../lib/badges');
sgMail.setApiKey(process.env.VITE_SENDGRID_API_KEY);

exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { points: 'desc' },
            include: {
                opportunities: true,
                savedOpportunities: true,
                badges: true,
            },
        });
        const rankedUsers = users.map((user, index) => ({
        ...user,
        leaderboardRank: index + 1,
        }));

        res.json(rankedUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ error : "Internal server error" });
    }
};


exports.getUserById = async (req, res) => {
    try {
    const userId = Number(req.params.id);
    const user = await prisma.user.findUnique({
        where : {id : userId},
        include: {
            opportunities: true,
            savedOpportunities: true, 
            badges: true,
        }
    });
    if (!user) {
        return res.status(404).json({ error : "User not found" });
    }
    return res.json(user);
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ error : "Internal server error" });
    }
};

exports.createUser = async (req, res) => {
  try {
    const firebaseUid = req.user.uid; // from the token, never the body (D-API-007)
    const { username, name } = req.body;

    // Basic required fields validation
    if (!username) {
      return res.status(400).json({ error: "Missing required field!" });
    }

    // Create user with only these fields
    const user = await prisma.user.create({
      data: {
        username,
        firebaseUid,
        name: name || null, // Optional field
        // other fields remain null or defaults
      },
    });

    // Don't return sensitive info (none here, but good habit)
    return res.status(201).json(user);
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteUser = async (req, res) => {
    try {
        const userId = Number(req.params.id);

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Delete from user database
        await prisma.user.delete({
            where: { id: userId },
        });

        return res.status(204).send();
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getUserByFirebaseUid = async (req, res) => {
  const firebaseUid = req.params.uid;

  if (!firebaseUid) {
    return res.status(400).json({ error: "Missing firebaseUid param" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid },
      include: {
        opportunities: true,
        savedOpportunities: true,
        badges: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user by firebaseUid:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Send information to database and firebase 
exports.onboarding = async (req, res) => {
  const firebaseUid = req.user.uid; // comes from token middleware
  const {
    name,
    username,
    skills,
    training,
    location,
    age,
    interests,
    avatarUrl
  } = req.body; // points and level are never taken from the client (D-API-005)

  try {
    const user = await prisma.user.upsert({
      where: { firebaseUid },
      update: { name, username, skills, training, location, age, interests, avatarUrl },
      create: {
        firebaseUid,
        name,
        username,
        skills,
        training,
        location,
        age,
        interests,
        avatarUrl
      },
    });

    const badgesEarned = await awardBadges(prisma, user.id, [BADGES.NEWCOMER]);

    res.json({ success: true, user, badgesEarned });
  } catch (e) {
    console.error("Error saving user onboarding data:", e);
    res.status(500).json({ error: "Failed to save onboarding data" });
  }
};

exports.getSavedOpportunitiesByUserId = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const userWithSavedOpps = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                savedOpportunities: true,
            },
        });
        if (!userWithSavedOpps) {
            return res.status(404).json({ error: "User not found" });
        }
        return res.json(userWithSavedOpps.savedOpportunities);
    } catch (error) {
        console.error("Error fetching saved opportunities:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.addSavedOpportunity = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const { opportunityId } = req.body;

        if (!opportunityId) {
            return res.status(400).json({ error: "Missing opportunityId in request body" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { savedOpportunities: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                savedOpportunities: {
                    connect: { id: opportunityId },
                },
            },
        });

        return res.json({ success: true, savedOpportunities: updatedUser.savedOpportunities });
    } catch (error) {
        console.error("Error adding saved opportunity:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.removeSavedOpportunity = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const { opportunityId } = req.body;

        if (!opportunityId) {
            return res.status(400).json({ error: "Missing opportunityId in request body" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { savedOpportunities: true },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                savedOpportunities: {
                    disconnect: { id: opportunityId },
                },
            },
        });

        return res.json({ success: true, savedOpportunities: updatedUser.savedOpportunities });
    } catch (error) {
        console.error("Error removing saved opportunity:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getUserOppsById = async (req, res) => {
    try {
        const userId = Number(req.params.id)
        const user = await prisma.user.findUnique({
            where : {id : userId},
            include : {opportunities : true},
        })
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        return res.json(user.opportunities);
    } catch (error) {
        console.error("Error Getting User Opportunities: ", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Apply to an opportunity. Points, level (D-API-005) and badges (D-API-006) are worked out here, never sent by the client.
exports.AddOpportunity = async (req, res) => {
    try {
        const userId = Number(req.params.id);
        const opportunityId = Number(req.body.opportunityId);
        if (!opportunityId) {
            return res.status(400).json({error : "Opportunity ID is required"})
        }
        const user = await prisma.user.findUnique({
            where : {id : userId},
            include : {opportunities : true},
        });
        if (!user) {
            return res.status(404).json({error : "User not found"})
        }
        if (user.firebaseUid !== req.user.uid) {
            return res.status(403).json({error : "You can only apply as yourself"})
        }
        const opportunity = await prisma.opportunity.findUnique({ where : {id : opportunityId} });
        if (!opportunity) {
            return res.status(404).json({error : "Opportunity not found"})
        }

        // Applying twice is allowed but only scores once.
        if (user.opportunities.some((opp) => opp.id === opportunityId)) {
            return res.json({
                success: true,
                opportunities: user.opportunities,
                points: user.points,
                level: user.level,
                pointsAwarded: 0,
                leveledUp: false,
                badgesEarned: [],
            });
        }

        const pointsAwarded = pointsForOpportunity(opportunity);
        const { updatedUser, badgesEarned } = await prisma.$transaction(async (tx) => {
            const withPoints = await tx.user.update({
                where : {id : userId},
                data : {
                    opportunities : {connect : {id : opportunityId}},
                    points : {increment : pointsAwarded},
                },
            });
            const updatedUser = await tx.user.update({
                where : {id : userId},
                data : {level : getLevelFromPoints(withPoints.points)},
                include: { opportunities: true },
            });
            const usersAhead = await tx.user.count({ where : {points : {gt : updatedUser.points}} });
            const badgesEarned = await awardBadges(
                tx, userId, badgesForApplication({ user, opportunity, usersAhead })
            );
            return { updatedUser, badgesEarned };
        });

        res.json({
            success: true,
            opportunities: updatedUser.opportunities,
            points: updatedUser.points,
            level: updatedUser.level,
            pointsAwarded,
            leveledUp: updatedUser.level > user.level,
            badgesEarned,
        });
    } catch (error) {
        console.error("Error Adding Opportunity: ", error);
        return res.status(500).json({error : "Internal server error"})
    }
}

exports.sendApplicationConfirmation = async (req, res) => {
  // Always to the signed-in user's own address, so this can't be used to email anyone else (D-API-007).
  const to = req.user.email;
  const { subject, text, html } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Your account has no email address' });
  }
  try {
    await sgMail.send({
      to,
      from: 'volunteergoconfirmation@outlook.com', 
      subject,
      text,
      html,
    });
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('SendGrid error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
};
