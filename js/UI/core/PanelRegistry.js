class PanelRegistry {
    static CONTROL_ICONS = Object.freeze({
        minimize: 'minimize',
        fullscreen: 'maximize',
        close: 'close'
    });

    static renderAll(configs = SiteConfig.ui.panels) {
        for (const config of configs) {
            const panel = document.getElementById(config.id);
            if (!panel) {
                console.warn(`[PanelRegistry] Missing panel #${config.id}`);
                continue;
            }

            panel.querySelector(':scope > .window-panel__header')?.remove();
            panel.prepend(this.createHeader(config));
            this.renderTabs(panel, config.tabs);
        }
    }

    static createHeader(config) {
        const header = document.createElement('div');
        header.className = 'window-panel__header';

        const title = document.createElement('h2');
        title.className = 'window-panel__title';
        title.append(
            this.createIcon(config.icon),
            Object.assign(document.createElement('span'), { className: 'text', textContent: config.title })
        );

        const controls = document.createElement('div');
        controls.className = 'window-panel__controls';
        for (const control of config.controls ?? ['close']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `modal-${control}-btn`;
            button.setAttribute('aria-label', control.charAt(0).toUpperCase() + control.slice(1));
            button.append(this.createIcon(this.CONTROL_ICONS[control]));
            controls.append(button);
        }

        header.append(title, controls);
        return header;
    }

    static createIcon(iconId) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#icon-${iconId}`);
        svg.append(use);
        return svg;
    }

    static renderTabs(panel, tabsConfig) {
        if (!tabsConfig) return;
        panel.querySelector(':scope > .window-panel__content > .window-tabs')?.remove();

        const tabs = document.createElement('div');
        tabs.className = `window-tabs ${tabsConfig.className ?? ''}`.trim();
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', tabsConfig.ariaLabel);

        for (const item of tabsConfig.items ?? []) {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'tab');
            if (item.id) button.id = item.id;
            if (tabsConfig.panelId) button.setAttribute('aria-controls', tabsConfig.panelId);
            if (tabsConfig.attribute) button.setAttribute(tabsConfig.attribute, item.value);
            button.textContent = item.label;
            button.hidden = item.hidden === true;
            tabs.append(button);
        }

        const content = panel.querySelector(':scope > .window-panel__content');
        const anchor = tabsConfig.after ? content?.querySelector(tabsConfig.after) : null;
        if (anchor) anchor.after(tabs);
        else content?.prepend(tabs);
    }
}
