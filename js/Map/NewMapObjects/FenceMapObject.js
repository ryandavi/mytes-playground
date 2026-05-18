class FenceMapObject extends ConnectableDirectionalMapObject {
    getBaseCssClass() {
        return 'fence';
    }

    render(container, parent) {
        const element = super.render(container, parent);

        if (this.getConfig('debug', false) && this.connectedObjectIds.size > 0) {
            const connectionsElement = document.createElement('div');
            connectionsElement.classList.add('fence-connections', 'debug-visible');
            connectionsElement.textContent = `${this.connectedObjectIds.size} connections`;
            element.appendChild(connectionsElement);
        }

        return element;
    }
}
