class CompactQueueUI extends CompactChipStripUI {
    getItems() {
        const activeMyte = this.parent.getActiveMyte?.();
        return activeMyte?.queue?.queue ?? [];
    }

    getQueueTitle(item) {
        return item.getQueueTitle?.() ||
            item.constructor?.metadata?.label ||
            item.constructor?.name?.replace(/Action$/, '') ||
            'Action';
    }

    getQueueDescription(item) {
        return item.getQueueDescription?.() || '';
    }

    getShortLabel(item) {
        const explicit = item.constructor?.metadata?.labelShort;
        if (explicit) {
            return explicit;
        }

        const words = this.getQueueTitle(item)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean);

        if (words.length === 0) return 'Q';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    getProgressRatio(item, index) {
        if (index !== 0) {
            return null;
        }

        if (typeof item.getProgress === 'function') {
            return Utility.clamp(item.getProgress(), 0, 1);
        }

        if (!item.duration || item.duration <= 0 || item.currentDuration === -1) {
            return null;
        }

        return Utility.clamp(1 - (item.currentDuration / Math.max(item.duration, 1)), 0, 1);
    }

    getChipConfig(item, index) {
        const title = this.getQueueTitle(item);
        const description = this.getQueueDescription(item);
        const progressRatio = this.getProgressRatio(item, index);
        const progressPercent = progressRatio == null ? null : Math.round(progressRatio * 100);
        const tooltipLines = [];

        if (description) {
            tooltipLines.push(description);
        }

        tooltipLines.push(index === 0 ? 'Current action' : `Queued #${index + 1}`);

        if (progressPercent != null) {
            tooltipLines.push(`Progress: ${progressPercent}%`);
        }

        tooltipLines.push('Hold to cancel.');

        return {
            key: `queue-${index}`,
            item,
            index,
            className: `queue-chip ${item.constructor?.metadata?.category || ''}${index === 0 ? ' is-current' : ''}`,
            label: title,
            shortLabel: this.getShortLabel(item),
            badgeText: String(index + 1),
            progressRatio,
            cancellable: true,
            tooltipTitle: title,
            tooltipLines
        };
    }

    cancelItem(item, index) {
        const activeMyte = this.parent.getActiveMyte?.();
        if (!activeMyte?.queue) {
            return false;
        }

        if (index === 0) {
            activeMyte.queue.removeCurrentAction?.();
            return true;
        }

        if (Array.isArray(activeMyte.queue.queue)) {
            activeMyte.queue.queue.splice(index, 1);
            return true;
        }

        return false;
    }
}
