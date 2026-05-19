class User {
    constructor(core) {
        this.core = core;
        
        // Basic user info
        this.username = null;
        this.userId = null;
        this.lastLogin = null;
        this.dateCreated = null;
        
        // Reference to ContainerManager's inventory instance
        this.inventory = null;
        this.items = [];
        
        // Game state - track active Mytes
        this.activeMytes = [];
        
        // User preferences
        this.preferences = {
            soundEnabled: true,
            musicEnabled: true,
            cameraMode: 'follow', // Default camera mode
            containerLimit: true, // Whether Mytes stay in container by default
            theme: 'light'
        };
        
        // Statistics
        this.stats = {
            totalPlayTime: 0,
            mytesHatched: 0,
            itemsCollected: 0,
            achievementsUnlocked: 0
        };

        // Achievement tracking
        this.achievements = new Map();
        
        // Currency/Resources
        this.currency = {
            coins: 0,
            gems: 0
        };
    }

    // Connect to existing inventory instance
    setInventory(inventoryInstance) {
        this.inventory = inventoryInstance;
    }

    // User authentication and profile methods
    login(username, userId) {
        this.username = username;
        this.userId = userId;
        this.lastLogin = new Date();
        this.loadUserData();
    }

    logout() {
        this.saveUserData();
        this.username = null;
        this.userId = null;
    }

    // Myte management
    addMyte(myte) {
        this.activeMytes.push(myte);
        this.stats.mytesHatched++;
        this.saveUserData();
    }

    removeMyte(myteId) {
        const index = this.activeMytes.findIndex(myte => myte.id === myteId);
        if (index !== -1) {
            this.activeMytes.splice(index, 1);
            this.saveUserData();
            return true;
        }
        return false;
    }

    // Currency management
    addCurrency(type, amount) {
        if (this.currency.hasOwnProperty(type)) {
            this.currency[type] += amount;
            this.saveUserData();
            return true;
        }
        return false;
    }

    spendCurrency(type, amount) {
        if (this.currency.hasOwnProperty(type) && this.currency[type] >= amount) {
            this.currency[type] -= amount;
            this.saveUserData();
            return true;
        }
        return false;
    }

    // Preference management
    setPreference(key, value) {
        if (this.preferences.hasOwnProperty(key)) {
            this.preferences[key] = value;
            this.saveUserData();
            return true;
        }
        return false;
    }

    // Achievement system
    unlockAchievement(achievementId) {
        if (!this.achievements.has(achievementId)) {
            this.achievements.set(achievementId, {
                unlockedDate: new Date(),
                claimed: false
            });
            this.stats.achievementsUnlocked++;
            this.saveUserData();
            return true;
        }
        return false;
    }

    // Load data from JSON file
    async loadUserDataFromFile(fileName) {
        try {
            const response = await fetch(fileName); // Perform the fetch
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const responseText = await response.text(); // Extract the response text
            const userData = JSON.parse(responseText); // Parse it as JSON
            console.log(userData);
            
            // Set basic user info
            this.username = userData.username;
            this.userId = userData.userId;
            this.lastLogin = new Date(userData.lastLogin);
            this.dateCreated = new Date(userData.dateCreated);
            
            // Load preferences
            if (userData.preferences) {
                this.preferences = {
                    ...this.preferences, // Keep default values as fallback
                    ...userData.preferences // Override with loaded values
                };
            }
            
            // Load stats
            if (userData.stats) {
                this.stats = {
                    ...this.stats, // Keep default values as fallback
                    ...userData.stats // Override with loaded values
                };
            }
            
            // Load achievements
            if (userData.achievements) {
                this.achievements = new Map(userData.achievements);
            }
            
            // Load currency
            if (userData.currency) {
                this.currency = {
                    ...this.currency, // Keep default values as fallback
                    ...userData.currency // Override with loaded values
                };
            }

            if (userData.inventory) {
                this.items = userData.inventory;
            }
            
            // Load inventory if we have an inventory instance
            /*
            if (this.inventory && userData.inventory) {
                // Clear existing inventory
                while (this.inventory.items.length > 0) {
                    this.inventory.items.pop();
                }
                // Load saved inventory items
                userData.inventory.forEach(item => {
                    this.inventory.addItem(item.name, item.quantity, item.type);
                });
            }
            */

            return true;
        } catch (error) {

            const inferredPath = new URL(fileName, window.location.href).href;
            console.log('Attempting to load file from:', inferredPath);
            console.error('Error reading file:', fileName);
            console.error('Error loading user data:', error);

            return false;
        }
    }

    // Data persistence
    saveUserData() {
        if (!this.userId) return;

        // Convert inventory items to simple objects for storage
        const inventoryData = this.inventory ? 
            this.inventory.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                variant: item.variant,
                description: item.description || ''
            })) : [];

        const userData = {
            username: this.username,
            userId: this.userId,
            lastLogin: this.lastLogin,
            inventory: inventoryData,
            preferences: this.preferences,
            stats: this.stats,
            achievements: Array.from(this.achievements.entries()),
            currency: this.currency
        };

        localStorage.setItem(`user_${this.userId}`, JSON.stringify(userData));
    }

    loadUserData() {
        if (!this.userId) return;

        const savedData = localStorage.getItem(`user_${this.userId}`);
        if (savedData) {
            const userData = JSON.parse(savedData);
            
            // Restore user data
            this.preferences = userData.preferences;
            this.stats = userData.stats;
            this.achievements = new Map(userData.achievements);
            this.currency = userData.currency;

            // Restore inventory if we have an inventory instance
            if (this.inventory && userData.inventory) {
                // Clear existing inventory
                while (this.inventory.items.length > 0) {
                    this.inventory.items.pop();
                }
                // Load saved inventory items
                userData.inventory.forEach(item => {
                    this.inventory.addItem(item.variant || item.name, item.quantity, item.type, item.description || '');
                });
            }
        }
    }

    // Analytics and tracking
    updatePlayTime(deltaTime) {
        this.stats.totalPlayTime += deltaTime;
        if (this.stats.totalPlayTime % 300000 === 0) { // Save every 5 minutes
            this.saveUserData();
        }
    }

    getPlayTimeStats() {
        return {
            totalHours: Math.floor(this.stats.totalPlayTime / 3600000),
            totalMinutes: Math.floor((this.stats.totalPlayTime % 3600000) / 60000)
        };
    }
}

// Example usage:
/*
const core = new Core();
const user = new User(core);

// Connect to existing inventory
user.setInventory(core.containerManager.inventory);

// Login
user.login('player123', 'uid123');

// Update preferences
user.setPreference('soundEnabled', false);

// Track currency
user.addCurrency('coins', 100);
user.spendCurrency('coins', 50);

// Unlock achievements
user.unlockAchievement('first_myte_hatched');

// Update play time
setInterval(() => {
    user.updatePlayTime(1000); // Update every second
}, 1000);
*/
