// Client for the PHP persistence layer (editor/api/*.php — see
// docs/EDITOR_API_SPEC.md). Paths resolve from the project root via the page's
// <base href="../">.
class EditorApiError extends Error {
    constructor(status, code, message, extra = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

class EditorApi {
    static async request(path, options = {}) {
        const response = await fetch(path, options);
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            throw new EditorApiError(response.status, 'bad_response', `Non-JSON response from ${path}`);
        }

        if (!response.ok || payload.ok === false) {
            const { code = 'unknown', message = 'Unknown API error' } = payload.error || {};
            const extra = { ...payload };
            delete extra.ok;
            delete extra.error;
            throw new EditorApiError(response.status, code, message, extra);
        }

        return payload;
    }

    static load(fileId) {
        return this.request(`editor/api/load.php?file=${encodeURIComponent(fileId)}&v=${Date.now()}`);
    }

    static save(fileId, content, baseMtime, force = false) {
        return this.request('editor/api/save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: fileId, baseMtime, content, force })
        });
    }

    static validate(fileId, content) {
        return this.request('editor/api/validate.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: fileId, content })
        });
    }

    static assets(dirKey) {
        return this.request(`editor/api/assets.php?dir=${encodeURIComponent(dirKey)}`);
    }
}
