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

    getStorageKey(userId = this.userId) {
        if (!userId) return null;
        return this.core?.getUserStorageKey?.(userId) ?? `user_${userId}`;
    }

    serializeUserData() {
        const inventoryData = this.inventory ?
            this.inventory.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                variant: item.variant,
                description: item.description || ''
            })) :
            this.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                variant: item.variant,
                description: item.description || ''
            }));

        return {
            username: this.username,
            userId: this.userId,
            lastLogin: this.lastLogin,
            dateCreated: this.dateCreated,
            inventory: inventoryData,
            preferences: this.preferences,
            stats: this.stats,
            achievements: Array.from(this.achievements.entries()),
            currency: this.currency
        };
    }

    applyUserData(userData = {}) {
        this.username = userData.username ?? this.username;
        this.userId = userData.userId ?? this.userId;
        this.lastLogin = userData.lastLogin ? new Date(userData.lastLogin) : this.lastLogin;
        this.dateCreated = userData.dateCreated ? new Date(userData.dateCreated) : this.dateCreated;

        if (userData.preferences) {
            this.preferences = {
                ...this.preferences,
                ...userData.preferences
            };
        }

        if (userData.stats) {
            this.stats = {
                ...this.stats,
                ...userData.stats
            };
        }

        if (userData.achievements) {
            this.achievements = new Map(userData.achievements);
        }

        if (userData.currency) {
            this.currency = {
                ...this.currency,
                ...userData.currency
            };
        }

        if (Array.isArray(userData.inventory)) {
            this.items = userData.inventory.map(item => ({ ...item }));
        }

        this.syncInventoryFromItems();
    }

    syncInventoryFromItems() {
        if (!this.inventory) return;

        while (this.inventory.items.length > 0) {
            this.inventory.items.pop();
        }

        this.items.forEach(item => {
            this.inventory.addItem(
                item.variant || item.name,
                item.quantity,
                item.type,
                item.description || ''
            );
        });
    }

    loadUserDataFromStorage(userId = this.userId) {
        const storageKey = this.getStorageKey(userId);
        if (!storageKey) return false;

        const savedData = localStorage.getItem(storageKey);
        if (!savedData) return false;

        this.applyUserData(JSON.parse(savedData));
        return true;
    }

    // User authentication and profile methods
    login(username, userId) {
        this.username = username;
        this.userId = userId;
        this.lastLogin = new Date();
        this.dateCreated ??= new Date();
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

            this.applyUserData(userData);

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

        const storageKey = this.getStorageKey();
        if (!storageKey) return;

        localStorage.setItem(storageKey, JSON.stringify(this.serializeUserData()));

        const lastUserIdKey = this.core?.config?.userData?.lastUserIdKey;
        if (lastUserIdKey) {
            localStorage.setItem(lastUserIdKey, this.userId);
        }
    }

    loadUserData() {
        return this.loadUserDataFromStorage(this.userId);
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
