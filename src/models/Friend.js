const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Friend = sequelize.define('Friend', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    status: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
        defaultValue: 'pending',
    }
}, {
    timestamps: true,
    tableName: 'friends'
});

// Relationships
User.belongsToMany(User, { as: 'Friends', through: Friend, foreignKey: 'userId', otherKey: 'friendId' });

module.exports = Friend;
