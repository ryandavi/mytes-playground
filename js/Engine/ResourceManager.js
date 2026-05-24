class ResourceManager {
    static MAX_LOAD_ATTEMPTS = 2;
    static RETRY_DELAY_MS = 150;
    static PLACEHOLDER_SPRITE_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

    constructor() {
        this.sprites = new Map();
        this.pendingLoads = new Map();
    }

    loadSprite(id, url) {
        if (this.sprites.has(id)) return Promise.resolve(this.sprites.get(id));
        if (this.pendingLoads.has(id)) return this.pendingLoads.get(id);

        const loadPromise = this._loadSpriteWithRetry(id, url)
            .then(img => {
                this.sprites.set(id, img);
                return img;
            })
            .finally(() => this.pendingLoads.delete(id));

        this.pendingLoads.set(id, loadPromise);
        return loadPromise;
    }

    getSprite(id) {
        return this.sprites.get(id);
    }

    isResourceLoaded(id) {
        return this.sprites.has(id);
    }

    async _loadSpriteWithRetry(id, url) {
        for (let attempt = 1; attempt <= ResourceManager.MAX_LOAD_ATTEMPTS; attempt++) {
            const requestUrl = attempt === 1 ? url : this._appendCacheBust(url, attempt);
            try {
                return await this._loadImage(requestUrl);
            } catch (error) {
                if (attempt === ResourceManager.MAX_LOAD_ATTEMPTS) {
                    console.warn(`Failed to load sprite: ${id} from ${url}. Using placeholder.`, error);
                    return this._createPlaceholderSprite(id, url);
                }
                console.warn(`Retrying sprite load: ${id} from ${url} (attempt ${attempt + 1})`, error);
                await this._delay(ResourceManager.RETRY_DELAY_MS);
            }
        }
        return this._createPlaceholderSprite(id, url);
    }

    _loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Unable to load ${url}`));
            img.src = url;
        });
    }

    _createPlaceholderSprite(id, sourceUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.dataset.resourceId = id;
            img.dataset.resourceFallback = 'true';
            img.dataset.resourceSource = sourceUrl;
            img.onload = () => resolve(img);
            img.src = ResourceManager.PLACEHOLDER_SPRITE_DATA_URI;
        });
    }

    _appendCacheBust(url, attempt) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}retry=${attempt}&ts=${Date.now()}`;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
