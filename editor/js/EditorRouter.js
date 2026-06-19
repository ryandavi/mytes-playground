// Hash routing: #/<domainId>/<recordId>
// Navigation always assigns location.hash from JS — never via <a href="#...">,
// because the page's <base href="../"> would resolve fragment links against the
// project root and navigate away from the editor.
class EditorRouter {
    constructor(onChange) {
        this.onChange = onChange;
        this._handler = () => this.emit();
    }

    start() {
        window.addEventListener('hashchange', this._handler);
        this.emit();
    }

    stop() {
        window.removeEventListener('hashchange', this._handler);
    }

    parse() {
        const hash = window.location.hash.replace(/^#\/?/, '');
        const [domainId, recordId] = hash.split('/').map(part => decodeURIComponent(part || ''));
        return {
            domainId: domainId || null,
            recordId: recordId || null
        };
    }

    navigate(domainId, recordId = null) {
        const parts = [domainId, recordId].filter(Boolean).map(encodeURIComponent);
        window.location.hash = `/${parts.join('/')}`;
    }

    emit() {
        const { domainId, recordId } = this.parse();
        this.onChange(domainId, recordId);
    }
}
