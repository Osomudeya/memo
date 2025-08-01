// Database Connection and Query Manager
// PostgreSQL connection handling with connection pooling

const { Pool } = require('pg');

// Database configuration from environment variables
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'humor_memory_game',
    user: process.env.DB_USER || 'gameuser',
    password: process.env.DB_PASSWORD || 'gamepass123',
    max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20, // Maximum number of connections
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000, // Return error after 2 seconds if connection could not be established
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('❌ Unexpected database pool error:', err);
    // Don't exit the process, let the application handle the error
});

pool.on('connect', (client) => {
    console.log('🔌 New database client connected');
});

pool.on('remove', (client) => {
    console.log('🔌 Database client removed from pool');
});

// ========================================
// DATABASE OPERATIONS
// ========================================

class Database {
    /**
     * Execute a query with optional parameters
     * @param {string} text - SQL query string
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async query(text, params = []) {
        const start = Date.now();
        try {
            const result = await pool.query(text, params);
            const duration = Date.now() - start;
            
            // Log slow queries (over 100ms)
            if (duration > 100) {
                console.warn(`🐌 Slow query detected (${duration}ms):`, text.substring(0, 100));
            }
            
            return result;
        } catch (error) {
            console.error('❌ Database query error:', error);
            console.error('Query:', text);
            console.error('Params:', params);
            throw error;
        }
    }

    /**
     * Execute a transaction with multiple queries
     * @param {Function} callback - Function containing transaction logic
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Transaction error:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Test database connection
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        try {
            const result = await this.query('SELECT NOW() as current_time, version() as version');
            console.log('✅ Database connection test successful');
            console.log(`⏰ Current time: ${result.rows[0].current_time}`);
            console.log(`🐘 PostgreSQL version: ${result.rows[0].version.split(' ')[1]}`);
            return true;
        } catch (error) {
            console.error('❌ Database connection test failed:', error);
            throw error;
        }
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} Database stats
     */
    async getStats() {
        try {
            const stats = await this.query(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM games) as total_games,
                    (SELECT COUNT(*) FROM games WHERE game_completed = true) as completed_games,
                    (SELECT COUNT(*) FROM game_matches) as total_matches,
                    (SELECT MAX(best_score) FROM users) as highest_score,
                    (SELECT COUNT(*) FROM users WHERE last_played > NOW() - INTERVAL '24 hours') as active_users_24h
            `);
            
            return stats.rows[0];
        } catch (error) {
            console.error('❌ Error getting database stats:', error);
            throw error;
        }
    }

    /**
     * Close all database connections
     * @returns {Promise<void>}
     */
    async close() {
        try {
            await pool.end();
            console.log('🔌 Database connection pool closed');
        } catch (error) {
            console.error('❌ Error closing database connections:', error);
            throw error;
        }
    }

    /**
     * Get connection pool status
     * @returns {Object} Pool status information
     */
    getPoolStatus() {
        return {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        };
    }
}

// ========================================
// USER-RELATED QUERIES
// ========================================

class UserQueries extends Database {
    /**
     * Create or get user by username
     * @param {string} username - User's username
     * @param {string} email - User's email (optional)
     * @param {string} displayName - User's display name (optional)
     * @returns {Promise<Object>} User object
     */
    async createOrGetUser(username, email = null, displayName = null) {
        try {
            // First, try to get existing user
            const existingUser = await this.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );

            if (existingUser.rows.length > 0) {
                return existingUser.rows[0];
            }

            // Create new user if doesn't exist
            const newUser = await this.query(`
                INSERT INTO users (username, email, display_name)
                VALUES ($1, $2, $3)
                RETURNING *
            `, [username, email, displayName || username]);

            console.log(`🎉 New player joined: ${username}!`);
            return newUser.rows[0];
        } catch (error) {
            console.error('❌ Error creating/getting user:', error);
            throw error;
        }
    }

    /**
     * Get user statistics
     * @param {string} username - User's username
     * @returns {Promise<Object>} User stats
     */
    async getUserStats(username) {
        try {
            const stats = await this.query(
                'SELECT * FROM get_user_stats($1)',
                [username]
            );

            return stats.rows[0] || null;
        } catch (error) {
            console.error('❌ Error getting user stats:', error);
            throw error;
        }
    }

    /**
     * Update user's last played time
     * @param {string} userId - User's ID
     * @returns {Promise<void>}
     */
    async updateLastPlayed(userId) {
        try {
            await this.query(
                'UPDATE users SET last_played = CURRENT_TIMESTAMP WHERE id = $1',
                [userId]
            );
        } catch (error) {
            console.error('❌ Error updating last played:', error);
            throw error;
        }
    }
}

// ========================================
// GAME-RELATED QUERIES
// ========================================

class GameQueries extends Database {
    /**
     * Create a new game session
     * @param {string} userId - User's ID
     * @param {string} username - User's username
     * @param {string} difficulty - Game difficulty
     * @returns {Promise<Object>} Game object
     */
    async createGame(userId, username, difficulty = 'easy') {
        try {
            const game = await this.query(`
                INSERT INTO games (user_id, username, difficulty_level, game_data)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [userId, username, difficulty, JSON.stringify({ difficulty, started: new Date() })]);

            console.log(`🎮 New game started by ${username} (${difficulty})`);
            return game.rows[0];
        } catch (error) {
            console.error('❌ Error creating game:', error);
            throw error;
        }
    }

    /**
     * Complete a game and calculate final score
     * @param {string} gameId - Game ID
     * @param {number} score - Final score
     * @param {number} moves - Number of moves
     * @param {number} timeElapsed - Time elapsed in milliseconds
     * @param {number} cardsMatched - Number of cards matched
     * @returns {Promise<Object>} Updated game object
     */
    async completeGame(gameId, score, moves, timeElapsed, cardsMatched) {
        try {
            const game = await this.query(`
                UPDATE games 
                SET 
                    score = $2,
                    moves = $3,
                    time_elapsed = $4,
                    cards_matched = $5,
                    game_completed = true,
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `, [gameId, score, moves, timeElapsed, cardsMatched]);

            if (game.rows.length === 0) {
                throw new Error('Game not found');
            }

            console.log(`🏆 Game completed! Score: ${score}, Time: ${timeElapsed}ms`);
            return game.rows[0];
        } catch (error) {
            console.error('❌ Error completing game:', error);
            throw error;
        }
    }

    /**
     * Record a card match
     * @param {string} gameId - Game ID
     * @param {string} card1Id - First card ID
     * @param {string} card2Id - Second card ID
     * @param {number} matchTime - Time when match was made
     * @param {number} points - Points earned
     * @param {number} bonusPoints - Bonus points
     * @returns {Promise<Object>} Match object
     */
    async recordMatch(gameId, card1Id, card2Id, matchTime, points = 10, bonusPoints = 0) {
        try {
            const match = await this.query(`
                INSERT INTO game_matches (game_id, card1_id, card2_id, match_time, points_earned, bonus_points)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [gameId, card1Id, card2Id, matchTime, points, bonusPoints]);

            return match.rows[0];
        } catch (error) {
            console.error('❌ Error recording match:', error);
            throw error;
        }
    }

    /**
     * Get leaderboard data
     * @param {number} limit - Number of top players to return
     * @returns {Promise<Array>} Leaderboard array
     */
    async getLeaderboard(limit = 10) {
        try {
            const leaderboard = await this.query(`
                SELECT * FROM leaderboard
                LIMIT $1
            `, [limit]);

            return leaderboard.rows;
        } catch (error) {
            console.error('❌ Error getting leaderboard:', error);
            throw error;
        }
    }
}

// Create instances combining both classes
class HumorGameDatabase extends UserQueries {
    constructor() {
        super();
        // Add game queries to the instance
        Object.setPrototypeOf(this, Object.create(GameQueries.prototype));
        Object.getOwnPropertyNames(GameQueries.prototype).forEach(name => {
            if (name !== 'constructor') {
                this[name] = GameQueries.prototype[name];
            }
        });
    }
}

// Export singleton instance
const database = new HumorGameDatabase();

module.exports = database;