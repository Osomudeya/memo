// Scores API Routes
// Handles user scores, statistics, and profile management

const express = require('express');
const router = express.Router();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Calculate user achievements based on stats
 */
async function getUserAchievements(username, userStats) {
    const achievements = [];
    
    try {
        // Games Played Achievements
        if (userStats.total_games >= 10) {
            achievements.push({
                id: 'ten_games',
                title: 'Getting Warmed Up! 🔥',
                description: 'Played 10 games',
                icon: '🎯',
                rarity: 'common',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.total_games >= 50) {
            achievements.push({
                id: 'fifty_games',
                title: 'Memory Enthusiast! 🤓',
                description: 'Played 50 games',
                icon: '🏅',
                rarity: 'uncommon',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.total_games >= 100) {
            achievements.push({
                id: 'hundred_games',
                title: 'Memory Addict! 🧠',
                description: 'Played 100 games',
                icon: '🏆',
                rarity: 'rare',
                unlockedAt: userStats.last_played
            });
        }

        // Score Achievements
        if (userStats.best_score >= 100) {
            achievements.push({
                id: 'score_100',
                title: 'Century Club! 💯',
                description: 'Scored 100 points in a single game',
                icon: '💯',
                rarity: 'common',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.best_score >= 200) {
            achievements.push({
                id: 'score_200',
                title: 'Double Century! 🎊',
                description: 'Scored 200 points in a single game',
                icon: '🌟',
                rarity: 'uncommon',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.best_score >= 300) {
            achievements.push({
                id: 'score_300',
                title: 'Memory Master! 👑',
                description: 'Scored 300 points in a single game',
                icon: '👑',
                rarity: 'legendary',
                unlockedAt: userStats.last_played
            });
        }

        // Speed Achievements
        if (userStats.best_time && userStats.best_time <= 60000) { // 1 minute
            achievements.push({
                id: 'speed_demon',
                title: 'Speed Demon! ⚡',
                description: 'Completed a game in under 1 minute',
                icon: '⚡',
                rarity: 'rare',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.best_time && userStats.best_time <= 30000) { // 30 seconds
            achievements.push({
                id: 'lightning_fast',
                title: 'Lightning Fast! 🌩️',
                description: 'Completed a game in under 30 seconds',
                icon: '🌩️',
                rarity: 'legendary',
                unlockedAt: userStats.last_played
            });
        }

        // Ranking Achievements
        if (userStats.rank <= 10) {
            achievements.push({
                id: 'top_ten',
                title: 'Top 10 Player! 🏆',
                description: 'Reached the top 10 on the leaderboard',
                icon: '🏆',
                rarity: 'epic',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.rank <= 3) {
            achievements.push({
                id: 'podium',
                title: 'Podium Finisher! 🥇',
                description: 'Reached the top 3 on the leaderboard',
                icon: '🥇',
                rarity: 'legendary',
                unlockedAt: userStats.last_played
            });
        }

        if (userStats.rank === 1) {
            achievements.push({
                id: 'champion',
                title: 'Champion! 👑',
                description: 'Reached #1 on the leaderboard',
                icon: '👑',
                rarity: 'legendary',
                unlockedAt: userStats.last_played
            });
        }

        // Check for perfect games (would need additional database query)
        // const perfectGames = await database.query(`
        //     SELECT COUNT(*) as perfect_count 
        //     FROM games 
        //     WHERE username = $1 AND game_completed = true AND moves = cards_matched
        // `, [username]);

        // if (perfectGames.rows[0].perfect_count > 0) {
        //     achievements.push({
        //         id: 'perfect_game',
        //         title: 'Flawless Victory! 💎',
        //         description: 'Completed a game with perfect accuracy',
        //         icon: '💎',
        //         rarity: 'epic',
        //         unlockedAt: userStats.last_played
        //     });
        // }

        return achievements;
    } catch (error) {
        console.error('Error calculating achievements:', error);
        return achievements;
    }
}

/**
 * Check if achievement was unlocked today
 */
function isUnlockedToday(achievement) {
    if (!achievement.unlockedAt) return false;
    
    const today = new Date().toDateString();
    const unlockedDate = new Date(achievement.unlockedAt).toDateString();
    return today === unlockedDate;
}

/**
 * Get game performance rating
 */
function getGamePerformance(score, difficulty) {
    const thresholds = {
        easy: { excellent: 180, good: 140, average: 100 },
        medium: { excellent: 220, good: 180, average: 140 },
        hard: { excellent: 280, good: 220, average: 180 },
        expert: { excellent: 350, good: 280, average: 220 }
    };

    const threshold = thresholds[difficulty] || thresholds.easy;

    if (score >= threshold.excellent) {
        return { rating: 'Excellent', emoji: '🌟', color: '#FFD700' };
    } else if (score >= threshold.good) {
        return { rating: 'Good', emoji: '👍', color: '#90EE90' };
    } else if (score >= threshold.average) {
        return { rating: 'Average', emoji: '😊', color: '#87CEEB' };
    } else {
        return { rating: 'Keep Trying', emoji: '💪', color: '#FFA07A' };
    }
}

/**
 * Get motivational message based on user stats
 */
function getMotivationalMessage(userStats) {
    const messages = {
        rookie: [
            "🌱 Every expert was once a beginner! Keep playing!",
            "🎮 You're just getting started - the fun is ahead!",
            "🚀 Great start! Your memory skills are developing!"
        ],
        beginner: [
            "🎯 You're making progress! Keep up the good work!",
            "💪 Your memory is getting stronger with each game!",
            "⭐ Nice improvement! You're on the right track!"
        ],
        intermediate: [
            "🔥 You're getting good at this! Keep the momentum!",
            "🎪 Impressive skills! You're becoming a memory pro!",
            "🌟 Excellent progress! You're in the intermediate league!"
        ],
        advanced: [
            "🏆 Outstanding performance! You're almost a master!",
            "💎 Your memory skills are truly impressive!",
            "🚀 You're reaching expert levels! Keep pushing!"
        ],
        expert: [
            "🧠 Memory Master level achieved! Incredible!",
            "👑 You're among the elite players! Amazing work!",
            "🌟 Legendary performance! You're inspiring others!"
        ]
    };

    let level = 'rookie';
    if (userStats.best_score >= 300) level = 'expert';
    else if (userStats.best_score >= 200) level = 'advanced';
    else if (userStats.best_score >= 150) level = 'intermediate';
    else if (userStats.best_score >= 100) level = 'beginner';

    const levelMessages = messages[level];
    return levelMessages[Math.floor(Math.random() * levelMessages.length)];
}

/**
 * Calculate user accuracy across all games
 */
async function calculateUserAccuracy(username) {
    try {
        // const result = await database.query(`
        //     SELECT 
        //         AVG(CASE WHEN moves > 0 THEN (cards_matched::float / moves) * 100 ELSE 0 END) as accuracy
        //     FROM games 
        //     WHERE username = $1 AND game_completed = true
        // `, [username]);

        // return result.rows[0].accuracy ? parseFloat(result.rows[0].accuracy).toFixed(1) : '0.0';
        return '85.0'; // Placeholder
    } catch (error) {
        console.error('Error calculating accuracy:', error);
        return '0.0';
    }
}

/**
 * Get user's favorite emoji category
 */
async function getFavoriteCategory(username) {
    try {
        // This would require storing category data in game_data JSONB field
        // For now, return a fun placeholder
        const categories = ['classic', 'food', 'space', 'fantasy', 'tech'];
        return categories[Math.floor(Math.random() * categories.length)];
    } catch (error) {
        console.error('Error getting favorite category:', error);
        return 'classic';
    }
}

/**
 * Get recent games for a user
 */
async function getRecentGames(username, limit = 5) {
    try {
        // const games = await database.query(`
        //     SELECT score, difficulty_level, completed_at, time_elapsed
        //     FROM games 
        //     WHERE username = $1 AND game_completed = true
        //     ORDER BY completed_at DESC 
        //     LIMIT $2
        // `, [username, limit]);

        // return games.rows.map(game => ({
        //     score: game.score,
        //     difficulty: game.difficulty_level,
        //     completedAt: game.completed_at,
        //     duration: game.time_elapsed ? `${(game.time_elapsed / 1000).toFixed(1)}s` : null
        // }));
        return []; // Placeholder
    } catch (error) {
        console.error('Error getting recent games:', error);
        return [];
    }
}

/**
 * Get performance level based on best score
 */
function getPerformanceLevel(bestScore) {
    if (bestScore >= 300) return { level: 'Memory Master', emoji: '🧠', color: '#FFD700' };
    if (bestScore >= 250) return { level: 'Expert', emoji: '🏆', color: '#C0C0C0' };
    if (bestScore >= 200) return { level: 'Advanced', emoji: '⭐', color: '#CD7F32' };
    if (bestScore >= 150) return { level: 'Intermediate', emoji: '🎯', color: '#4169E1' };
    if (bestScore >= 100) return { level: 'Beginner', emoji: '🌱', color: '#32CD32' };
    return { level: 'Rookie', emoji: '🎮', color: '#808080' };
}

/**
 * Calculate progress to next level
 */
function getProgressToNextLevel(bestScore) {
    const levels = [100, 150, 200, 250, 300];
    const nextLevel = levels.find(level => level > bestScore);
    
    if (!nextLevel) {
        return { isMaxLevel: true, message: 'You\'ve reached the highest level! 👑' };
    }
    
    const previousLevel = levels[levels.indexOf(nextLevel) - 1] || 0;
    const progress = ((bestScore - previousLevel) / (nextLevel - previousLevel)) * 100;
    
    return {
        isMaxLevel: false,
        currentLevel: previousLevel,
        nextLevel,
        progress: Math.max(0, Math.min(100, progress)),
        pointsNeeded: nextLevel - bestScore
    };
}

// ========================================
// ROUTES
// ========================================

router.post('/user', (req, res) => {
    res.json({ success: true, message: 'User creation route working!' });
});

router.get('/:username', (req, res) => {
    res.json({ success: true, message: 'User stats route working!' });
});

module.exports = router;