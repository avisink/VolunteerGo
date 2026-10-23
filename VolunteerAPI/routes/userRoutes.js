const express = require('express');
const router = express.Router();
const controller = require('../controllers/userController');
const { verifyFirebaseToken, requireSelf } = require('../middleware/auth');

// Writes need a Firebase token; `:id` writes must be the caller's own account (D-API-007).
const self = [verifyFirebaseToken, requireSelf];

router.get("/", controller.getAllUsers); // get all users 

router.get("/:id", controller.getUserById); // get user by id 

router.get("/by-uid/:uid", controller.getUserByFirebaseUid); // get user by firebaseID

router.post("/", verifyFirebaseToken, controller.createUser); // create the caller's user row (uid from the token) 

router.get("/:id/saved-opportunities", controller.getSavedOpportunitiesByUserId); //get saved opps by userid

router.get("/:id/opportunities", controller.getUserOppsById); // get user's opps

router.post("/:id/saved-opportunities/add", self, controller.addSavedOpportunity); // add saved opportunity for user

router.put("/:id/opportunities/add", verifyFirebaseToken, controller.AddOpportunity); // apply; awards points and recomputes level 

router.post("/:id/saved-opportunities/remove", self, controller.removeSavedOpportunity); // remove saved opportunity for user

router.delete("/:id", self, controller.deleteUser); // delete user 

router.post("/onboarding", verifyFirebaseToken, controller.onboarding); // login user

router.post('/send-confirmation-email', verifyFirebaseToken, controller.sendApplicationConfirmation);  // send user confirmation email



module.exports = router;
