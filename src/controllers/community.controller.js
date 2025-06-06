const Community = require("../models/community.model");
const CommunityMember = require("../models/communityMember.model");
const Wallet = require("../models/wallet.model");
const WalletHistory = require("../models/walletHistory.model");
const { AppError } = require("../middleware/error.middleware");
const mongoose = require("mongoose");

exports.createCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, bio, cost } = req.body;
    const profile_photo = req.file ? req.file.path : undefined;

    if (!name) {
      throw new AppError("Community name is required", 400);
    }

    if (cost && (isNaN(cost) || cost < 0)) {
      throw new AppError("Invalid cost value", 400);
    }

    const existingCommunity = await Community.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    }).session(session);

    if (existingCommunity) {
      throw new AppError("A community with this name already exists", 409);
    }

    const community = await Community.create(
      [
        {
          name,
          bio,
          profile_photo,
          founder: req.user._id,
          cost: cost || 0,
        },
      ],
      { session }
    );

    await CommunityMember.create(
      [
        {
          community: community[0]._id,
          user: req.user._id,
          role: "creator",
        },
      ],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: community[0],
    });
  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      return next(
        new AppError("A community with this name already exists", 409)
      );
    }

    next(error);
  } finally {
    session.endSession();
  }
};

exports.getAllCommunities = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const searchQuery = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { bio: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const totalCommunities = await Community.countDocuments(searchQuery);

    const communities = await Community.find(searchQuery)
      .populate("founder", "username profilePicture")
      .select("name bio profile_photo founder cost createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: communities,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCommunities / limit),
        totalCommunities,
        hasMore: skip + communities.length < totalCommunities,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getCommunity = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate("founder", "username profilePicture")
      .select("name bio profile_photo founder cost createdAt");

    if (!community) {
      throw new AppError("Community not found", 404);
    }

    const [followersCount, creatorsCount] = await Promise.all([
      CommunityMember.countDocuments({
        community: community._id,
        role: "follower",
      }),
      CommunityMember.countDocuments({
        community: community._id,
        role: "creator",
      }),
    ]);

    const creatorMembership = await CommunityMember.findOne({
      community: community._id,
      user: req.user._id,
      role: "creator",
    });

    const followerMembership = await CommunityMember.findOne({
      community: community._id,
      user: req.user._id,
      role: "follower",
    });

    res.status(200).json({
      success: true,
      data: {
        ...community.toObject(),
        followersCount,
        creatorsCount,
        isCreator: creatorMembership ? true : false,
        isFollowing: followerMembership ? true : false,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateCommunity = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const community = await Community.findById(req.params.id).session(session);

    if (!community) {
      throw new AppError("Community not found", 404);
    }

    if (community.founder.toString() !== req.user._id.toString()) {
      throw new AppError("Only founder can update community", 403);
    }

    const { bio, cost } = req.body;
    const profile_photo = req.file ? req.file.path : undefined;

    if (cost !== undefined && (isNaN(cost) || cost < 0)) {
      throw new AppError("Invalid cost value", 400);
    }

    const updateData = {};
    if (bio !== undefined) updateData.bio = bio;
    if (profile_photo) updateData.profile_photo = profile_photo;
    if (cost !== undefined) updateData.cost = cost;

    const updatedCommunity = await Community.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      {
        new: true,
        runValidators: true,
        session,
        populate: {
          path: "founder",
          select: "username profilePicture",
        },
      }
    ).select("name bio profile_photo founder cost createdAt");

    if (!updatedCommunity) {
      throw new AppError("Failed to update community", 500);
    }

    await session.commitTransaction();

    const [followersCount, creatorsCount] = await Promise.all([
      CommunityMember.countDocuments({
        community: updatedCommunity._id,
        role: "follower",
      }),
      CommunityMember.countDocuments({
        community: updatedCommunity._id,
        role: "creator",
      }),
    ]);

    const membership = await CommunityMember.findOne({
      community: updatedCommunity._id,
      user: req.user._id,
    });

    res.status(200).json({
      success: true,
      data: {
        ...updatedCommunity.toObject(),
        followersCount,
        creatorsCount,
        userRole: membership?.role || null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

exports.toggleFollow = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const community = await Community.findById(req.params.id).session(session);

    if (!community) {
      throw new AppError("Community not found", 404);
    }

    const existingMembership = await CommunityMember.findOne({
      community: community._id,
      user: req.user._id,
      role: "follower",
    }).session(session);

    if (existingMembership) {
      await CommunityMember.findByIdAndDelete(existingMembership._id).session(
        session
      );
      await session.commitTransaction();
      res.status(200).json({
        success: true,
        message: "Successfully unfollowed community",
      });
    } else {
      await CommunityMember.create(
        [
          {
            community: community._id,
            user: req.user._id,
            role: "follower",
          },
        ],
        { session }
      );

      await session.commitTransaction();
      res.status(200).json({
        success: true,
        message: "Successfully followed community",
        data: {
          membership: {
            role: "follower",
            joinedAt: new Date(),
          },
        },
      });
    }
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

exports.becomeCreator = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const community = await Community.findById(req.params.id)
      .populate("founder", "username")
      .session(session);

    if (!community) {
      throw new AppError("Community not found", 404);
    }

    const existingMembership = await CommunityMember.findOne({
      community: community._id,
      user: req.user._id,
      role: "creator",
    }).session(session);

    if (existingMembership) {
      throw new AppError("You are already a creator of this community", 400);
    }

    const userWallet = await Wallet.findOne({ userId: req.user._id }).session(
      session
    );

    if (!userWallet || userWallet.balance < community.cost) {
      throw new AppError("Insufficient balance to become a creator", 400);
    }

    const founderWallet = await Wallet.findOne({
      userId: community.founder._id,
    }).session(session);
    if (!founderWallet) {
      throw new AppError("Founder's wallet not found", 500);
    }

    await Wallet.findOneAndUpdate(
      { userId: req.user._id },
      { $inc: { balance: -community.cost } },
      { session }
    );

    await Wallet.findOneAndUpdate(
      { userId: community.founder._id },
      { $inc: { balance: community.cost } },
      { session }
    );

    await WalletHistory.create(
      [
        {
          userId: req.user._id,
          type: "payout",
          transactionType: "other",
          amount: community.cost,
          reason: {
            name: "Community",
            id: community._id,
          },
          status: "completed",
        },
        {
          userId: community.founder._id,
          type: "payin",
          transactionType: "other",
          amount: community.cost,
          reason: {
            name: "Community",
            id: community._id,
          },
          status: "completed",
        },
      ],
      { session }
    );

    await CommunityMember.create(
      [
        {
          community: community._id,
          user: req.user._id,
          role: "creator",
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const [updatedUserWallet, updatedFounderWallet] = await Promise.all([
      Wallet.findOne({ userId: req.user._id }),
      Wallet.findOne({ userId: community.founder._id }),
    ]);

    res.status(200).json({
      success: true,
      message: "Successfully became a creator",
      data: {
        membership: {
          role: "creator",
          joinedAt: existingMembership
            ? existingMembership.joinedAt
            : new Date(),
        },
        payment: {
          amount: community.cost,
          founder: {
            id: community.founder._id,
            username: community.founder.username,
          },
        },
        wallet: {
          balance: updatedUserWallet.balance,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

exports.getCommunityMembers = async (req, res, next) => {
  try {
    const { role } = req.query;
    const query = { community: req.params.id };

    if (role) {
      if (!["follower", "creator"].includes(role)) {
        throw new AppError("Invalid role specified", 400);
      }
      query.role = role;
    }

    const members = await CommunityMember.find(query)
      .populate("user", "username profilePicture")
      .sort({ joinedAt: -1 });

    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserCommunities = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const foundedCommunities = await Community.find({ founder: userId })
      .select("name bio profile_photo cost createdAt")
      .sort({ createdAt: -1 });

    const creatorCommunities = await CommunityMember.find({
      user: userId,
      role: "creator",
    })
      .populate({
        path: "community",
        select: "name bio profile_photo cost founder createdAt",
        populate: {
          path: "founder",
          select: "username profilePicture",
        },
      })
      .sort({ joinedAt: -1 });

    const followingCommunities = await CommunityMember.find({
      user: userId,
      role: "follower",
    })
      .populate({
        path: "community",
        select: "name bio profile_photo cost founder createdAt",
        populate: {
          path: "founder",
          select: "username profilePicture",
        },
      })
      .sort({ joinedAt: -1 });

    const [foundedCount, creatorCount, followingCount, totalCommunitiesCount] =
      await Promise.all([
        Community.countDocuments({ founder: userId }),
        CommunityMember.countDocuments({ user: userId, role: "creator" }),
        CommunityMember.countDocuments({ user: userId, role: "follower" }),
        Community.countDocuments(),
      ]);

    res.status(200).json({
      success: true,
      data: {
        statistics: {
          foundedCount,
          creatorCount,
          followingCount,
          totalCommunitiesCount,
        },
        founded: foundedCommunities,
        creator: creatorCommunities.map((member) => ({
          ...member.community.toObject(),
          joinedAt: member.joinedAt,
        })),
        following: followingCommunities.map((member) => ({
          ...member.community.toObject(),
          joinedAt: member.joinedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
