const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    spotifyId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    displayName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    avatarUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    accessToken: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    musicProvider: {
        type: DataTypes.ENUM('spotify', 'apple', 'deezer'),
        defaultValue: 'spotify',
    },
    pushToken: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    timestamps: true,
    tableName: 'users'
});

module.exports = User;
