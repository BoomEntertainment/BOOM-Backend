const Follow = require("../models/follow.model");
const User = require("../models/user.model");
const Wallet = require("../models/wallet.model");
const { AppError } = require("../middleware/error.middleware");

exports.followUser = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (followerId === followingId) {
      throw new AppError("You cannot follow yourself", 400);
    }

    const userToFollow = await User.findById(followingId);
    if (!userToFollow) {
      throw new AppError("User not found", 404);
    }

    const existingFollow = await Follow.findOne({
      follower: followerId,
      following: followingId,
    });

    if (existingFollow) {
      throw new AppError("You are already following this user", 400);
    }

    const follow = await Follow.create({
      follower: followerId,
      following: followingId,
    });

    res.status(200).json({
      success: true,
      message: `You are now following ${userToFollow.username}`,
      data: { follow },
    });
  } catch (error) {
    next(error);
  }
};

exports.unfollowUser = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    if (followerId === followingId) {
      throw new AppError("You cannot unfollow yourself", 400);
    }

    const userToUnfollow = await User.findById(followingId);
    if (!userToUnfollow) {
      throw new AppError("User not found", 404);
    }

    const result = await Follow.findOneAndDelete({
      follower: followerId,
      following: followingId,
    });

    if (!result) {
      throw new AppError("You are not following this user", 400);
    }

    res.status(200).json({
      success: true,
      message: `You have unfollowed ${userToUnfollow.username}`,
    });
  } catch (error) {
    next(error);
  }
};

exports.getFollowers = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const followers = await Follow.find({ following: userId })
      .populate("follower", "name username profilePhoto")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    const total = await Follow.countDocuments({ following: userId });

    res.status(200).json({
      success: true,
      data: {
        followers: followers.map((f) => f.follower),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getFollowing = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const following = await Follow.find({ follower: userId })
      .populate("following", "name username profilePhoto")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    const total = await Follow.countDocuments({ follower: userId });

    res.status(200).json({
      success: true,
      data: {
        following: following.map((f) => f.following),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getFollowCounts = async (userId) => {
  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
  ]);

  return { followersCount, followingCount };
};

exports.getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const searchQuery = {
      isRegistered: true,
      $or: [
        { name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ],
    };

    const users = await User.find(searchQuery)
      .select(
        "name username profilePhoto preference videoLanguage location createdAt"
      )
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(searchQuery);

    // Get follow counts, following status, and wallet balance for each user
    const usersWithInfo = await Promise.all(
      users.map(async (user) => {
        const [wallet, { followersCount, followingCount }] = await Promise.all([
          Wallet.findOne({ userId: user._id }),
          getFollowCounts(user._id),
        ]);

        let isFollowing = false;
        if (req.user) {
          isFollowing = await Follow.exists({
            follower: req.user.id,
            following: user._id,
          });
        }

        return {
          ...user.toObject(),
          followersCount,
          followingCount,
          walletBalance: wallet ? wallet.balance : 0,
          isFollowing,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        users: usersWithInfo,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        filters: {
          search,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
